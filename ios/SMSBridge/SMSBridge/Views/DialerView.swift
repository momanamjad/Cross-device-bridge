import SwiftUI

struct DialerView: View {
    @ObservedObject var callVM: CallViewModel
    @State private var phoneNumber = ""
    
    var body: some View {
        VStack(spacing: 30) {
            Spacer()
            
            // Number Display
            Text(phoneNumber.isEmpty ? "Enter Number" : phoneNumber)
                .font(.system(size: 36, weight: .semibold, design: .monospaced))
                .foregroundColor(phoneNumber.isEmpty ? .gray.opacity(0.6) : .primary)
                .padding(.horizontal)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(height: 50)
            
            Spacer()
            
            // Keypad Layout
            PhoneKeypad(phoneNumber: $phoneNumber)
                .padding(.horizontal, 30)
            
            // Action Buttons
            HStack(spacing: 40) {
                // Delete Button
                Button(action: {
                    if !phoneNumber.isEmpty {
                        phoneNumber.removeLast()
                    }
                }) {
                    Image(systemName: "delete.left.fill")
                        .font(.title)
                        .foregroundColor(.gray)
                        .frame(width: 80, height: 80)
                        .background(Color(.systemGray6))
                        .clipShape(Circle())
                }
                .disabled(phoneNumber.isEmpty)
                
                // Call Button
                Button(action: {
                    callVM.makeCall(phoneNumber: phoneNumber)
                }) {
                    Image(systemName: "phone.fill")
                        .font(.title)
                        .foregroundColor(.white)
                        .frame(width: 80, height: 80)
                        .background(phoneNumber.isEmpty ? Color.green.opacity(0.5) : Color.green)
                        .clipShape(Circle())
                }
                .disabled(phoneNumber.isEmpty)
            }
            .padding(.bottom, 40)
        }
        .navigationTitle("Dialer")
    }
}
