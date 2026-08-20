package com.momanamjad.smsbridge.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CallRecordDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(record: CallRecord)

    @Query("SELECT * FROM call_history ORDER BY timestamp DESC")
    suspend fun getAll(): List<CallRecord>

    @Query("DELETE FROM call_history WHERE callId = :callId")
    suspend fun delete(callId: String)
}
