package com.momanamjad.smsbridge.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "call_history")
data class CallRecord(
    @PrimaryKey val callId: String,
    val callerNumber: String,
    val initiatorDevice: String,
    val state: String,
    val timestamp: Long,
    val durationSeconds: Long
)
