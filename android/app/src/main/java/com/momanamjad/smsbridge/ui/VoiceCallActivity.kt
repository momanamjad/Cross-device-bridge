package com.momanamjad.smsbridge.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.momanamjad.smsbridge.databinding.ActivityVoiceCallBinding
import com.momanamjad.smsbridge.models.CallState
import com.momanamjad.smsbridge.webrtc.WebRtcCallManager
import kotlinx.coroutines.launch

class VoiceCallActivity : AppCompatActivity() {
    private lateinit var binding: ActivityVoiceCallBinding
    private var callId: String? = null
    private var isMuted = false
    private var isSpeakerOn = true

    private val timerHandler = Handler(Looper.getMainLooper())
    private var callStartTime = 0L

    private val timerRunnable = object : Runnable {
        override fun run() {
            if (callStartTime > 0L) {
                val elapsed = (System.currentTimeMillis() - callStartTime) / 1000
                val hours = elapsed / 3600
                val minutes = (elapsed % 3600) / 60
                val seconds = elapsed % 60
                binding.tvCallTimer.text = String.format("%02d:%02d:%02d", hours, minutes, seconds)
                
                val stats = WebRtcCallManager.audioManager.getAudioStats()
                binding.tvSignalQuality.text = "Signal: ${stats.quality} | Latency: ${stats.latency}ms"
            }
            timerHandler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityVoiceCallBinding.inflate(layoutInflater)
        setContentView(binding.root)

        callId = intent.getStringExtra("call_id")
        val phoneNumber = intent.getStringExtra("phone_number") ?: "Unknown"
        val isIncoming = intent.getBooleanExtra("is_incoming", true)

        binding.tvCallerNumber.text = phoneNumber

        if (isIncoming) {
            binding.layoutIncomingActions.visibility = View.VISIBLE
        } else {
            binding.layoutIncomingActions.visibility = View.GONE
        }

        binding.btnAccept.setOnClickListener {
            callId?.let { id ->
                lifecycleScope.launch {
                    WebRtcCallManager.acceptIncomingCall(id)
                }
            }
        }

        binding.btnReject.setOnClickListener {
            callId?.let { id ->
                lifecycleScope.launch {
                    WebRtcCallManager.rejectIncomingCall(id)
                }
            }
        }

        binding.btnHangup.setOnClickListener {
            callId?.let { id ->
                lifecycleScope.launch {
                    WebRtcCallManager.endCall(id)
                }
            }
        }

        binding.btnMute.setOnClickListener {
            isMuted = !isMuted
            WebRtcCallManager.muteCall(isMuted)
            binding.btnMute.text = if (isMuted) "Unmute" else "Mute"
            binding.btnMute.isSelected = isMuted
        }

        binding.btnSpeaker.setOnClickListener {
            isSpeakerOn = !isSpeakerOn
            WebRtcCallManager.speakerPhone(isSpeakerOn)
            binding.btnSpeaker.text = if (isSpeakerOn) "Earpiece" else "Speaker"
            binding.btnSpeaker.isSelected = isSpeakerOn
        }

        lifecycleScope.launch {
            WebRtcCallManager.callState.collect { state ->
                handleCallStateChange(state)
            }
        }
    }

    private fun handleCallStateChange(state: CallState) {
        when (state) {
            is CallState.Idle -> {
                finish()
            }
            is CallState.RingingIncoming -> {
                binding.tvCallStatus.text = "Incoming SIM call..."
                binding.layoutIncomingActions.visibility = View.VISIBLE
                binding.tvCallTimer.visibility = View.GONE
            }
            is CallState.Accepting -> {
                binding.tvCallStatus.text = "Accepting..."
                binding.layoutIncomingActions.visibility = View.GONE
            }
            is CallState.Connecting -> {
                binding.tvCallStatus.text = "Connecting WebRTC..."
                binding.layoutIncomingActions.visibility = View.GONE
            }
            is CallState.Connected -> {
                binding.tvCallStatus.text = "Connected"
                binding.layoutIncomingActions.visibility = View.GONE
                binding.tvCallTimer.visibility = View.VISIBLE
                if (callStartTime == 0L) {
                    callStartTime = state.startTime
                    timerHandler.post(timerRunnable)
                }
            }
            is CallState.RingingOutgoing -> {
                binding.tvCallStatus.text = "Dialing on SIM..."
                binding.layoutIncomingActions.visibility = View.GONE
            }
            is CallState.Disconnecting -> {
                binding.tvCallStatus.text = "Disconnecting..."
            }
            is CallState.Ended -> {
                binding.tvCallStatus.text = "Call Ended"
                timerHandler.removeCallbacks(timerRunnable)
                finish()
            }
            is CallState.Failed -> {
                binding.tvCallStatus.text = "Call Failed: ${state.reason}"
                timerHandler.removeCallbacks(timerRunnable)
                Handler(Looper.getMainLooper()).postDelayed({ finish() }, 2000)
            }
        }
    }

    override fun onDestroy() {
        timerHandler.removeCallbacks(timerRunnable)
        super.onDestroy()
    }
}
