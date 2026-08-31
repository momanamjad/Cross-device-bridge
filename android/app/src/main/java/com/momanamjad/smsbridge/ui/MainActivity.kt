package com.momanamjad.smsbridge.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.R
import com.momanamjad.smsbridge.databinding.ActivityMainBinding
import com.momanamjad.smsbridge.service.BridgeForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val handler = Handler(Looper.getMainLooper())
    private var bridgeStarted = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val nodeJsIntent = Intent(this, com.momanamjad.smsbridge.service.NodeJsServerService::class.java)
        ContextCompat.startForegroundService(this, nodeJsIntent)

        binding.grantPermissions.setOnClickListener { requestNeededPermissions() }
        binding.startBridge.setOnClickListener { startBridge() }
        binding.openSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
        if (bridgeStarted) startHealthPolling()
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacksAndMessages(null)
    }

    private fun refreshStatus() {
        val missing = neededPermissions().filter { !hasPermission(it) }
        binding.status.text = if (missing.isEmpty()) {
            "All permissions granted. Tap Start Bridge."
        } else {
            getString(R.string.permissions_needed)
        }
    }

    private fun requestNeededPermissions() {
        permissionLauncher.launch(neededPermissions().toTypedArray())
    }

    private fun startBridge() {
        val intent = Intent(this, BridgeForegroundService::class.java)
        ContextCompat.startForegroundService(this, intent)
        bridgeStarted = true
        binding.status.text = "Bridge running..."
        binding.statusLabel.text = "Starting..."
        com.momanamjad.smsbridge.sync.SocketManager.connect()
        startHealthPolling()
    }

    private fun startHealthPolling() {
        handler.removeCallbacksAndMessages(null)
        pollHealth()
    }

    private fun pollHealth() {
        val settings = BridgeApp.instance.settings
        val baseUrl = settings.backendUrl.trimEnd('/')

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = URL("$baseUrl/api/health").readText()
                val json = JSONObject(response)
                val status = json.optString("status", "unknown")
                val uptime = json.optInt("uptime", 0)
                val serverIP = json.optString("server_ip", "--")

                val uptimeText = if (uptime >= 3600) "${uptime / 3600}h ${(uptime % 3600) / 60}m"
                                 else if (uptime >= 60) "${uptime / 60}m ${uptime % 60}s"
                                 else "${uptime}s"

                withContext(Dispatchers.Main) {
                    binding.statusLabel.text = if (status == "ok") "Server Running" else "Degraded"
                    binding.statusDot.setBackgroundResource(
                        if (status == "ok") R.drawable.status_dot_green
                        else R.drawable.status_dot_red
                    )
                    binding.statUptime.text = uptimeText
                    binding.statIP.text = serverIP

                    if (status == "ok" && serverIP != "--" && serverIP != "127.0.0.1") {
                        generateQRCode(serverIP)
                    } else {
                        binding.qrCard.visibility = View.GONE
                    }
                }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) {
                    binding.statusLabel.text = "Server Offline"
                    binding.statusDot.setBackgroundResource(R.drawable.status_dot_red)
                    binding.statUptime.text = "--"
                    binding.statIP.text = "--"
                    binding.qrCard.visibility = View.GONE
                }
            }
        }
        handler.postDelayed({ pollHealth() }, 5000)
    }

    private fun generateQRCode(ip: String) {
        if (binding.qrCard.visibility == View.VISIBLE) return // Already generated

        val settings = BridgeApp.instance.settings
        val secret = settings.registerSecret.ifBlank { "super_secret_bridge_key" }
        // JSON payload for QR code
        val qrData = JSONObject().apply {
            put("ip", ip)
            put("port", 9000)
            put("secret", secret)
        }.toString()

        try {
            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(qrData, BarcodeFormat.QR_CODE, 512, 512)
            val width = bitMatrix.width
            val height = bitMatrix.height
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
            for (x in 0 until width) {
                for (y in 0 until height) {
                    bitmap.setPixel(x, y, if (bitMatrix.get(x, y)) Color.BLACK else Color.WHITE)
                }
            }
            binding.qrImage.setImageBitmap(bitmap)
            
            // Animated reveal
            binding.qrCard.alpha = 0f
            binding.qrCard.visibility = View.VISIBLE
            binding.qrCard.animate().alpha(1f).setDuration(500).start()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun neededPermissions(): List<String> {
        val list = mutableListOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CALL_PHONE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            list += Manifest.permission.ANSWER_PHONE_CALLS
        }
        if (Build.VERSION.SDK_INT >= 33) {
            list += Manifest.permission.POST_NOTIFICATIONS
        }
        return list
    }
}
