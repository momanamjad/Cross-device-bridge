import Foundation
import Combine
import WebRTC

class CallViewModel: ObservableObject {
    @Published var callState: CallState = .idle
    @Published var callHistory: [Call] = []
    @Published var callDuration: TimeInterval = 0
    @Published var audioOutputSpeaker = true
    @Published var micMuted = false
    
    private var timer: Timer?
    private var callStartTime: Date?
    private var activeCallId: String?
    private var historyTimer: Timer?
    
    private let ws = WebSocketService.shared
    private let webrtc = WebRTCService()
    
    init() {
        setupWebSocketListeners()
        setupWebRTCListeners()
        
        // Fetch history on app launch
        fetchCallHistory()
        
        // Refresh every 5 seconds
        self.historyTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.fetchCallHistory()
        }
    }
    
    private func setupWebSocketListeners() {
        ws.onIncomingCall = { [weak self] info in
            DispatchQueue.main.async {
                self?.callState = .ringing(info)
                self?.activeCallId = info.callId
                AudioService.shared.startRingtone()
            }
        }
        
        ws.onCallConnected = { [weak self] callId in
            DispatchQueue.main.async {
                if case .connecting(let info) = self?.callState {
                    self?.callStartTime = Date()
                    self?.callState = .connected(info, startTime: Date())
                    self?.startTimer()
                    AudioService.shared.configureAudioSessionForCall()
                }
            }
        }
        
        ws.onCallEnded = { [weak self] callId, duration in
            DispatchQueue.main.async {
                self?.handleCallEnded(callId: callId, duration: duration)
            }
        }
        
        ws.onWebRTCOffer = { [weak self] callId, sdp in
            Task {
                guard let self = self else { return }
                self.webrtc.initializeConnection()
                do {
                    let answerSdp = try await self.webrtc.processOfferAndAnswer(sdpOffer: sdp)
                    self.ws.emit("webrtc:answer", [
                        "call_id": callId,
                        "sdp_answer": answerSdp
                    ])
                } catch {
                    print("❌ Error processing offer and answer: \(error)")
                }
            }
        }
        
        ws.onICECandidate = { [weak self] _, dict in
            guard let sdp = dict["candidate"] as? String ?? (dict["candidate"] as? [String: Any])?["candidate"] as? String,
                  let sdpMid = dict["sdpMid"] as? String ?? (dict["candidate"] as? [String: Any])?["sdpMid"] as? String,
                  let sdpMLineIndex = dict["sdpMLineIndex"] as? Int32 ?? (dict["candidate"] as? [String: Any])?["sdpMLineIndex"] as? Int32 else { return }
            self?.webrtc.addRemoteIceCandidate(sdp: sdp, sdpMid: sdpMid, sdpMLineIndex: sdpMLineIndex)
        }
    }
    
    private func setupWebRTCListeners() {
        webrtc.onLocalIceCandidate = { [weak self] candidate in
            guard let callId = self?.activeCallId else { return }
            self?.ws.emit("webrtc:ice-candidate", [
                "call_id": callId,
                "candidate": [
                    "candidate": candidate.sdp,
                    "sdpMid": candidate.sdpMid ?? "",
                    "sdpMLineIndex": candidate.sdpMLineIndex
                ]
            ])
        }
    }
    
    func makeCall(phoneNumber: String) {
        let callId = UUID().uuidString.lowercased()
        activeCallId = callId
        
        let info = CallInfo(callId: callId, callerId: phoneNumber, callerName: nil, isIncoming: false, timestamp: Date())
        callState = .connecting(info)
        
        ws.emit("call:outgoing", [
            "call_id": callId,
            "phone_number": phoneNumber
        ])
        
        webrtc.initializeConnection()
    }
    
    func acceptCall() {
        guard let callId = activeCallId, case .ringing(let info) = callState else { return }
        
        AudioService.shared.stopRingtone()
        callState = .connecting(info)
        
        ws.emit("call:accept", ["call_id": callId])
        webrtc.initializeConnection()
    }
    
    func rejectCall() {
        guard let callId = activeCallId else { return }
        AudioService.shared.stopRingtone()
        ws.emit("call:reject", ["call_id": callId])
        callState = .idle
        activeCallId = nil
    }
    
    func endCall() {
        guard let callId = activeCallId else { return }
        ws.emit("call:hangup", ["call_id": callId])
        cleanupCall()
    }
    
    func toggleSpeaker() {
        audioOutputSpeaker.toggle()
        AudioService.shared.setSpeakerEnabled(audioOutputSpeaker)
    }
    
    private func startTimer() {
        callDuration = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let start = self?.callStartTime else { return }
            self?.callDuration = Date().timeIntervalSince(start)
        }
    }
    
    private func cleanupCall() {
        timer?.invalidate()
        timer = nil
        webrtc.close()
        AudioService.shared.stopRingtone()
        
        if case .connected(let info, let start) = callState {
            let record = Call(callId: info.callId, number: info.callerId, name: nil, duration: Date().timeIntervalSince(start), timestamp: Date(), isIncoming: info.isIncoming)
            callHistory.insert(record, at: 0)
        }
        
        callState = .idle
        activeCallId = nil
        callDuration = 0
    }
    
    func fetchHistory(host: String, port: Int, token: String) {
        Task {
            do {
                let history = try await BackendService.shared.fetchCalls(host: host, port: port, token: token)
                DispatchQueue.main.async {
                    self.callHistory = history
                }
            } catch {
                print("Failed to fetch call history: \(error)")
            }
        }
    }

    private func handleCallEnded(callId: String, duration: TimeInterval) {
        print("🔴 Handling call ended: \(callId), duration: \(duration)s")
        
        // Stop timer
        timer?.invalidate()
        timer = nil
        callDuration = duration
        
        // Close WebRTC
        webrtc.close()
        AudioService.shared.stopRingtone()
        
        // Update state
        var currentCallInfo: CallInfo? = nil
        switch callState {
        case .ringing(let info), .connecting(let info), .connected(let info, _), .ended(let info, _):
            currentCallInfo = info
        case .idle:
            break
        }
        
        callState = .idle
        activeCallId = nil
        
        // Add to history
        if let callInfo = currentCallInfo {
            let callRecord = Call(
                callId: callId,
                number: callInfo.callerId,
                name: callInfo.callerName,
                duration: duration,
                timestamp: Date(),
                isIncoming: callInfo.isIncoming
            )
            callHistory.insert(callRecord, at: 0)
        }
        
        print("✅ Call ended and recorded in history")
    }

    func fetchCallHistory() {
        let token = UserDefaults.standard.string(forKey: "api_token") ?? ""
        let realmIp = UserDefaults.standard.string(forKey: "server_ip") ?? ""
        let serverPort = UserDefaults.standard.integer(forKey: "server_port")
        let port = serverPort == 0 ? 9000 : serverPort
        
        guard !realmIp.isEmpty else {
            print("⚠️ No Realme IP configured")
            return
        }
        
        let url = URL(string: "http://\(realmIp):\(port)/api/calls/history")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let error = error {
                print("❌ Fetch history error: \(error.localizedDescription)")
                return
            }
            
            guard let data = data else {
                print("❌ No data received")
                return
            }
            
            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let calls = try decoder.decode([Call].self, from: data)
                
                DispatchQueue.main.async {
                    self?.callHistory = calls
                    print("✅ Call history fetched: \(calls.count) calls")
                }
            } catch {
                print("❌ Decode error: \(error.localizedDescription)")
            }
        }.resume()
    }
}
