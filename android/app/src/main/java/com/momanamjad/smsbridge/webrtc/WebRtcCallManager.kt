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
    private val repository by lazy { WebRtcRepository() }
    
    val audioManager by lazy { AudioManager(context) }
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
        Log.i(TAG, "Bridge: Headless incoming call forwarding active for $callerNumber")
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
        val logFile = java.io.File(context.filesDir, "node_out.txt")
        val cleanNumber = phoneNumber.replace(" ", "").replace("-", "").trim()
        Log.i(TAG, "WebRtcCallManager: makeOutgoingCall callId=$callId, phoneNumber=$cleanNumber")
        try {
            logFile.appendText("\n[${java.util.Date()}] [Bridge Dialer] Received makeOutgoingCall: callId=$callId to $cleanNumber\n")
        } catch (_: Exception) {}

        currentCallId = callId
        callerOrPhoneNum = cleanNumber
        isIncomingCall = false
        startTimeMillis = System.currentTimeMillis()
        updateState(CallState.RingingOutgoing(cleanNumber))

        // Trigger cellular SIM dial
        dialCellularCall(cleanNumber)

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
                try {
                    logFile.appendText("[${java.util.Date()}] [WebRTC] Generated offer for callId=$callId\n")
                } catch (_: Exception) {}
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create offer", e)
                try {
                    logFile.appendText("[${java.util.Date()}] [WebRTC] Failed to create offer: ${e.message}\n")
                } catch (_: Exception) {}
                updateState(CallState.Failed(callId, "SDP Offer failed"))
            }
        } else {
            try {
                logFile.appendText("[${java.util.Date()}] [WebRTC] Client initialization failed\n")
            } catch (_: Exception) {}
            updateState(CallState.Failed(callId, "WebRTC init failed"))
        }
    }

    private fun dialCellularCall(cleanNumber: String) {
        val logFile = java.io.File(context.filesDir, "node_out.txt")
        val hasCallPhone = context.checkSelfPermission(android.Manifest.permission.CALL_PHONE) == android.content.pm.PackageManager.PERMISSION_GRANTED
        try {
            logFile.appendText("[${java.util.Date()}] [Bridge Dialer] CALL_PHONE permission: $hasCallPhone\n")
        } catch (_: Exception) {}

        if (!hasCallPhone) {
            try {
                logFile.appendText("[${java.util.Date()}] [Bridge Dialer] ERROR: CALL_PHONE permission is NOT GRANTED on Android! Open app and tap 'Grant permissions'.\n")
            } catch (_: Exception) {}
            return
        }

        val uri = android.net.Uri.fromParts("tel", cleanNumber, null)
        var placed = false

        // Method 1: TelecomManager with explicit PhoneAccountHandle (bypasses dual-SIM picker on Realme)
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
            if (telecomManager != null) {
                val extras = android.os.Bundle().apply {
                    putBoolean(android.telecom.TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, false)
                }
                if (context.checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    val accounts = telecomManager.callCapablePhoneAccounts
                    if (!accounts.isNullOrEmpty()) {
                        extras.putParcelable(android.telecom.TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, accounts[0])
                        try {
                            logFile.appendText("[${java.util.Date()}] [Bridge Dialer] Bound to SIM account: ${accounts[0].id}\n")
                        } catch (_: Exception) {}
                    }
                }
                telecomManager.placeCall(uri, extras)
                placed = true
                Log.i(TAG, "Placed cellular call using TelecomManager")
                try {
                    logFile.appendText("[${java.util.Date()}] [Bridge Dialer] SUCCESS: TelecomManager.placeCall dispatched to cellular network for $cleanNumber\n")
                } catch (_: Exception) {}
            }
        } catch (e: Throwable) {
            Log.w(TAG, "TelecomManager.placeCall failed, trying Intent.ACTION_CALL", e)
            try {
                logFile.appendText("[${java.util.Date()}] [Bridge Dialer] TelecomManager.placeCall threw: ${e.message}\n")
            } catch (_: Exception) {}
        }

        // Method 2: Intent.ACTION_CALL with NEW_TASK
        if (!placed) {
            try {
                val callIntent = Intent(Intent.ACTION_CALL).apply {
                    data = uri
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                context.startActivity(callIntent)
                placed = true
                Log.i(TAG, "Placed cellular call using Intent.ACTION_CALL")
                try {
                    logFile.appendText("[${java.util.Date()}] [Bridge Dialer] SUCCESS: Intent.ACTION_CALL dispatched for $cleanNumber\n")
                } catch (_: Exception) {}
            } catch (e2: Throwable) {
                Log.e(TAG, "Failed to dial SIM with Intent.ACTION_CALL", e2)
                try {
                    logFile.appendText("[${java.util.Date()}] [Bridge Dialer] Intent.ACTION_CALL failed: ${e2.message}\n")
                } catch (_: Exception) {}
            }
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

        // Programmatically terminate the native cellular SIM call if active
        try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
            if (context.checkSelfPermission(android.Manifest.permission.ANSWER_PHONE_CALLS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                @Suppress("DEPRECATION")
                telecomManager.endCall()
                Log.i(TAG, "Cellular call terminated via TelecomManager")
            } else {
                Log.w(TAG, "ANSWER_PHONE_CALLS permission not granted. Cannot end cellular call.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to end cellular call via TelecomManager, trying reflection", e)
            try {
                val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as android.telephony.TelephonyManager
                val method = telephonyManager.javaClass.getDeclaredMethod("getITelephony")
                method.isAccessible = true
                val telephonyService = method.invoke(telephonyManager)
                val telephonyServiceClass = Class.forName(telephonyService.javaClass.name)
                val endCallMethod = telephonyServiceClass.getDeclaredMethod("endCall")
                endCallMethod.isAccessible = true
                endCallMethod.invoke(telephonyService)
                Log.i(TAG, "Cellular call terminated via ITelephony reflection")
            } catch (reflectionExc: Exception) {
                Log.e(TAG, "ITelephony reflection fallback failed", reflectionExc)
            }
        }

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
