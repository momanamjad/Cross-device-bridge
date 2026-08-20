package com.momanamjad.smsbridge.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "calls",
    indices = [
        Index("callerNumber"),
        Index("timestamp"),
        Index("synced"),
    ],
)
data class CallEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val callerNumber: String,
    val callState: String,
    val timestamp: Long,
    val duration: Long = 0,
    val synced: Boolean = false,
    val backendId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)
