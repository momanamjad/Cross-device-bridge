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

                    if (url.isNotBlank() && token.isNotBlank() && app.settings.callsEnabled) {
                        val callId = java.util.UUID.randomUUID().toString()
                        Log.i(TAG, "Telephony: Ringing callId=$callId number=$number")
                        val api = com.momanamjad.smsbridge.api.RetrofitClient.create(url)
                        val auth = "Bearer $token"

                        val response = api.postWebRtcIncoming(
                            auth,
                            com.momanamjad.smsbridge.api.WebRtcIncomingRequest(
                                callerNumber = number,
                                deviceId = deviceId,
                                timestamp = System.currentTimeMillis()
                            )
                        )

                        if (response.isSuccessful) {
                            val returnedCallId = response.body()?.callId ?: callId
                            com.momanamjad.smsbridge.webrtc.WebRtcCallManager.handleIncomingCall(returnedCallId, number)
                        } else {
                            Log.e(TAG, "Failed to register WebRTC call on backend, code=${response.code()}")
                        }
                    }
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
