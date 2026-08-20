import SwiftUI

struct ActiveCallView: View {
    @ObservedObject var callViewModel: CallViewModel
    @State private var isMuted = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 40) {
                Spacer()
                
                // Caller Name / Details
                VStack(spacing: 8) {
                    if case .ringing(let info) = callViewModel.callState {
                        Text(info.callerName ?? info.callerId)
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                        Text("Calling...")
                            .font(.system(size: 18))
                            .foregroundColor(.gray)
                    } else if case .connecting = callViewModel.callState {
                        Text("Connecting...")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.gray)
                    } else if case .connected(let info, _) = callViewModel.callState {
                        Text(info.callerName ?? info.callerId)
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                        
                        Text(formattedDuration(callViewModel.callDuration))
                            .font(.system(size: 40, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.top, 10)
                    }
                }
                
                Spacer()
                
                // Controls panel
                HStack(spacing: 40) {
                    // Mute control
                    Button(action: {
                        isMuted.toggle()
                        callViewModel.micMuted = isMuted
                        // Typically we would mute local audio track in WebRTCService
                    }) {
                        VStack(spacing: 8) {
                            Image(systemName: isMuted ? "mic.slash.fill" : "mic.fill")
                                .font(.title2)
                                .foregroundColor(.white)
                                .frame(width: 65, height: 65)
                                .background(isMuted ? Color.red : Color.gray.opacity(0.3))
                                .clipShape(Circle())
                            Text(isMuted ? "Unmute" : "Mute")
                                .font(.caption2)
                                .foregroundColor(.gray)
                        }
                    }
                    
                    // Speaker control
                    Button(action: {
                        callViewModel.toggleSpeaker()
                    }) {
                        VStack(spacing: 8) {
                            Image(systemName: "speaker.wave.3.fill")
                                .font(.title2)
                                .foregroundColor(.white)
                                .frame(width: 65, height: 65)
                                .background(callViewModel.audioOutputSpeaker ? Color.blue : Color.gray.opacity(0.3))
                                .clipShape(Circle())
                            Text("Speaker")
                                .font(.caption2)
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(.bottom, 30)
                
                // Hang up button
                Button(action: {
                    callViewModel.endCall()
                }) {
                    Image(systemName: "phone.down.fill")
                        .font(.title)
                        .foregroundColor(.white)
                        .frame(width: 75, height: 75)
                        .background(Color.red)
                        .clipShape(Circle())
                }
                .padding(.bottom, 60)
            }
            .padding()
        }
    }
    
    private func formattedDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, secs)
    }
}
