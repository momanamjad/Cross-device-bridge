import Foundation

enum CallState: Equatable {
    case idle
    case ringing(CallInfo)
    case connecting(CallInfo)
    case connected(CallInfo, startTime: Date)
    case ended(CallInfo, duration: TimeInterval)
    
    static func == (lhs: CallState, rhs: CallState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.ringing(let a), .ringing(let b)): return a.callId == b.callId
        case (.connecting(let a), .connecting(let b)): return a.callId == b.callId
        case (.connected(let a, _), .connected(let b, _)): return a.callId == b.callId
        case (.ended(let a, _), .ended(let b, _)): return a.callId == b.callId
        default: return false
        }
    }
}

struct CallInfo: Codable, Equatable {
    let callId: String
    let callerId: String
    let callerName: String?
    let isIncoming: Bool
    let timestamp: Date
}

struct Call: Identifiable, Codable, Equatable {
    var id: String { callId }
    let callId: String
    let number: String
    let name: String?
    let duration: TimeInterval
    let timestamp: Date
    let isIncoming: Bool
}

struct SMSMessage: Identifiable, Codable, Equatable {
    let id: String
    let sender: String
    let content: String
    let timestamp: Date
}
