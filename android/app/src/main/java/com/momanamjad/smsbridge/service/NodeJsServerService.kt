package com.momanamjad.smsbridge.service

import android.app.Service
import android.content.Intent
import android.content.res.AssetManager
import android.os.IBinder
import android.util.Log
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.momanamjad.smsbridge.BridgeApp
import java.io.File
import java.io.FileOutputStream

class NodeJsServerService : Service() {
    private var nodeJsThread: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Starting Node.js Server Service...")
        startNodeJsServer()
    }

    private fun startNodeJsServer() {
        nodeJsThread = Thread {
            try {
                // Load Node.js engine and native bridge libraries
                System.loadLibrary("node")
                System.loadLibrary("node-bridge")

                // Extract backend assets to internal files directory
                val targetDir = File(filesDir, "backend")
                if (!targetDir.exists()) {
                    targetDir.mkdirs()
                }
                Log.d(TAG, "Extracting backend assets to: ${targetDir.absolutePath}")
                copyAssetFolder(assets, "backend", targetDir.absolutePath)

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
                val mainScript = File(targetDir, "dist/server.js").absolutePath
                val args = arrayOf("node", mainScript)
                Log.i(TAG, "Starting Node.js engine with: ${args.joinToString(" ")}")
                nodeJsStart(args)
            } catch (e: Throwable) {
                Log.e(TAG, "Fatal error running Node.js server", e)
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

    override fun onDestroy() {
        Log.i(TAG, "Stopping Node.js Server Service...")
        nodeJsThread?.interrupt()
        super.onDestroy()
    }

    private external fun nodeJsStart(args: Array<String>)

    companion object {
        private const val TAG = "NodeJsServerService"
    }
}
