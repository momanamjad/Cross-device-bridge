package com.momanamjad.smsbridge.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.momanamjad.smsbridge.sync.NetworkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val pending = goAsync()
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: emptyArray()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (messages.isNotEmpty()) {
                    val grouped = messages.groupBy {
                        it.displayOriginatingAddress?.trim().orEmpty().ifBlank { "unknown" }
                    }
                    for ((sender, partList) in grouped) {
                        val fullBody = partList.joinToString(separator = "") { it.messageBody.orEmpty() }
                        val timestamp = partList.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
                        if (fullBody.isNotBlank()) {
                            NetworkManager.enqueueSms(sender, fullBody, timestamp)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "failed to handle sms", e)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
