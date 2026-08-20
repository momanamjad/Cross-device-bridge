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
    
    private let ws = WebSocketService.shared
    private let webrtc = WebRTCService()
    
    init() {
        setupWebSocketListeners()
        setupWebRTCListeners()
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
        
        ws.onCallEnded = { [weak self] _ in
            DispatchQueue.main.async {
                self?.cleanupCall()
            }
        }
        
        ws.onWebRTCOffer = { [weak self] callId, sdp in
            Task {
                guard let answerSdp = try? await self?.webrtc.processOfferAndAnswer(sdpOffer: sdp) else { return }
                self?.ws.emit("webrtc:answer", [
                    "call_id": callId,
                    "sdp_answer": answerSdp
                ])
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
}
