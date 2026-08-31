import Foundation
import Combine
import SocketIO
import UIKit

class WebSocketService: ObservableObject {
    static let shared = WebSocketService()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    @Published var isConnected = false
    
    var onIncomingCall: ((CallInfo) -> Void)?
    var onCallConnected: ((String) -> Void)?
    var onCallEnded: ((String, TimeInterval) -> Void)?
    var onWebRTCOffer: ((String, String) -> Void)?
    var onICECandidate: ((String, [String: Any]) -> Void)?
    var onSMSReceived: ((SMSMessage) -> Void)?
    
    private init() {
        setupBackgroundHandling()
    }
    
    func connect(host: String, port: Int, token: String, secret: String) {
        disconnect()
        
        guard let url = URL(string: "http://\(host):\(port)") else { return }
        
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .connectParams(["token": token]),
            .reconnects(true),
            .reconnectWait(2)
        ])
        
        socket = manager?.defaultSocket
        
        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = true
            }
        }
        
        socket?.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = false
            }
        }
        
        func decrypt(_ data: [Any]) -> [String: Any]? {
            guard let wrapper = data.first as? [String: Any],
                  let encryptedStr = wrapper["data"] as? String else { return nil }
            guard let decrypted = try? CryptoHelper.decryptPayload(encryptedStr, secret: secret),
                  let dict = try? JSONSerialization.jsonObject(with: decrypted) as? [String: Any] else { return nil }
            return dict
        }
        
        socket?.on("call:incoming") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let callId = dict["call_id"] as? String,
                  let callerNumber = dict["caller_number"] as? String else { return }
            
            let info = CallInfo(callId: callId, callerId: callerNumber, callerName: nil, isIncoming: true, timestamp: Date())
            self?.onIncomingCall?(info)
        }
        
        socket?.on("call:connected") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let callId = dict["call_id"] as? String else { return }
            self?.onCallConnected?(callId)
        }
        
        socket?.on("call:hangup") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let callId = dict["call_id"] as? String else { return }
            let duration = dict["duration"] as? Double ?? dict["duration_seconds"] as? Double ?? 0.0
            print("✅ Call ended event received: \(callId), duration: \(duration)s")
            self?.onCallEnded?(callId, duration)
        }
        
        socket?.on("webrtc:offer") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let callId = dict["call_id"] as? String,
                  let sdp = dict["sdp_offer"] as? String else { return }
            self?.onWebRTCOffer?(callId, sdp)
        }
        
        socket?.on("webrtc:ice-candidate") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let callId = dict["call_id"] as? String,
                  let candidate = dict["candidate"] as? [String: Any] else { return }
            self?.onICECandidate?(callId, candidate)
        }
        
        socket?.on("message:new") { [weak self] data, _ in
            guard let dict = decrypt(data),
                  let id = dict["id"] as? String,
                  let sender = dict["sender"] as? String,
                  let content = dict["message"] as? String ?? dict["content"] as? String else { return }
            
            let message = SMSMessage(id: id, sender: sender, content: content, timestamp: Date())
            self?.onSMSReceived?(message)
            
            // Confirm message receipt to server
            self?.emit("message:confirm", ["id": id])
        }

        
        socket?.connect()
    }
    
    func emit(_ event: String, _ items: [String: Any]) {
        guard let secret = UserDefaults.standard.string(forKey: "register_secret") else {
            socket?.emit(event, with: [items], completion: nil)
            return
        }
        
        do {
            let data = try JSONSerialization.data(withJSONObject: items)
            let encrypted = try CryptoHelper.encryptPayload(data, secret: secret)
            socket?.emit(event, with: [["data": encrypted]], completion: nil)
        } catch {
            print("Encryption failed for emit: \(error)")
            socket?.emit(event, with: [items], completion: nil)
        }
    }
    
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    private func setupBackgroundHandling() {
        NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func appDidEnterBackground() {
        backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.endBackgroundTask()
        }
    }

    @objc private func appWillEnterForeground() {
        endBackgroundTask()
    }

    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    func disconnect() {
        socket?.disconnect()
        manager = nil
        socket = nil
        isConnected = false
    }
}
