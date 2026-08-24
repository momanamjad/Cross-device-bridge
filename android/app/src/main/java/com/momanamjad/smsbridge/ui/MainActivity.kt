package com.momanamjad.smsbridge.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.momanamjad.smsbridge.databinding.ActivityMainBinding
import com.momanamjad.smsbridge.service.BridgeForegroundService

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Start Node.js backend service as foreground service
        val nodeJsIntent = Intent(this, com.momanamjad.smsbridge.service.NodeJsServerService::class.java)
        androidx.core.content.ContextCompat.startForegroundService(this, nodeJsIntent)

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
    }

    private fun refreshStatus() {
        val missing = neededPermissions().filter { !hasPermission(it) }
        binding.status.text = if (missing.isEmpty()) {
            "Permissions granted. Start the bridge, then open Settings."
        } else {
            getString(com.momanamjad.smsbridge.R.string.permissions_needed)
        }
    }

    private fun requestNeededPermissions() {
        permissionLauncher.launch(neededPermissions().toTypedArray())
    }

    private fun startBridge() {
        val intent = Intent(this, BridgeForegroundService::class.java)
        ContextCompat.startForegroundService(this, intent)
        binding.status.text = "Bridge service started. Keep the status notification visible."
        com.momanamjad.smsbridge.sync.SocketManager.connect()
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
