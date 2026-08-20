package com.momanamjad.smsbridge.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        return try {
            val outcome = NetworkManager.syncPending()
            if (outcome.isSuccess) Result.success() else Result.retry()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val UNIQUE_NAME = "bridge_periodic_sync"
        const val ONE_SHOT = "bridge_oneshot_sync"
    }
}
