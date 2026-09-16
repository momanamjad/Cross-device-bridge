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
    val database: AppDatabase by lazy {
        try {
            AppDatabase.build(this)
        } catch (e: Exception) {
            android.util.Log.e("BridgeApp", "Database build failed, using in-memory fallback", e)
            androidx.room.Room.inMemoryDatabaseBuilder(this, AppDatabase::class.java).build()
        }
    }

    val settings: SecureSettings by lazy {
        try {
            SecureSettings(this)
        } catch (e: Throwable) {
            android.util.Log.e("BridgeApp", "SecureSettings failed, using fallback plain prefs", e)
            try {
                val logFile = java.io.File(filesDir, "node_out.txt")
                logFile.appendText("\n[SecureSettings FAILED]: ${android.util.Log.getStackTraceString(e)}\n")
            } catch (_: Exception) {}
            SecureSettings.createFallback(this)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val stackTrace = android.util.Log.getStackTraceString(throwable)
                android.util.Log.e("BridgeApp", "FATAL CRASH on ${thread.name}: $stackTrace", throwable)
                val logFile = java.io.File(filesDir, "node_out.txt")
                logFile.appendText("\n[FATAL CRASH on ${thread.name}]:\n$stackTrace\n")
            } catch (_: Exception) {}
            defaultHandler?.uncaughtException(thread, throwable)
        }

        val processName = if (android.os.Build.VERSION.SDK_INT >= 28) {
            getProcessName()
        } else {
            packageName
        }

        // Only run sync workers and socket client in the main UI process, not the background :nodejs process
        if (processName == packageName) {
            try {
                scheduleSync()
            } catch (e: Exception) {
                android.util.Log.e("BridgeApp", "scheduleSync failed", e)
            }

            try {
                com.momanamjad.smsbridge.sync.SocketManager.connect()
            } catch (e: Exception) {
                android.util.Log.e("BridgeApp", "SocketManager.connect failed", e)
            }
        }
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
