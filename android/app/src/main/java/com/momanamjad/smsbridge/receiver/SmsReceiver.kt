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
                for (sms in messages) {
                    val sender = sms.displayOriginatingAddress?.trim().orEmpty().ifBlank { "unknown" }
                    val body = sms.messageBody.orEmpty()
                    NetworkManager.enqueueSms(sender, body, sms.timestampMillis)
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
