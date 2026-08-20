import SwiftUI

struct IncomingCallSheet: View {
    @ObservedObject var callViewModel: CallViewModel
    let callInfo: CallInfo
    @State private var isAnimating = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 50) {
                Spacer()
                
                // Caller Details
                VStack(spacing: 16) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 96))
                        .foregroundColor(.gray)
                    
                    Text(callInfo.callerName ?? callInfo.callerId)
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .scaleEffect(isAnimating ? 1.03 : 0.98)
                        .onAppear {
                            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                                isAnimating = true
                            }
                        }
                    
                    Text("Incoming Cell Call")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.green)
                        .tracking(1)
                }
                
                Spacer()
                
                // Action Buttons
                HStack(spacing: 60) {
                    // Decline
                    Button(action: {
                        callViewModel.rejectCall()
                    }) {
                        VStack(spacing: 8) {
                            Image(systemName: "phone.down.fill")
                                .font(.title)
                                .foregroundColor(.white)
                                .frame(width: 75, height: 75)
                                .background(Color.red)
                                .clipShape(Circle())
                            Text("Decline")
                                .font(.footnote)
                                .foregroundColor(.white)
                        }
                    }
                    
                    // Accept
                    Button(action: {
                        callViewModel.acceptCall()
                    }) {
                        VStack(spacing: 8) {
                            Image(systemName: "phone.fill")
                                .font(.title)
                                .foregroundColor(.white)
                                .frame(width: 75, height: 75)
                                .background(Color.green)
                                .clipShape(Circle())
                            Text("Accept")
                                .font(.footnote)
                                .foregroundColor(.white)
                        }
                    }
                }
                .padding(.bottom, 60)
            }
        }
    }
}
