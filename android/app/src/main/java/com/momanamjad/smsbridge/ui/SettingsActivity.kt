package com.momanamjad.smsbridge.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.momanamjad.smsbridge.databinding.ActivitySettingsBinding
import kotlinx.coroutines.launch

class SettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsBinding
    private val vm: SettingsViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.backendUrl.setText(vm.settings.backendUrl)
        binding.deviceId.setText(vm.settings.deviceId)
        binding.registerSecret.setText(vm.settings.registerSecret)
        binding.apiToken.setText(vm.settings.apiToken)
        binding.smsEnabled.isChecked = vm.settings.smsEnabled
        binding.callsEnabled.isChecked = vm.settings.callsEnabled
        refreshCounts()

        binding.save.setOnClickListener {
            persistFields()
            toast("Saved")
            com.momanamjad.smsbridge.sync.SocketManager.connect()
        }
        binding.register.setOnClickListener {
            persistFields()
            lifecycleScope.launch {
                vm.register().onSuccess {
                    binding.apiToken.setText(vm.settings.apiToken)
                    toast("Registered")
                    com.momanamjad.smsbridge.sync.SocketManager.connect()
                }.onFailure { toast(it.message ?: "Register failed") }
            }
        }
        binding.testConnection.setOnClickListener {
            persistFields()
            lifecycleScope.launch {
                vm.testConnection().onSuccess { toast("Connected: $it") }
                    .onFailure { toast(it.message ?: "Failed") }
            }
        }
        binding.syncNow.setOnClickListener {
            persistFields()
            lifecycleScope.launch {
                vm.syncNow().onSuccess {
                    refreshCounts()
                    toast("Sync complete")
                }.onFailure { toast(it.message ?: "Sync failed") }
            }
        }
        binding.clearDb.setOnClickListener {
            lifecycleScope.launch {
                vm.clearDb()
                refreshCounts()
                toast("Local database cleared")
            }
        }
        binding.viewLogs.setOnClickListener {
            val logFile = java.io.File(filesDir, "node_out.txt")
            val logs = if (logFile.exists()) {
                logFile.readText()
            } else {
                "No logs found. Is the server running?"
            }
            val scrollView = android.widget.ScrollView(this)
            val textView = android.widget.TextView(this).apply {
                text = logs
                textSize = 14f
                setPadding(30, 30, 30, 30)
                setTextColor(android.graphics.Color.BLACK)
            }
            scrollView.addView(textView)
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Server Logs")
                .setView(scrollView)
                .setPositiveButton("OK", null)
                .setNeutralButton("Clear") { _, _ ->
                    if (logFile.exists()) {
                        logFile.writeText("")
                    }
                }
                .show()
        }
    }

    private fun persistFields() {
        vm.settings.backendUrl = binding.backendUrl.text.toString()
        vm.settings.deviceId = binding.deviceId.text.toString()
        vm.settings.registerSecret = binding.registerSecret.text.toString()
        vm.settings.apiToken = binding.apiToken.text.toString()
        vm.settings.smsEnabled = binding.smsEnabled.isChecked
        vm.settings.callsEnabled = binding.callsEnabled.isChecked
    }

    private fun refreshCounts() {
        lifecycleScope.launch {
            val pending = vm.pendingCount()
            val last = vm.settings.lastSyncAt
            val lastText = if (last == 0L) "never" else java.text.DateFormat.getDateTimeInstance().format(last)
            binding.syncStatus.text = "Pending: $pending  •  Last sync: $lastText"
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
