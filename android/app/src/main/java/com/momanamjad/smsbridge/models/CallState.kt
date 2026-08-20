package com.momanamjad.smsbridge.models

sealed class CallState {
    object Idle : CallState()
    data class RingingIncoming(val callerNumber: String) : CallState()
    data class Accepting(val callId: String) : CallState()
    data class Connecting(val callId: String) : CallState()
    data class Connected(val callId: String, val startTime: Long) : CallState()
    data class RingingOutgoing(val phoneNumber: String) : CallState()
    data class Disconnecting(val callId: String) : CallState()
    data class Ended(val callId: String, val duration: Long) : CallState()
    data class Failed(val callId: String, val reason: String) : CallState()
}
