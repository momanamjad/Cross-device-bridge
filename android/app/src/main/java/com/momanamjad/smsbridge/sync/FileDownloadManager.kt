package com.momanamjad.smsbridge.sync

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.util.Log
import com.momanamjad.smsbridge.BridgeApp

object FileDownloadManager {
    private const val TAG = "FileDownloadManager"

    fun downloadFile(urlPath: String, filename: String) {
        try {
            val settings = BridgeApp.instance.settings
            val baseUrl = settings.backendUrl
            val fullUrl = if (baseUrl.endsWith("/")) {
                baseUrl.dropLast(1) + urlPath
            } else {
                baseUrl + urlPath
            }

            Log.i(TAG, "Starting download for $filename from $fullUrl")

            val request = DownloadManager.Request(Uri.parse(fullUrl))
                .setTitle(filename)
                .setDescription("Downloading file from Bridge")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Bridge/$filename")

            val downloadManager = BridgeApp.instance.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadManager.enqueue(request)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download file", e)
        }
    }
}
