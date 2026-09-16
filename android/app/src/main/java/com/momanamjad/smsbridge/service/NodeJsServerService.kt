package com.momanamjad.smsbridge.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.AssetManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.momanamjad.smsbridge.BridgeApp
import java.io.File
import java.io.FileOutputStream

class NodeJsServerService : Service() {
    private var nodeJsThread: Thread? = null
    private val NOTIFICATION_ID = 9999
    private val CHANNEL_ID = "nodejs_server"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Starting Node.js Server Service as Foreground...")
        createNotificationChannel()
        val notification = createNotification()
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Throwable) {
            // startForeground() failed — we MUST stop immediately or the OS will
            // kill the entire app with ForegroundServiceDidNotStartInTimeException.
            Log.e(TAG, "startForeground() failed, stopping service immediately", e)
            try {
                val logFile = File(filesDir, "node_out.txt")
                logFile.appendText("\n[NodeJsServerService startForeground Error]: ${Log.getStackTraceString(e)}\n")
            } catch (_: Exception) {}
            stopSelf()
            return
        }
        try {
            startNodeJsServer()
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to start Node.js server engine", e)
            try {
                val logFile = File(filesDir, "node_out.txt")
                logFile.appendText("\n[NodeJsServerService startNodeJs Error]: ${Log.getStackTraceString(e)}\n")
            } catch (_: Exception) {}
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "Task removed (app swiped away). Keeping NodeJsServerService alive.")
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

    private fun startNodeJsServer() {
        synchronized(NodeJsServerService::class.java) {
            if (isServerStarted) {
                Log.i(TAG, "Node.js engine is already running in this process.")
                return
            }
            isServerStarted = true
        }
        nodeJsThread = Thread {
            val logFile = File(filesDir, "node_out.txt")
            try {
                logFile.appendText("\n[${java.util.Date()}] NodeJsServerService: Thread started.\n")
                // Load C++ shared standard library, Node.js engine and native bridge libraries
                logFile.appendText("[${java.util.Date()}] Loading native libraries: c++_shared, node, node-bridge...\n")
                System.loadLibrary("c++_shared")
                System.loadLibrary("node")
                System.loadLibrary("node-bridge")
                logFile.appendText("[${java.util.Date()}] Native libraries loaded successfully.\n")

                // Extract backend assets to internal files directory
                val targetDir = File(filesDir, "backend")
                if (!targetDir.exists()) {
                    targetDir.mkdirs()
                }
                val nodeModulesDir = File(targetDir, "node_modules")
                if (!nodeModulesDir.exists() || nodeModulesDir.list().isNullOrEmpty()) {
                    logFile.appendText("[${java.util.Date()}] Extracting full backend assets...\n")
                    Log.d(TAG, "Initial extraction of full backend assets (including node_modules)...")
                    copyAssetFolder(assets, "backend", targetDir.absolutePath)
                } else {
                    logFile.appendText("[${java.util.Date()}] Updating dist folder...\n")
                    Log.d(TAG, "node_modules already exists. Updating dist folder only...")
                    copyAssetFolder(assets, "backend/dist", File(targetDir, "dist").absolutePath)
                    copyAssetFile(assets, "backend/package.json", File(targetDir, "package.json").absolutePath)
                }

                // Write environment variables dynamically
                writeEnvFile(targetDir)

                // Extract seed database if not exists
                val dbFile = File(filesDir, "device_bridge.db")
                if (!dbFile.exists()) {
                    copyAssetFile(assets, "device_bridge.db", dbFile.absolutePath)
                    Log.i(TAG, "Seeded SQLite database successfully.")
                } else {
                    Log.i(TAG, "SQLite database already exists, using existing.")
                }

                // Launch Node.js main script
                val mainScript = File(targetDir, "dist/server.js")
                if (!mainScript.exists()) {
                    Log.w(TAG, "server.js not found, extracting backend/dist...")
                    copyAssetFolder(assets, "backend/dist", File(targetDir, "dist").absolutePath)
                    copyAssetFile(assets, "backend/package.json", File(targetDir, "package.json").absolutePath)
                }

                if (!mainScript.exists()) {
                    val err = "FATAL: server.js not found at ${mainScript.absolutePath}"
                    Log.e(TAG, err)
                    logFile.appendText("\n[$err]\n")
                    return@Thread
                }

                val args = arrayOf("node", mainScript.absolutePath)
                logFile.appendText("[${java.util.Date()}] Starting node with script: ${mainScript.absolutePath}\n")
                Log.i(TAG, "Starting Node.js engine with: ${args.joinToString(" ")}")
                nodeJsStart(args, logFile.absolutePath)
            } catch (e: Throwable) {
                val err = Log.getStackTraceString(e)
                Log.e(TAG, "Fatal error running Node.js server: $err", e)
                try {
                    logFile.appendText("\n[FATAL Node.js Engine Error]:\n$err\n")
                } catch (_: Exception) {}
                Handler(Looper.getMainLooper()).post {
                    Toast.makeText(this@NodeJsServerService, "Node.js Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
        nodeJsThread?.start()
    }

    private fun writeEnvFile(targetDir: File) {
        val envFile = File(targetDir, ".env")
        val settings = BridgeApp.instance.settings
        val dbFile = File(filesDir, "device_bridge.db")
        
        val secret = settings.registerSecret.ifBlank { "super_secret_bridge_key" }
        if (settings.registerSecret.isBlank()) {
            settings.registerSecret = secret
        }

        val content = """
            NODE_ENV=production
            PORT=9000
            DATABASE_URL=file:${dbFile.absolutePath}
            REGISTER_SECRET=$secret
            CORS_ORIGIN=*
            LOG_LEVEL=info
            LOG_FILE_PATH=${File(filesDir, "node_out.txt").absolutePath}
        """.trimIndent()
        
        envFile.writeText(content)
        Log.i(TAG, "Wrote env variables: DATABASE_URL=file:${dbFile.absolutePath}")
    }

    private fun copyAssetFolder(assetManager: AssetManager, fromAssetPath: String, toPath: String): Boolean {
        return try {
            val files = assetManager.list(fromAssetPath) ?: return false
            if (files.isEmpty()) {
                // If it doesn't contain children, it is a file
                copyAssetFile(assetManager, fromAssetPath, toPath)
            } else {
                // If it contains children, it is a directory
                val dir = File(toPath)
                if (!dir.exists()) {
                    dir.mkdirs()
                }
                for (file in files) {
                    val nextAssetPath = if (fromAssetPath.isEmpty()) file else "$fromAssetPath/$file"
                    copyAssetFolder(assetManager, nextAssetPath, "$toPath/$file")
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy asset folder $fromAssetPath", e)
            false
        }
    }

    private fun copyAssetFile(assetManager: AssetManager, fromAssetPath: String, toPath: String): Boolean {
        return try {
            assetManager.open(fromAssetPath).use { input ->
                val toFile = File(toPath)
                toFile.parentFile?.mkdirs()
                FileOutputStream(toFile).use { output ->
                    input.copyTo(output)
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy asset file $fromAssetPath to $toPath", e)
            false
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Bridge Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "WebRTC server active on port 9000"
            }
            nm.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val launch = PendingIntent.getActivity(
            this,
            0,
            Intent(this, com.momanamjad.smsbridge.ui.MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(com.momanamjad.smsbridge.R.drawable.ic_notification)
            .setContentTitle("SMS Bridge Server")
            .setContentText("WebRTC server active on port 9000")
            .setOngoing(true)
            .setContentIntent(launch)
            .build()
    }

    override fun onDestroy() {
        Log.i(TAG, "Stopping Node.js Server Service...")
        nodeJsThread?.interrupt()
        super.onDestroy()
    }

    private external fun nodeJsStart(args: Array<String>, logFilePath: String)

    companion object {
        private const val TAG = "NodeJsServerService"
        @Volatile
        var isServerStarted = false
            private set
    }
}
