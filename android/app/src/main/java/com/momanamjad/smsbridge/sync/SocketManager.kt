package com.momanamjad.smsbridge.sync

import android.util.Log
import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.webrtc.WebRtcCallManager
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Collections

object SocketManager {
    private const val TAG = "SocketManager"
    private var socket: Socket? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    fun connect() {
        val settings = BridgeApp.instance.settings
        val url = settings.backendUrl
        val token = settings.apiToken

        if (url.isBlank() || token.isBlank()) {
            Log.w(TAG, "Cannot connect: backendUrl or apiToken is blank")
            return
        }

        if (socket?.connected() == true) {
            Log.d(TAG, "Socket already connected")
            return
        }

        try {
            Log.i(TAG, "Connecting to Socket.io backend at $url")
            val opts = IO.Options().apply {
                auth = Collections.singletonMap("token", token)
                query = "token=$token"
                reconnection = true
                reconnectionDelay = 1000
                reconnectionDelayMax = 5000
            }

            socket = IO.socket(url, opts).apply {
                on(Socket.EVENT_CONNECT) {
                    Log.i(TAG, "Socket connected successfully")
                }

                on(Socket.EVENT_DISCONNECT) {
                    Log.i(TAG, "Socket disconnected")
                }

                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    val err = args.getOrNull(0) as? Exception
                    Log.e(TAG, "Socket connection error: ${err?.message}", err)
                }

                on("call:incoming") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    val callerNumber = data.optString("caller_number")
                    Log.i(TAG, "Socket received call:incoming callId=$callId callerNumber=$callerNumber")
                    scope.launch {
                        WebRtcCallManager.handleIncomingCall(callId, callerNumber)
                    }
                }

                on("call:outgoing") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    val phoneNumber = data.optString("phone_number")
                    Log.i(TAG, "Socket received call:outgoing callId=$callId phoneNumber=$phoneNumber")
                    scope.launch {
                        WebRtcCallManager.makeOutgoingCall(callId, phoneNumber)
                    }
                }

                on("call:accept-ack") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    Log.i(TAG, "Socket received call:accept-ack callId=$callId")
                    scope.launch {
                        WebRtcCallManager.acceptIncomingCall(callId)
                    }
                }

                on("webrtc:offer") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    val sdpOffer = data.optString("sdp_offer")
                    Log.i(TAG, "Socket received webrtc:offer callId=$callId")
                    scope.launch {
                        WebRtcCallManager.handleSdpOffer(callId, sdpOffer)
                    }
                }

                on("webrtc:answer") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    val sdpAnswer = data.optString("sdp_answer")
                    Log.i(TAG, "Socket received webrtc:answer callId=$callId")
                    scope.launch {
                        WebRtcCallManager.handleSdpAnswer(callId, sdpAnswer)
                    }
                }

                on("webrtc:ice-candidate") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    val candidate = data.opt("candidate") ?: return@on
                    Log.d(TAG, "Socket received webrtc:ice-candidate callId=$callId candidate=$candidate")
                    scope.launch {
                        WebRtcCallManager.handleIceCandidate(callId, candidate.toString())
                    }
                }

                on("call:hangup") { args ->
                    val data = args.getOrNull(0) as? JSONObject ?: return@on
                    val callId = data.optString("call_id")
                    Log.i(TAG, "Socket received call:hangup callId=$callId")
                    scope.launch {
                        WebRtcCallManager.endCall(callId)
                    }
                }

                connect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Socket.io client", e)
        }
    }

    fun emit(event: String, payload: Any) {
        val s = socket
        if (s == null || !s.connected()) {
            Log.w(TAG, "Cannot emit: Socket not connected")
            return
        }
        if (payload is Map<*, *>) {
            s.emit(event, JSONObject(payload))
        } else {
            s.emit(event, payload)
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
