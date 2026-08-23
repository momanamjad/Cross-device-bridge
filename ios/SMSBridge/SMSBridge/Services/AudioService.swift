import Foundation
import AVFoundation
import UIKit

class AudioService {
    static let shared = AudioService()
    private var audioPlayer: AVAudioPlayer?
    private var isPlayingRingtone = false
    private let audioSession = AVAudioSession.sharedInstance()
    
    private init() {}
    
    func setupAudioSession() {
        do {
            // Set category for voice communication
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.deferredDeactivationStrategy, .defaultToSpeaker]
            )
            
            // Activate session
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            
            print("✅ Audio session configured for voice chat")
        } catch {
            print("❌ Audio session error: \(error.localizedDescription)")
        }
    }
    
    func requestMicrophonePermission() async {
        let granted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        if granted {
            print("✅ Microphone permission granted")
        } else {
            print("❌ Microphone permission denied")
        }
    }
    
    func configureAudioSessionForCall() {
        setupAudioSession()
    }
    
    func setSpeakerEnabled(_ enabled: Bool) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
        } catch {
            print("Failed to toggle speaker: \(error)")
        }
    }
    
    func startRingtone() {
        guard !isPlayingRingtone else { return }
        isPlayingRingtone = true
        
        // Play bundled ringtone if available, otherwise beep
        if let path = Bundle.main.path(forResource: "ringtone", ofType: "mp3") {
            let url = URL(fileURLWithPath: path)
            audioPlayer = try? AVAudioPlayer(contentsOf: url)
            audioPlayer?.numberOfLoops = -1
            audioPlayer?.play()
        } else {
            // Fallback: beep repeatedly
            playFallbackBeep()
        }
        
        // Trigger haptics loop
        triggerHapticLoop()
    }
    
    func stopRingtone() {
        isPlayingRingtone = false
        audioPlayer?.stop()
        audioPlayer = nil
    }
    
    private func playFallbackBeep() {
        guard isPlayingRingtone else { return }
        AudioServicesPlaySystemSound(1005) // System sound ID for generic call alert beep
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.playFallbackBeep()
        }
    }
    
    private func triggerHapticLoop() {
        guard isPlayingRingtone else { return }
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.triggerHapticLoop()
        }
    }
}
