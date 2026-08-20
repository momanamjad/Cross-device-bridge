package com.momanamjad.smsbridge.webrtc

import android.content.Context
import android.content.Intent
import android.util.Log
import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.data.CallRecord
import com.momanamjad.smsbridge.models.CallState
import com.momanamjad.smsbridge.repositories.WebRtcRepository
import com.momanamjad.smsbridge.sync.SocketManager
import com.momanamjad.smsbridge.ui.VoiceCallActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

object WebRtcCallManager {
    private const val TAG = "WebRtcCallManager"
    
    private val context: Context get() = BridgeApp.instance
    private val repository = WebRtcRepository()
    
    val audioManager = AudioManager(context)
    var webRtcClient: WebRtcClient? = null
        private set

    private val _callState = MutableStateFlow<CallState>(CallState.Idle)
    val callState: StateFlow<CallState> = _callState.asStateFlow()

    private var currentCallId: String? = null
    private var callerOrPhoneNum: String? = null
    private var isIncomingCall = false
    private var startTimeMillis = 0L

    fun getCallState(callId: String): CallState {
        return _callState.value
    }

    private fun updateState(state: CallState) {
        _callState.value = state
        Log.i(TAG, "WebRtcCallManager: State transition to: $state")
    }

    suspend fun handleIncomingCall(callId: String, callerNumber: String) {
        Log.i(TAG, "WebRtcCallManager: handleIncomingCall callId=$callId, callerNumber=$callerNumber")
        currentCallId = callId
        callerOrPhoneNum = callerNumber
        isIncomingCall = true
        startTimeMillis = System.currentTimeMillis()
        updateState(CallState.RingingIncoming(callerNumber))

        // Launch the call screen
        val intent = Intent(context, VoiceCallActivity::class.java).apply {
            putExtra("call_id", callId)
            putExtra("phone_number", callerNumber)
            putExtra("is_incoming", true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    suspend fun acceptIncomingCall(callId: String) {
        Log.i(TAG, "WebRtcCallManager: acceptIncomingCall callId=$callId")
        if (callId != currentCallId) return
        updateState(CallState.Accepting(callId))

        // Create WebRtcClient
        val client = WebRtcClient(context, SocketManager, callId)
        webRtcClient = client
        val success = client.initialize()
        if (success) {
            updateState(CallState.Connecting(callId))
            try {
                // Create offer and transmit to other device via SocketManager
                val offer = client.createOffer()
                SocketManager.emit("webrtc:offer", mapOf(
                    "call_id" to callId,
                    "sdp_offer" to offer
                ))
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create WebRTC offer", e)
                updateState(CallState.Failed(callId, "SDP generation failed"))
            }
        } else {
            updateState(CallState.Failed(callId, "WebRTC initialization failed"))
        }
    }

    suspend fun rejectIncomingCall(callId: String) {
        Log.i(TAG, "WebRtcCallManager: rejectIncomingCall callId=$callId")
        if (callId != currentCallId) return
        SocketManager.emit("call:rejected", mapOf("call_id" to callId))
        cleanupCall(callId, "Rejected")
    }

    suspend fun makeOutgoingCall(callId: String, phoneNumber: String) {
        Log.i(TAG, "WebRtcCallManager: makeOutgoingCall callId=$callId, phoneNumber=$phoneNumber")
        currentCallId = callId
        callerOrPhoneNum = phoneNumber
        isIncomingCall = false
        startTimeMillis = System.currentTimeMillis()
        updateState(CallState.RingingOutgoing(phoneNumber))

        // Launch Call Screen UI
        val intent = Intent(context, VoiceCallActivity::class.java).apply {
            putExtra("call_id", callId)
            putExtra("phone_number", phoneNumber)
            putExtra("is_incoming", false)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)

        // Request CALL_PHONE permission to dial on Realme SIM if available
        if (context.checkSelfPermission(android.Manifest.permission.CALL_PHONE) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try {
                val callIntent = Intent(Intent.ACTION_CALL).apply {
                    data = android.net.Uri.parse("tel:$phoneNumber")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(callIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to dial SIM number", e)
            }
        } else {
            Log.w(TAG, "CALL_PHONE permission is missing. Continuing WebRTC handshake only.")
        }

        // Initialize WebRTC
        val client = WebRtcClient(context, SocketManager, callId)
        webRtcClient = client
        val success = client.initialize()
        if (success) {
            updateState(CallState.Connecting(callId))
            try {
                val offer = client.createOffer()
                SocketManager.emit("webrtc:offer", mapOf(
                    "call_id" to callId,
                    "sdp_offer" to offer
                ))
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create offer", e)
                updateState(CallState.Failed(callId, "SDP Offer failed"))
            }
        } else {
            updateState(CallState.Failed(callId, "WebRTC init failed"))
        }
    }

    suspend fun handleSdpOffer(callId: String, sdp: String) {
        Log.i(TAG, "WebRtcCallManager: handleSdpOffer callId=$callId")
        if (callId != currentCallId) return
        val client = webRtcClient ?: return

        val success = client.setRemoteDescription(sdp)
        if (success) {
            try {
                val answer = client.createAnswer()
                SocketManager.emit("webrtc:answer", mapOf(
                    "call_id" to callId,
                    "sdp_answer" to answer
                ))
            } catch (e: Exception) {
                Log.e(TAG, "Failed to answer offer", e)
            }
        }
    }

    suspend fun handleSdpAnswer(callId: String, sdp: String) {
        Log.i(TAG, "WebRtcCallManager: handleSdpAnswer callId=$callId")
        if (callId != currentCallId) return
        val client = webRtcClient ?: return

        val success = client.setRemoteDescription(sdp)
        if (success) {
            updateState(CallState.Connected(callId, System.currentTimeMillis()))
        }
    }

    suspend fun handleIceCandidate(callId: String, candidate: String) {
        Log.d(TAG, "WebRtcCallManager: handleIceCandidate callId=$callId")
        if (callId != currentCallId) return
        webRtcClient?.addIceCandidate(candidate)
    }

    suspend fun endCall(callId: String) {
        Log.i(TAG, "WebRtcCallManager: endCall callId=$callId")
        if (callId != currentCallId) return
        cleanupCall(callId, "Ended")
    }

    fun muteCall(mute: Boolean) {
        Log.i(TAG, "WebRtcCallManager: muteCall mute=$mute")
        audioManager.setMicrophoneEnabled(!mute)
    }

    fun speakerPhone(enabled: Boolean) {
        Log.i(TAG, "WebRtcCallManager: speakerPhone enabled=$enabled")
        audioManager.setSpeakerEnabled(enabled)
    }

    suspend fun endCurrentCall() {
        currentCallId?.let { endCall(it) }
    }

    private suspend fun cleanupCall(callId: String, reason: String) {
        updateState(CallState.Disconnecting(callId))
        
        audioManager.stopAudioCapture()
        webRtcClient?.close()
        webRtcClient = null

        val duration = if (startTimeMillis > 0L) (System.currentTimeMillis() - startTimeMillis) / 1000 else 0L
        updateState(CallState.Ended(callId, duration))

        // Save Call history
        val record = CallRecord(
            callId = callId,
            callerNumber = callerOrPhoneNum ?: "unknown",
            initiatorDevice = if (isIncomingCall) "realme_c3_1" else "iphone",
            state = reason,
            timestamp = startTimeMillis.takeIf { it > 0 } ?: System.currentTimeMillis(),
            durationSeconds = duration
        )
        try {
            repository.saveCallHistory(record)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save call history record", e)
        }

        currentCallId = null
        callerOrPhoneNum = null
        startTimeMillis = 0L
        
        updateState(CallState.Idle)
    }
}
