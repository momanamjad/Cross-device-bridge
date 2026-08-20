package com.momanamjad.smsbridge.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureSettings(context: Context) {
    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            "bridge_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var backendUrl: String
        get() {
            val url = prefs.getString(KEY_URL, "") ?: ""
            return if (url.isBlank()) "http://localhost:9000" else url
        }
        set(value) = prefs.edit().putString(KEY_URL, value.trim().trimEnd('/')).apply()

    var apiToken: String
        get() = prefs.getString(KEY_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_TOKEN, value.trim()).apply()

    var registerSecret: String
        get() = prefs.getString(KEY_SECRET, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SECRET, value).apply()

    var deviceId: String
        get() = prefs.getString(KEY_DEVICE, "realme_c3_1") ?: "realme_c3_1"
        set(value) = prefs.edit().putString(KEY_DEVICE, value.trim()).apply()

    var smsEnabled: Boolean
        get() = prefs.getBoolean(KEY_SMS, true)
        set(value) = prefs.edit().putBoolean(KEY_SMS, value).apply()

    var callsEnabled: Boolean
        get() = prefs.getBoolean(KEY_CALLS, true)
        set(value) = prefs.edit().putBoolean(KEY_CALLS, value).apply()

    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SYNC, value).apply()

    companion object {
        private const val KEY_URL = "backend_url"
        private const val KEY_TOKEN = "api_token"
        private const val KEY_SECRET = "register_secret"
        private const val KEY_DEVICE = "device_id"
        private const val KEY_SMS = "sms_enabled"
        private const val KEY_CALLS = "calls_enabled"
        private const val KEY_LAST_SYNC = "last_sync"
    }
}
