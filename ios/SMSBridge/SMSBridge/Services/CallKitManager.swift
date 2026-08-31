import Foundation
import CallKit
import AVFoundation

class CallKitManager: NSObject, ObservableObject {
    static let shared = CallKitManager()
    
    private let provider: CXProvider
    private let callController: CXCallController
    
    var onAnswerCall: ((String) -> Void)?
    var onEndCall: ((String) -> Void)?
    
    private var callUUIDMap: [UUID: String] = [:]
    private var stringCallIDMap: [String: UUID] = [:]
    
    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.phoneNumber]
        
        provider = CXProvider(configuration: configuration)
        callController = CXCallController()
        
        super.init()
        provider.setDelegate(self, queue: nil)
    }
    
    func reportIncomingCall(id: String, handle: String, callerName: String? = nil, completion: @escaping (Error?) -> Void) {
        let uuid = UUID()
        callUUIDMap[uuid] = id
        stringCallIDMap[id] = uuid
        
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .phoneNumber, value: handle)
        update.hasVideo = false
        if let callerName = callerName {
            update.localizedCallerName = callerName
        }
        
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            completion(error)
        }
    }
    
    func endCall(id: String) {
        guard let uuid = stringCallIDMap[id] else { return }
        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        
        callController.request(transaction) { error in
            if let error = error {
                print("Error requesting end call: \(error)")
            }
        }
    }
    
    func answerCall(id: String) {
        guard let uuid = stringCallIDMap[id] else { return }
        let action = CXAnswerCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        
        callController.request(transaction) { error in
            if let error = error {
                print("Error requesting answer call: \(error)")
            }
        }
    }
}

extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        // Stop audio
    }
    
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        if let id = callUUIDMap[action.callUUID] {
            onAnswerCall?(id)
        }
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let id = callUUIDMap[action.callUUID] {
            onEndCall?(id)
        }
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Audio session activated
    }
    
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Audio session deactivated
    }
}
