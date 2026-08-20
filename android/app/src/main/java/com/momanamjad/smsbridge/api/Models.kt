package com.momanamjad.smsbridge.api

import com.squareup.moshi.Json

data class SmsRequest(
    val sender: String,
    val message: String,
    val timestamp: Long,
    @Json(name = "device_id") val deviceId: String,
)

data class CallRequest(
    val caller: String,
    val state: String,
    val timestamp: Long,
    @Json(name = "device_id") val deviceId: String,
    val duration: Long = 0,
)

data class SmsResponse(
    val status: String,
    @Json(name = "message_id") val messageId: String? = null,
)

data class CallResponse(
    val status: String,
    @Json(name = "call_id") val callId: String? = null,
)

data class RegisterRequest(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "device_name") val deviceName: String,
    @Json(name = "device_type") val deviceType: String = "android",
    @Json(name = "os_version") val osVersion: String = android.os.Build.VERSION.RELEASE,
)

data class RegisterResponse(
    val status: String,
    @Json(name = "api_token") val apiToken: String? = null,
    @Json(name = "device_id") val deviceId: String? = null,
)

data class HealthResponse(
    val status: String,
    val database: String? = null,
)

data class WebRtcIncomingRequest(
    @Json(name = "caller_number") val callerNumber: String,
    @Json(name = "device_id") val deviceId: String,
    val timestamp: Long
)

data class WebRtcIncomingResponse(
    @Json(name = "call_id") val callId: String,
    val status: String
)

data class WebRtcOutgoingRequest(
    @Json(name = "phone_number") val phoneNumber: String,
    @Json(name = "device_id") val deviceId: String
)

data class WebRtcOutgoingResponse(
    @Json(name = "call_id") val callId: String,
    val status: String
)

data class WebRtcEndedRequest(
    @Json(name = "call_id") val callId: String,
    @Json(name = "duration_seconds") val durationSeconds: Long
)

data class WebRtcEndedResponse(
    val status: String
)
