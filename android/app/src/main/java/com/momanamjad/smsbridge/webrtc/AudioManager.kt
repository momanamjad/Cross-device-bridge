package com.momanamjad.smsbridge.webrtc

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager as AndroidAudioManager
import android.os.Build
import android.util.Log
import org.webrtc.AudioTrack

data class AudioStats(val volume: Int, val quality: String, val latency: Long)

class AudioManager(private val context: Context) {
    companion object {
        private const val TAG = "AudioManager"
    }

    private val androidAudioManager = context.getSystemService(Context.AUDIO_SERVICE) as AndroidAudioManager
    private var activeAudioTrack: AudioTrack? = null
    private var isMicrophoneEnabled = true
    private var isSpeakerEnabled = true
    private var focusRequest: AudioFocusRequest? = null

    fun startAudioCapture(audioTrack: AudioTrack) {
        Log.i(TAG, "Starting audio capture for track=${audioTrack.id()}")
        this.activeAudioTrack = audioTrack
        audioTrack.setEnabled(isMicrophoneEnabled)
        requestCommunicationFocus()
    }

    fun stopAudioCapture() {
        Log.i(TAG, "Stopping audio capture")
        activeAudioTrack?.setEnabled(false)
        activeAudioTrack = null
        abandonCommunicationFocus()
    }

    fun playRemoteAudio(audioTrack: AudioTrack) {
        Log.i(TAG, "Playing remote audio track=${audioTrack.id()}")
        audioTrack.setEnabled(true)
        // Ensure volume is set and routed to speaker/earpiece
        setSpeakerEnabled(isSpeakerEnabled)
    }

    fun setMicrophoneEnabled(enabled: Boolean) {
        Log.i(TAG, "Setting microphone enabled=$enabled")
        isMicrophoneEnabled = enabled
        activeAudioTrack?.setEnabled(enabled)
    }

    fun setSpeakerEnabled(enabled: Boolean) {
        Log.i(TAG, "Setting speakerphone enabled=$enabled")
        isSpeakerEnabled = enabled
        try {
            androidAudioManager.isSpeakerphoneOn = enabled
            if (enabled) {
                androidAudioManager.mode = AndroidAudioManager.MODE_IN_COMMUNICATION
            } else {
                // If not speaker, route to earpiece
                androidAudioManager.mode = AndroidAudioManager.MODE_IN_COMMUNICATION
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set speakerphone: ${e.message}", e)
        }
    }

    fun getAudioStats(): AudioStats {
        val currentVolume = androidAudioManager.getStreamVolume(AndroidAudioManager.STREAM_VOICE_CALL)
        // Dummy quality/latency calculations for local P2P monitoring
        val quality = if (currentVolume > 0) "Good" else "Silent"
        val latency = 15L // Estimated local network latency in milliseconds
        return AudioStats(currentVolume, quality, latency)
    }

    private fun requestCommunicationFocus() {
        try {
            androidAudioManager.mode = AndroidAudioManager.MODE_IN_COMMUNICATION
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AndroidAudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setOnAudioFocusChangeListener { focusChange ->
                        Log.d(TAG, "onAudioFocusChange focusChange=$focusChange")
                    }
                    .build()
                focusRequest = request
                androidAudioManager.requestAudioFocus(request)
            } else {
                @Suppress("DEPRECATION")
                androidAudioManager.requestAudioFocus(
                    { focusChange -> Log.d(TAG, "onAudioFocusChange focusChange=$focusChange") },
                    AndroidAudioManager.STREAM_VOICE_CALL,
                    AndroidAudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                )
            }
            setSpeakerEnabled(isSpeakerEnabled)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request audio focus: ${e.message}", e)
        }
    }

    private fun abandonCommunicationFocus() {
        try {
            androidAudioManager.mode = AndroidAudioManager.MODE_NORMAL
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { androidAudioManager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                androidAudioManager.abandonAudioFocus(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to abandon audio focus: ${e.message}", e)
        }
    }
}
