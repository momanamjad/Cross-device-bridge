import Foundation
import AVFoundation
import UIKit

class AudioService {
    static let shared = AudioService()
    private var audioPlayer: AVAudioPlayer?
    private var isPlayingRingtone = false
    
    private init() {}
    
    func configureAudioSessionForCall() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("Failed to configure audio session: \(error)")
        }
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
