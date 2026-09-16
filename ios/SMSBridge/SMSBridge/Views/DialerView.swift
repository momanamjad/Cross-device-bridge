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
            
            // Dual-Bridge Info & WhatsApp quick action
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "simcard.fill")
                        .font(.caption2)
                        .foregroundColor(.blue)
                    Text("Dual-Bridge: Calls place on Realme SIM")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                
                if !phoneNumber.isEmpty, let waURL = whatsappURL {
                    Button(action: {
                        let impact = UIImpactFeedbackGenerator(style: .medium)
                        impact.impactOccurred()
                        UIApplication.shared.open(waURL)
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: "message.fill")
                            Text("Call / Chat on WhatsApp")
                        }
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.green)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color.green.opacity(0.12))
                        .cornerRadius(12)
                    }
                }
            }
            
            Spacer()
            
            // Keypad Layout
            PhoneKeypad(phoneNumber: $phoneNumber)
                .padding(.horizontal, 30)
            
            // Action Buttons
            HStack(spacing: 40) {
                // Delete Button
                Button(action: {
                    let impact = UIImpactFeedbackGenerator(style: .rigid)
                    impact.impactOccurred()
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
                    let impact = UIImpactFeedbackGenerator(style: .heavy)
                    impact.impactOccurred()
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
    
    private var whatsappURL: URL? {
        let raw = phoneNumber.filter { $0.isNumber }
        var phone = raw
        if phone.hasPrefix("00") {
            phone = String(phone.dropFirst(2))
        } else if phone.hasPrefix("0") {
            phone = "92" + phone.dropFirst()
        }
        guard !phone.isEmpty else { return nil }
        return URL(string: "https://wa.me/\(phone)")
    }
}
