package com.momanamjad.smsbridge.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.api.RegisterRequest
import com.momanamjad.smsbridge.api.RetrofitClient
import com.momanamjad.smsbridge.sync.NetworkManager

class SettingsViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as BridgeApp
    val settings = app.settings

    suspend fun pendingCount(): Int {
        val sms = app.database.smsDao().pendingCount()
        val calls = app.database.callDao().pendingCount()
        return sms + calls
    }

    suspend fun clearDb() {
        app.database.smsDao().clear()
        app.database.callDao().clear()
    }

    suspend fun testConnection(): Result<String> = runCatching {
        val url = settings.backendUrl
        require(url.startsWith("http://") || url.startsWith("https://")) { "Invalid backend URL" }
        val health = RetrofitClient.create(url).health()
        health.status
    }

    suspend fun register(): Result<Unit> = runCatching {
        val url = settings.backendUrl
        require(url.isNotBlank()) { "Backend URL required" }
        require(settings.registerSecret.isNotBlank()) { "Register secret required" }
        val response = RetrofitClient.create(url).register(
            settings.registerSecret,
            RegisterRequest(
                deviceId = settings.deviceId,
                deviceName = android.os.Build.MODEL,
            ),
        )
        val token = response.apiToken ?: error("No token in response")
        settings.apiToken = token
    }

    suspend fun syncNow(): Result<Unit> = NetworkManager.syncPending()
}
