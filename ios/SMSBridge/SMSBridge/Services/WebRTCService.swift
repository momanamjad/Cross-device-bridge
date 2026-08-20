import Foundation
import WebRTC

class WebRTCService: NSObject {
    private var peerConnection: RTCPeerConnection?
    private let factory: RTCPeerConnectionFactory
    
    var onLocalIceCandidate: ((RTCIceCandidate) -> Void)?
    var onAudioTrackAdded: (() -> Void)?
    
    override init() {
        // Initialize WebRTC Factory with default options
        let videoEncoderFactory = RTCDefaultVideoEncoderFactory()
        let videoDecoderFactory = RTCDefaultVideoDecoderFactory()
        self.factory = RTCPeerConnectionFactory(
            encoderFactory: videoEncoderFactory,
            decoderFactory: videoDecoderFactory
        )
        super.init()
    }
    
    func initializeConnection() {
        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        
        peerConnection = factory.peerConnection(with: config, constraints: constraints, delegate: self)
        
        // Setup local audio track and add it to peer connection
        let audioSource = factory.audioSource(with: nil)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        peerConnection?.add(audioTrack, streamIds: ["stream0"])
    }
    
    func processOfferAndAnswer(sdpOffer: String) async throws -> String {
        let remoteDesc = RTCSessionDescription(type: .offer, sdp: sdpOffer)
        
        // 1. Set Remote Description (SDP Offer)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection?.setRemoteDescription(remoteDesc) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
        
        // 2. Create SDP Answer
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let localDesc = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            peerConnection?.answer(for: constraints) { sdp, error in
                if let sdp = sdp {
                    continuation.resume(returning: sdp)
                } else {
                    continuation.resume(throwing: error ?? NSError(domain: "WebRTCService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create SDP answer"]))
                }
            }
        }
        
        // 3. Set Local Description (SDP Answer)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peerConnection?.setLocalDescription(localDesc) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
        
        return localDesc.sdp
    }
    
    func addRemoteIceCandidate(sdp: String, sdpMid: String?, sdpMLineIndex: Int32) {
        let candidate = RTCIceCandidate(sdp: sdp, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
        peerConnection?.add(candidate)
    }
    
    func close() {
        peerConnection?.close()
        peerConnection = nil
    }
}

extension WebRTCService: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        if !stream.audioTracks.isEmpty {
            onAudioTrackAdded?()
        }
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange connectionState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange iceState: RTCIceGatheringState) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        onLocalIceCandidate?(candidate)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
