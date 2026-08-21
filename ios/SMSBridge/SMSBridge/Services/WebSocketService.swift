import Foundation
import Combine
import SocketIO

class WebSocketService: ObservableObject {
    static let shared = WebSocketService()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    @Published var isConnected = false
    
    var onIncomingCall: ((CallInfo) -> Void)?
    var onCallConnected: ((String) -> Void)?
    var onCallEnded: ((String) -> Void)?
    var onWebRTCOffer: ((String, String) -> Void)?
    var onICECandidate: ((String, [String: Any]) -> Void)?
    var onSMSReceived: ((SMSMessage) -> Void)?
    
    private init() {}
    
    func connect(host: String, port: Int, token: String) {
        disconnect()
        
        guard let url = URL(string: "http://\(host):\(port)") else { return }
        
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .connectParams(["token": token]),
            .reconnects(true),
            .reconnectDelay(2)
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
        
        socket?.on("call:incoming") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["call_id"] as? String,
                  let callerNumber = dict["caller_number"] as? String else { return }
            
            let info = CallInfo(callId: callId, callerId: callerNumber, callerName: nil, isIncoming: true, timestamp: Date())
            self?.onIncomingCall?(info)
        }
        
        socket?.on("call:connected") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["call_id"] as? String else { return }
            self?.onCallConnected?(callId)
        }
        
        socket?.on("call:hangup") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["call_id"] as? String else { return }
            self?.onCallEnded?(callId)
        }
        
        socket?.on("webrtc:offer") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["call_id"] as? String,
                  let sdp = dict["sdp_offer"] as? String else { return }
            self?.onWebRTCOffer?(callId, sdp)
        }
        
        socket?.on("webrtc:ice-candidate") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let callId = dict["call_id"] as? String,
                  let candidate = dict["candidate"] as? [String: Any] else { return }
            self?.onICECandidate?(callId, candidate)
        }
        
        socket?.on("message:new") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
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
    
    func emit(_ event: String, _ items: Any) {
        socket?.emit(event, with: [items])
    }
    
    func disconnect() {
        socket?.disconnect()
        manager = nil
        socket = nil
        isConnected = false
    }
}
