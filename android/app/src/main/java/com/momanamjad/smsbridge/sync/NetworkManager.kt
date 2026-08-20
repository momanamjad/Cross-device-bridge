package com.momanamjad.smsbridge.sync

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

    private fun tryPushThenSchedule() {
        val wm = WorkManager.getInstance(BridgeApp.instance)
        val oneShot = OneTimeWorkRequestBuilder<SyncWorker>().build()
        wm.enqueueUniqueWork(SyncWorker.ONE_SHOT, ExistingWorkPolicy.REPLACE, oneShot)
    }
}
