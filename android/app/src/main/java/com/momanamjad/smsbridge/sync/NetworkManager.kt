package com.momanamjad.smsbridge.sync

import android.content.Context
import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.api.CallRequest
import com.momanamjad.smsbridge.api.RetrofitClient
import com.momanamjad.smsbridge.api.SmsRequest
import com.momanamjad.smsbridge.data.CallEntity
import com.momanamjad.smsbridge.data.SmsEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object NetworkManager {
    private const val TAG = "NetworkManager"

    suspend fun enqueueSms(sender: String, message: String, timestamp: Long) {
        val app = BridgeApp.instance
        if (!app.settings.smsEnabled) return
        val id = app.database.smsDao().insert(
            SmsEntity(sender = sender, message = message, timestamp = timestamp),
        )
        Log.i(TAG, "stored sms id=$id senderLen=${sender.length} bodyLen=${message.length}")
        tryPushThenSchedule()
    }

    suspend fun enqueueCall(caller: String, state: String, timestamp: Long) {
        val app = BridgeApp.instance
        if (!app.settings.callsEnabled) return
        if (caller.isBlank()) {
            Log.w(TAG, "skipping call with empty number state=$state")
            return
        }
        val id = app.database.callDao().insert(
            CallEntity(callerNumber = caller, callState = state, timestamp = timestamp),
        )
        Log.i(TAG, "stored call id=$id state=$state")
        tryPushThenSchedule()
    }

    suspend fun syncPending(): Result<Unit> = withContext(Dispatchers.IO) {
        val app = BridgeApp.instance
        
        // Import existing system SMS and call history logs first
        importSystemLogs(app)

        val url = app.settings.backendUrl
        val token = app.settings.apiToken
        val deviceId = app.settings.deviceId
        if (url.isBlank() || token.isBlank()) {
            return@withContext Result.failure(IllegalStateException("missing url or token"))
        }
        val api = RetrofitClient.create(url)
        val auth = "Bearer $token"

        app.database.smsDao().getUnsynced().forEach { sms ->
            val response = api.postSms(
                auth,
                SmsRequest(sms.sender, sms.message, sms.timestamp, deviceId),
            )
            if (response.code() == 401) {
                Log.w(TAG, "sms sync unauthorized")
                return@withContext Result.failure(IllegalStateException("unauthorized"))
            }
            if (response.code() == 404) {
                Log.w(TAG, "sms endpoint missing")
                return@withContext Result.failure(IllegalStateException("not found"))
            }
            if (!response.isSuccessful) {
                throw IllegalStateException("sms http ${response.code()}")
            }
            val backendId = response.body()?.messageId ?: ""
            app.database.smsDao().markSynced(sms.id, backendId)
        }

        app.database.callDao().getUnsynced().forEach { call ->
            val response = api.postCall(
                auth,
                CallRequest(call.callerNumber, call.callState, call.timestamp, deviceId, call.duration),
            )
            if (response.code() == 401) {
                Log.w(TAG, "call sync unauthorized")
                return@withContext Result.failure(IllegalStateException("unauthorized"))
            }
            if (!response.isSuccessful) {
                throw IllegalStateException("call http ${response.code()}")
            }
            val backendId = response.body()?.callId ?: ""
            app.database.callDao().markSynced(call.id, backendId)
        }

        app.settings.lastSyncAt = System.currentTimeMillis()
        Result.success(Unit)
    }

    suspend fun importSystemLogs(context: Context) = withContext(Dispatchers.IO) {
        val app = BridgeApp.instance
        Log.d(TAG, "Starting import of system SMS and Call log history...")

        // 1. Import SMS
        try {
            val cursor = context.contentResolver.query(
                android.net.Uri.parse("content://sms"),
                arrayOf("address", "body", "date"),
                null,
                null,
                "date DESC LIMIT 100"
            )
            cursor?.use { c ->
                val addressIdx = c.getColumnIndex("address")
                val bodyIdx = c.getColumnIndex("body")
                val dateIdx = c.getColumnIndex("date")
                var importedCount = 0
                while (c.moveToNext()) {
                    val sender = if (addressIdx >= 0) c.getString(addressIdx) ?: "" else ""
                    val message = if (bodyIdx >= 0) c.getString(bodyIdx) ?: "" else ""
                    val timestamp = if (dateIdx >= 0) c.getLong(dateIdx) else 0L
                    
                    if (sender.isNotBlank() && message.isNotBlank()) {
                        val exists = app.database.smsDao().exists(sender, message, timestamp)
                        if (!exists) {
                            app.database.smsDao().insert(
                                SmsEntity(sender = sender, message = message, timestamp = timestamp)
                            )
                            importedCount++
                        }
                    }
                }
                Log.i(TAG, "Imported $importedCount new SMS history records")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error importing system SMS logs", e)
        }

        // 2. Import Calls
        try {
            val cursor = context.contentResolver.query(
                android.provider.CallLog.Calls.CONTENT_URI,
                arrayOf(
                    android.provider.CallLog.Calls.NUMBER,
                    android.provider.CallLog.Calls.TYPE,
                    android.provider.CallLog.Calls.DATE
                ),
                null,
                null,
                android.provider.CallLog.Calls.DATE + " DESC LIMIT 100"
            )
            cursor?.use { c ->
                val numberIdx = c.getColumnIndex(android.provider.CallLog.Calls.NUMBER)
                val typeIdx = c.getColumnIndex(android.provider.CallLog.Calls.TYPE)
                val dateIdx = c.getColumnIndex(android.provider.CallLog.Calls.DATE)
                var importedCount = 0
                while (c.moveToNext()) {
                    val number = if (numberIdx >= 0) c.getString(numberIdx) ?: "" else ""
                    val typeInt = if (typeIdx >= 0) c.getInt(typeIdx) else 0
                    val timestamp = if (dateIdx >= 0) c.getLong(dateIdx) else 0L
                    
                    val state = when (typeInt) {
                        android.provider.CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                        android.provider.CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                        android.provider.CallLog.Calls.MISSED_TYPE -> "MISSED"
                        else -> "IDLE"
                    }
                    
                    if (number.isNotBlank() && state != "IDLE") {
                        val exists = app.database.callDao().exists(number, state, timestamp)
                        if (!exists) {
                            app.database.callDao().insert(
                                CallEntity(callerNumber = number, callState = state, timestamp = timestamp)
                            )
                            importedCount++
                        }
                    }
                }
                Log.i(TAG, "Imported $importedCount new Call log history records")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error importing system call logs", e)
        }
    }

    private fun tryPushThenSchedule() {
        val wm = WorkManager.getInstance(BridgeApp.instance)
        val oneShot = OneTimeWorkRequestBuilder<SyncWorker>().build()
        wm.enqueueUniqueWork(SyncWorker.ONE_SHOT, ExistingWorkPolicy.REPLACE, oneShot)
    }
}
