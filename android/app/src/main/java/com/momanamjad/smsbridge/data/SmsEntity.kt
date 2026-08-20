package com.momanamjad.smsbridge.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sms_messages",
    indices = [
        Index("sender"),
        Index("timestamp"),
        Index("synced"),
    ],
)
data class SmsEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sender: String,
    val message: String,
    val timestamp: Long,
    val synced: Boolean = false,
    val backendId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)
