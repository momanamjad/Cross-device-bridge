package com.momanamjad.smsbridge.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import com.momanamjad.smsbridge.sync.NetworkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
            ?.trim()
            .orEmpty()
            .ifBlank { "unknown" }
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                NetworkManager.enqueueCall(number, state, System.currentTimeMillis())

                if (state == TelephonyManager.EXTRA_STATE_RINGING) {
                    val app = com.momanamjad.smsbridge.BridgeApp.instance
                    val url = app.settings.backendUrl
                    val token = app.settings.apiToken
                    val deviceId = app.settings.deviceId

                    // 1. Extract caller number (done in 'number' variable)
                    Log.i(TAG, "Step 1: Extracted caller number: $number")

                    // 2. Create call ID (UUID)
                    val localCallId = java.util.UUID.randomUUID().toString()
                    Log.i(TAG, "Step 2: Generated local call ID (UUID): $localCallId")

                    // 3. Initialize WebRtcCallManager (if not already done)
                    val callManager = com.momanamjad.smsbridge.webrtc.WebRtcCallManager
                    Log.i(TAG, "Step 3: WebRtcCallManager referenced and initialized.")

                    // 4. Send to backend: POST /api/calls/incoming
                    var finalCallId = localCallId
                    if (url.isNotBlank() && token.isNotBlank() && app.settings.callsEnabled) {
                        Log.i(TAG, "Step 4: Sending POST to backend at $url/api/calls/incoming")
                        val api = com.momanamjad.smsbridge.api.RetrofitClient.create(url)
                        val auth = "Bearer $token"

                        try {
                            val response = api.postWebRtcIncoming(
                                auth,
                                com.momanamjad.smsbridge.api.WebRtcIncomingRequest(
                                    callerNumber = number,
                                    deviceId = deviceId,
                                    timestamp = System.currentTimeMillis()
                                )
                            )

                            if (response.isSuccessful) {
                                val returnedCallId = response.body()?.callId
                                Log.i(TAG, "Backend call succeeded. Returned call ID: $returnedCallId")
                                if (!returnedCallId.isNullOrBlank()) {
                                    finalCallId = returnedCallId
                                }
                            } else {
                                Log.e(TAG, "Failed to register WebRTC call on backend, code=${response.code()}")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Exception during POST to /api/calls/incoming", e)
                        }
                    } else {
                        Log.w(TAG, "Backend configurations missing or calls disabled. URL: $url, callsEnabled: ${app.settings.callsEnabled}")
                    }

                    // 5. Trigger: handleIncomingCall(callId, callerNumber)
                    Log.i(TAG, "Step 5: Triggering handleIncomingCall with callId=$finalCallId, callerNumber=$number")
                    callManager.handleIncomingCall(finalCallId, number)
                } else if (state == TelephonyManager.EXTRA_STATE_IDLE) {
                    Log.i(TAG, "Telephony: Idle, hanging up active WebRTC session")
                    com.momanamjad.smsbridge.webrtc.WebRtcCallManager.endCurrentCall()
                }
            } catch (e: Exception) {
                Log.e(TAG, "failed to handle call", e)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private const val TAG = "CallReceiver"
    }
}
