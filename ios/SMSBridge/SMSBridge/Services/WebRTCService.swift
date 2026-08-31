import Foundation
import WebRTC

class WebRTCService: NSObject {
    private var peerConnection: RTCPeerConnection?
    private let factory: RTCPeerConnectionFactory
    private var audioTrack: RTCAudioTrack?
    private(set) var videoTrack: RTCVideoTrack?
    
    var onLocalIceCandidate: ((RTCIceCandidate) -> Void)?
    var onAudioTrackAdded: (() -> Void)?
    var onVideoTrackAdded: ((RTCVideoTrack) -> Void)?
    
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
        Task {
            do {
                try await initialize()
            } catch {
                print("❌ Failed to initialize WebRTC connection: \(error)")
            }
        }
    }
    
    func initialize() async throws {
        // 1. Request microphone permission
        await AudioService.shared.requestMicrophonePermission()
        
        // 2. Setup audio session
        AudioService.shared.setupAudioSession()
        
        // 3. Create peer connection with audio constraints
        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": "true"
            ],
            optionalConstraints: nil
        )
        
        peerConnection = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: self
        )
        
        // 4. Create audio source and track
        let audioSource = factory.audioSource(with: nil)
        audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        
        // 5. Add to peer connection with stream ID
        if let audioTrack = audioTrack {
            peerConnection?.add(audioTrack, streamIds: ["stream0"])
        }
        
        print("✅ Audio track added to WebRTC peer connection")
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
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "OfferToReceiveAudio": "true",
                "OfferToReceiveVideo": "true"
            ],
            optionalConstraints: nil
        )
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
        print("✅ Remote media stream received from Realme")
        if let audioTrack = stream.audioTracks.first {
            audioTrack.isEnabled = true
            print("✅ Remote audio track enabled and playing")
            onAudioTrackAdded?()
        }
        if let vTrack = stream.videoTracks.first {
            print("✅ Remote video track received")
            self.videoTrack = vTrack
            onVideoTrackAdded?(vTrack)
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
