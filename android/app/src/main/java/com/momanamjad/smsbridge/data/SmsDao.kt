package com.momanamjad.smsbridge.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface SmsDao {
    @Insert
    suspend fun insert(sms: SmsEntity): Long

    @Query("SELECT * FROM sms_messages ORDER BY timestamp DESC")
    suspend fun getAll(): List<SmsEntity>

    @Query("SELECT * FROM sms_messages WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<SmsEntity>

    @Query("UPDATE sms_messages SET synced = 1, backendId = :backendId WHERE id = :id")
    suspend fun markSynced(id: Long, backendId: String)

    @Query("SELECT COUNT(*) FROM sms_messages WHERE synced = 0")
    suspend fun pendingCount(): Int

    @Query("DELETE FROM sms_messages")
    suspend fun clear()
}
