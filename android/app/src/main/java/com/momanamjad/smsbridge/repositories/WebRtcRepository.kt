package com.momanamjad.smsbridge.repositories

import com.momanamjad.smsbridge.BridgeApp
import com.momanamjad.smsbridge.data.CallRecord

class WebRtcRepository {
    private val db = BridgeApp.instance.database

    suspend fun saveCallHistory(call: CallRecord) {
        db.callRecordDao().insert(call)
    }

    suspend fun getCallHistory(): List<CallRecord> {
        return db.callRecordDao().getAll()
    }

    suspend fun deletCallHistory(callId: String) {
        db.callRecordDao().delete(callId)
    }
}
