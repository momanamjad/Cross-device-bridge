package com.momanamjad.smsbridge.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [SmsEntity::class, CallEntity::class, CallRecord::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun smsDao(): SmsDao
    abstract fun callDao(): CallDao
    abstract fun callRecordDao(): CallRecordDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "bridge.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
