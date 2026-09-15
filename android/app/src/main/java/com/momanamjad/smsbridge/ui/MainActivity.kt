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
        ensureRegisteredAndConnected()
        val initialIp = getDeviceWifiIp()
        if (initialIp != "127.0.0.1") {
            generateQRCode(initialIp, "")
        }
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
                val rawServerIP = json.optString("server_ip", "--")
                val wifiIp = getDeviceWifiIp()
                val serverIP = if (rawServerIP != "--" && rawServerIP != "127.0.0.1") rawServerIP else wifiIp
                val tunnelUrl = json.optString("tunnel_url", "")

                val uptimeText = if (uptime >= 3600) "${uptime / 3600}h ${(uptime % 3600) / 60}m"
                                 else if (uptime >= 60) "${uptime / 60}m ${uptime % 60}s"
                                 else "${uptime}s"

                ensureRegisteredAndConnected()

                withContext(Dispatchers.Main) {
                    binding.statusLabel.text = if (status == "ok") "Server Running" else "Degraded"
                    binding.statusDot.setBackgroundResource(
                        if (status == "ok") R.drawable.status_dot_green
                        else R.drawable.status_dot_red
                    )
                    binding.statUptime.text = uptimeText
                    
                    if (tunnelUrl.isNotEmpty()) {
                        binding.statIP.text = "$serverIP\n$tunnelUrl"
                    } else {
                        binding.statIP.text = serverIP
                    }

                    if (serverIP != "--") {
                        generateQRCode(serverIP, tunnelUrl)
                    } else {
                        binding.qrCard.visibility = View.GONE
                    }
                }
            } catch (_: Exception) {
                val wifiIp = getDeviceWifiIp()
                withContext(Dispatchers.Main) {
                    binding.statusLabel.text = "Server Starting..."
                    binding.statusDot.setBackgroundResource(R.drawable.status_dot_red)
                    binding.statUptime.text = "--"
                    binding.statIP.text = wifiIp
                    if (wifiIp != "127.0.0.1") {
                        generateQRCode(wifiIp, "")
                    } else {
                        binding.qrCard.visibility = View.GONE
                    }
                }
            }
        }
        handler.postDelayed({ pollHealth() }, 5000)
    }

    private fun getDeviceWifiIp(): String {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces() ?: return "127.0.0.1"
            var candidateIp: String? = null
            for (iface in interfaces) {
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val ip = addr.hostAddress ?: continue
                        if (iface.name.startsWith("wlan") || iface.name.startsWith("eth")) {
                            return ip
                        }
                        if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
                            candidateIp = ip
                        }
                    }
                }
            }
            return candidateIp ?: "127.0.0.1"
        } catch (_: Exception) {
            return "127.0.0.1"
        }
    }

    private fun ensureRegisteredAndConnected() {
        val settings = BridgeApp.instance.settings
        if (settings.apiToken.isNotBlank()) {
            com.momanamjad.smsbridge.sync.SocketManager.connect()
            return
        }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val secret = settings.registerSecret.ifBlank { "super_secret_bridge_key" }
                val baseUrl = settings.backendUrl.trimEnd('/')
                val url = java.net.URL("$baseUrl/api/devices/register")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("X-Register-Secret", secret)
                conn.doOutput = true
                val reqBody = JSONObject().apply {
                    put("device_id", settings.deviceId)
                    put("device_name", android.os.Build.MODEL)
                    put("device_type", "android")
                    put("os_version", android.os.Build.VERSION.RELEASE)
                }.toString()
                conn.outputStream.use { it.write(reqBody.toByteArray()) }
                if (conn.responseCode in 200..299) {
                    val resp = conn.inputStream.bufferedReader().readText()
                    val respJson = JSONObject(resp)
                    val token = respJson.optString("api_token")
                    if (token.isNotBlank()) {
                        settings.apiToken = token
                        android.util.Log.i("MainActivity", "Auto-registered Android bridge successfully.")
                        com.momanamjad.smsbridge.sync.SocketManager.connect()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("MainActivity", "Auto-registration pending: ${e.message}")
            }
        }
    }

    private fun generateQRCode(ip: String, tunnelUrl: String) {
        if (binding.qrCard.visibility == View.VISIBLE && binding.qrImage.drawable != null) return

        val settings = BridgeApp.instance.settings
        val secret = settings.registerSecret.ifBlank { "super_secret_bridge_key" }
        val token = settings.apiToken
        // JSON payload for QR code with credentials included
        val qrData = JSONObject().apply {
            put("ip", ip)
            put("port", 9000)
            put("secret", secret)
            if (token.isNotEmpty()) {
                put("token", token)
            }
            if (tunnelUrl.isNotEmpty()) {
                put("tunnel_url", tunnelUrl)
            }
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
            
            binding.qrCard.alpha = 0f
            binding.qrCard.visibility = View.VISIBLE
            binding.qrCard.animate().alpha(1f).setDuration(400).start()
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
