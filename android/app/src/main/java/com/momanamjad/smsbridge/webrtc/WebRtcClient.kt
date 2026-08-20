package com.momanamjad.smsbridge.webrtc

import android.content.Context
import android.util.Log
import com.momanamjad.smsbridge.sync.SocketManager
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.*
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class WebRtcClient(
    private val context: Context,
    private val signalingClient: SocketManager,
    private val callId: String
) {
    companion object {
        private const val TAG = "WebRtcClient"
        private var factory: PeerConnectionFactory? = null

        @Synchronized
        private fun getOrCreateFactory(context: Context): PeerConnectionFactory {
            if (factory == null) {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(context)
                        .setEnableInternalTracer(true)
                        .createInitializationOptions()
                )
                factory = PeerConnectionFactory.builder()
                    .setOptions(PeerConnectionFactory.Options())
                    .createPeerConnectionFactory()
            }
            return factory!!
        }
    }

    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var localAudioSource: AudioSource? = null
    
    private var localSdpOffer: String? = null
    private var localSdpAnswer: String? = null
    private val gatheredIceCandidates = CopyOnWriteArrayList<String>()

    suspend fun initialize(): Boolean {
        Log.i(TAG, "Initializing WebRtcClient for callId=$callId")
        return try {
            val peerConnectionFactory = getOrCreateFactory(context)
            
            // Build PeerConnection constraints and RTCConfiguration
            // Since it's local network only, no internet, we can use empty iceServers or a default stun
            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
            )
            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            }

            val observer = object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                    Log.d(TAG, "onSignalingChange state=$state")
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    Log.i(TAG, "onIceConnectionChange state=$state")
                    if (state == PeerConnection.IceConnectionState.DISCONNECTED ||
                        state == PeerConnection.IceConnectionState.FAILED) {
                        Log.w(TAG, "WebRTC Connection lost, attempting recovery...")
                    }
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {
                    Log.d(TAG, "onIceConnectionReceivingChange receiving=$receiving")
                }

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                    Log.d(TAG, "onIceGatheringChange state=$state")
                }

                override fun onIceCandidate(candidate: IceCandidate?) {
                    if (candidate != null) {
                        Log.d(TAG, "onIceCandidate: gathered candidate=${candidate.sdp}")
                        val candidateJson = org.json.JSONObject().apply {
                            put("candidate", candidate.sdp)
                            put("sdpMid", candidate.sdpMid)
                            put("sdpMLineIndex", candidate.sdpMLineIndex)
                        }
                        val candidateStr = candidateJson.toString()
                        gatheredIceCandidates.add(candidateStr)

                        // Relay Candidate to Backend
                        signalingClient.emit("webrtc:ice-candidate", mapOf(
                            "call_id" to callId,
                            "candidate" to mapOf(
                                "candidate" to candidate.sdp,
                                "sdpMid" to candidate.sdpMid,
                                "sdpMLineIndex" to candidate.sdpMLineIndex
                            )
                        ))
                    }
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

                override fun onAddStream(stream: MediaStream?) {
                    Log.i(TAG, "onAddStream: remote stream added")
                    val track = stream?.audioTracks?.getOrNull(0)
                    if (track != null) {
                        WebRtcCallManager.audioManager.playRemoteAudio(track)
                    }
                }

                override fun onRemoveStream(stream: MediaStream?) {}

                override fun onDataChannel(channel: DataChannel?) {}

                override fun onRenegotiationNeeded() {
                    Log.d(TAG, "onRenegotiationNeeded")
                }

                override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {
                    Log.i(TAG, "onAddTrack: remote track received")
                    val track = receiver?.track() as? AudioTrack
                    if (track != null) {
                        WebRtcCallManager.audioManager.playRemoteAudio(track)
                    }
                }

                override fun onTrack(transceiver: RtpTransceiver?) {
                    val track = transceiver?.receiver?.track() as? AudioTrack
                    if (track != null) {
                        Log.i(TAG, "onTrack: remote audio track received")
                        WebRtcCallManager.audioManager.playRemoteAudio(track)
                    }
                }
            }

            val pc = peerConnectionFactory.createPeerConnection(rtcConfig, observer)
            if (pc == null) {
                Log.e(TAG, "Failed to create PeerConnection")
                return false
            }
            peerConnection = pc

            // Create local audio stream and track
            val audioConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("echoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("noiseSuppression", "true"))
            }
            localAudioSource = peerConnectionFactory.createAudioSource(audioConstraints)
            localAudioTrack = peerConnectionFactory.createAudioTrack("local_audio_track_${callId}", localAudioSource).apply {
                setEnabled(true)
            }

            // Start Audio capture and add track
            WebRtcCallManager.audioManager.startAudioCapture(localAudioTrack!!)
            pc.addTrack(localAudioTrack!!, listOf("local_stream_${callId}"))

            true
        } catch (e: Exception) {
            Log.e(TAG, "Error in initialize: ${e.message}", e)
            false
        }
    }

    suspend fun createOffer(): String = suspendCancellableCoroutine { cont ->
        val pc = peerConnection
        if (pc == null) {
            cont.resumeWithException(IllegalStateException("PeerConnection not initialized"))
            return@suspendCancellableCoroutine
        }

        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        }

        pc.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        Log.i(TAG, "SetLocalDescription success for Offer")
                        localSdpOffer = desc.description
                        cont.resume(desc.description)
                    }
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(reason: String?) {
                        cont.resumeWithException(Exception("setLocalDescription failure: $reason"))
                    }
                }, desc)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(reason: String?) {
                cont.resumeWithException(Exception("createOffer failure: $reason"))
            }
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    suspend fun createAnswer(): String = suspendCancellableCoroutine { cont ->
        val pc = peerConnection
        if (pc == null) {
            cont.resumeWithException(IllegalStateException("PeerConnection not initialized"))
            return@suspendCancellableCoroutine
        }

        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        }

        pc.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        Log.i(TAG, "SetLocalDescription success for Answer")
                        localSdpAnswer = desc.description
                        cont.resume(desc.description)
                    }
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(reason: String?) {
                        cont.resumeWithException(Exception("setLocalDescription failure: $reason"))
                    }
                }, desc)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(reason: String?) {
                cont.resumeWithException(Exception("createAnswer failure: $reason"))
            }
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    suspend fun setRemoteDescription(sdp: String): Boolean = suspendCancellableCoroutine { cont ->
        val pc = peerConnection
        if (pc == null) {
            cont.resume(false)
            return@suspendCancellableCoroutine
        }

        // Determine if it is offer or answer based on signaling state
        val sdpType = if (pc.signalingState() == PeerConnection.SignalingState.HAVE_LOCAL_OFFER) {
            SessionDescription.Type.ANSWER
        } else {
            SessionDescription.Type.OFFER
        }

        val desc = SessionDescription(sdpType, sdp)
        pc.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                Log.i(TAG, "setRemoteDescription success for $sdpType")
                cont.resume(true)
            }
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(reason: String?) {
                Log.e(TAG, "setRemoteDescription failure: $reason")
                cont.resume(false)
            }
        }, desc)
    }

    suspend fun addIceCandidate(candidateJsonStr: String): Boolean {
        val pc = peerConnection ?: return false
        return try {
            val json = org.json.JSONObject(candidateJsonStr)
            val sdp = json.getString("candidate")
            val sdpMid = json.getString("sdpMid")
            val sdpMLineIndex = json.getInt("sdpMLineIndex")
            val candidate = IceCandidate(sdpMid, sdpMLineIndex, sdp)
            
            pc.addIceCandidate(candidate)
            Log.d(TAG, "Successfully added remote ICE candidate")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error adding ICE candidate: ${e.message}", e)
            false
        }
    }

    fun close() {
        Log.i(TAG, "Closing WebRtcClient resources")
        try {
            localAudioTrack?.setEnabled(false)
            localAudioSource?.dispose()
            peerConnection?.close()
            
            localAudioTrack = null
            localAudioSource = null
            peerConnection = null
        } catch (e: Exception) {
            Log.e(TAG, "Error during close", e)
        }
    }

    fun setAudioEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun getSdpOffer(): String? = localSdpOffer

    fun getSdpAnswer(): String? = localSdpAnswer

    fun getIceCandidates(): List<String> = gatheredIceCandidates.toList()
}
