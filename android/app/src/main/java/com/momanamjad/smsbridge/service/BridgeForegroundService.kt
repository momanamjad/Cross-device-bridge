package com.momanamjad.smsbridge.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.momanamjad.smsbridge.R
import com.momanamjad.smsbridge.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BridgeForegroundService : Service() {
    private var telephonyManager: TelephonyManager? = null
    private var callback: TelephonyCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Throwable) {
            // startForeground() failed — we MUST stop immediately or the OS will
            // kill the entire app with ForegroundServiceDidNotStartInTimeException.
            Log.e(TAG, "startForeground() failed, stopping service immediately", e)
            try {
                val logFile = java.io.File(filesDir, "node_out.txt")
                logFile.appendText("\n[BridgeForegroundService startForeground Error]: ${Log.getStackTraceString(e)}\n")
            } catch (_: Exception) {}
            stopSelf()
            return
        }
        try {
            registerCallCallback()
            com.momanamjad.smsbridge.sync.SocketManager.connect()
        } catch (e: Throwable) {
            Log.e(TAG, "Failed during post-foreground setup", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        unregisterCallCallback()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "Task removed (app swiped away). Keeping BridgeForegroundService alive.")
        val restartServiceIntent = Intent(applicationContext, this.javaClass).apply {
            setPackage(packageName)
        }
        val restartServicePendingIntent = PendingIntent.getService(
            applicationContext,
            1,
            restartServiceIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmService = applicationContext.getSystemService(android.content.Context.ALARM_SERVICE) as android.app.AlarmManager
        alarmService.set(
            android.app.AlarmManager.RTC,
            System.currentTimeMillis() + 500,
            restartServicePendingIntent
        )
    }

    private var phoneStateListener: android.telephony.PhoneStateListener? = null

    private fun registerCallCallback() {
        telephonyManager = getSystemService(TELEPHONY_SERVICE) as? TelephonyManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallState(state, null)
                }
            }
            callback = cb
            try {
                telephonyManager?.registerTelephonyCallback(mainExecutor, cb)
            } catch (e: SecurityException) {
                Log.w(TAG, "missing phone permission for TelephonyCallback", e)
            }
        } else {
            @Suppress("DEPRECATION")
            val listener = object : android.telephony.PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleCallState(state, phoneNumber)
                }
            }
            phoneStateListener = listener
            try {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(listener, android.telephony.PhoneStateListener.LISTEN_CALL_STATE)
                Log.i(TAG, "PhoneStateListener registered successfully on Android <= 11")
            } catch (e: SecurityException) {
                Log.w(TAG, "missing phone permission for PhoneStateListener", e)
            }
        }
    }

    private fun handleCallState(state: Int, phoneNumber: String?) {
        val label = when (state) {
            TelephonyManager.CALL_STATE_RINGING -> "RINGING"
            TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
            TelephonyManager.CALL_STATE_IDLE -> "IDLE"
            else -> "UNKNOWN"
        }
        Log.i(TAG, "telephony callback state=$label, number=$phoneNumber")
        val logFile = java.io.File(filesDir, "node_out.txt")
        try {
            logFile.appendText("\n[${java.util.Date()}] [Bridge Telephony] State: $label, Number: ${phoneNumber ?: "unknown"}\n")
        } catch (_: Exception) {}

        if (state == TelephonyManager.CALL_STATE_RINGING) {
            val number = phoneNumber?.trim().orEmpty().ifBlank { "unknown" }
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                try {
                    com.momanamjad.smsbridge.sync.NetworkManager.enqueueCall(number, "RINGING", System.currentTimeMillis())

                    val app = com.momanamjad.smsbridge.BridgeApp.instance
                    val url = app.settings.backendUrl
                    val token = app.settings.apiToken
                    val deviceId = app.settings.deviceId

                    if (url.isNotBlank() && token.isNotBlank() && app.settings.callsEnabled) {
                        val api = com.momanamjad.smsbridge.api.RetrofitClient.create(url)
                        val resp = api.postWebRtcIncoming(
                            "Bearer $token",
                            com.momanamjad.smsbridge.api.WebRtcIncomingRequest(
                                callerNumber = number,
                                deviceId = deviceId,
                                timestamp = System.currentTimeMillis()
                            )
                        )
                        if (resp.isSuccessful) {
                            val callId = resp.body()?.callId ?: java.util.UUID.randomUUID().toString()
                            try {
                                logFile.appendText("[${java.util.Date()}] [Bridge Telephony] Forwarded incoming call alert to iPhone: callId=$callId\n")
                            } catch (_: Exception) {}
                            com.momanamjad.smsbridge.webrtc.WebRtcCallManager.handleIncomingCall(callId, number)
                        } else {
                            try {
                                logFile.appendText("[${java.util.Date()}] [Bridge Telephony] Server returned code=${resp.code()} for incoming call\n")
                            } catch (_: Exception) {}
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error handling incoming call state", e)
                    try {
                        logFile.appendText("[${java.util.Date()}] [Bridge Telephony] Error notifying incoming call: ${e.message}\n")
                    } catch (_: Exception) {}
                }
            }
        } else if (state == TelephonyManager.CALL_STATE_IDLE) {
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                com.momanamjad.smsbridge.webrtc.WebRtcCallManager.endCurrentCall()
            }
        }
    }

    private fun unregisterCallCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            callback?.let { telephonyManager?.unregisterTelephonyCallback(it) }
            callback = null
        } else {
            phoneStateListener?.let {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(it, android.telephony.PhoneStateListener.LISTEN_NONE)
            }
            phoneStateListener = null
        }
    }

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.channel_desc) },
        )
    }

    private fun buildNotification(): Notification {
        val launch = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(com.momanamjad.smsbridge.R.drawable.ic_notification)
            .setContentTitle(getString(R.string.fg_title))
            .setContentText(getString(R.string.fg_text))
            .setOngoing(true)
            .setContentIntent(launch)
            .build()
    }

    companion object {
        private const val TAG = "BridgeFgService"
        private const val CHANNEL_ID = "bridge_status"
        private const val NOTIFICATION_ID = 42
    }
}
