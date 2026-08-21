package com.momanamjad.smsbridge.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface CallDao {
    @Insert
    suspend fun insert(call: CallEntity): Long

    @Query("SELECT * FROM calls ORDER BY timestamp DESC")
    suspend fun getAll(): List<CallEntity>

    @Query("SELECT * FROM calls WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<CallEntity>

    @Query("UPDATE calls SET synced = 1, backendId = :backendId WHERE id = :id")
    suspend fun markSynced(id: Long, backendId: String)

    @Query("SELECT COUNT(*) FROM calls WHERE synced = 0")
    suspend fun pendingCount(): Int

    @Query("SELECT EXISTS(SELECT 1 FROM calls WHERE callerNumber = :number AND callState = :state AND timestamp = :timestamp LIMIT 1)")
    suspend fun exists(number: String, state: String, timestamp: Long): Boolean

    @Query("DELETE FROM calls")
    suspend fun clear()
}
