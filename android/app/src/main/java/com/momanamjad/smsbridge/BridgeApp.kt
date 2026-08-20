package com.momanamjad.smsbridge

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.momanamjad.smsbridge.data.AppDatabase
import com.momanamjad.smsbridge.prefs.SecureSettings
import com.momanamjad.smsbridge.sync.SyncWorker
import java.util.concurrent.TimeUnit

class BridgeApp : Application() {
    lateinit var database: AppDatabase
        private set
    lateinit var settings: SecureSettings
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        database = AppDatabase.build(this)
        settings = SecureSettings(this)
        scheduleSync()
        com.momanamjad.smsbridge.sync.SocketManager.connect()
    }

    fun scheduleSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            SyncWorker.UNIQUE_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    companion object {
        lateinit var instance: BridgeApp
            private set
    }
}
