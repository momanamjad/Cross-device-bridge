import SwiftUI

struct SMSMessageRow: View {
    let message: SMSMessage
    @State private var justCopied = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                // Sender Address
                HStack(spacing: 6) {
                    Image(systemName: "bubble.left.fill")
                        .font(.caption)
                        .foregroundColor(.blue)
                    Text(message.sender)
                        .font(.subheadline)
                        .bold()
                        .foregroundColor(.primary)
                }
                
                Spacer()
                
                // Timestamp
                Text(formattedDate(message.timestamp))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            
            // Content
            Text(message.content)
                .font(.body)
                .foregroundColor(.primary)
                .lineLimit(6)
            
            // Smart OTP & Hash Actions
            if message.extractedOtp != nil || message.smsRetrieverHash != nil {
                HStack(spacing: 8) {
                    if let otp = message.extractedOtp {
                        Button(action: {
                            UIPasteboard.general.string = otp
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)
                            withAnimation {
                                justCopied = true
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                                withAnimation {
                                    justCopied = false
                                }
                            }
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: justCopied ? "checkmark.circle.fill" : "doc.on.doc.fill")
                                    .foregroundColor(justCopied ? .green : .blue)
                                Text(justCopied ? "Copied: \(otp)" : "Copy OTP (\(otp))")
                                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                    .foregroundColor(justCopied ? .green : .blue)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(justCopied ? Color.green.opacity(0.15) : Color.blue.opacity(0.12))
                            .cornerRadius(8)
                        }
                        .buttonStyle(BorderlessButtonStyle())
                    }
                    
                    if let hash = message.smsRetrieverHash {
                        Text("Hash: <\(hash)>")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Color.secondary.opacity(0.1))
                            .cornerRadius(6)
                    }
                    
                    if let ussd = detectedUSSD {
                        Button(action: {
                            UIPasteboard.general.string = ussd
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)
                        }) {
                            HStack(spacing: 4) {
                                Image(systemName: "phone.arrow.up.right.fill")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                                Text("Dial: \(ussd)")
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.orange)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Color.orange.opacity(0.12))
                            .cornerRadius(6)
                        }
                        .buttonStyle(BorderlessButtonStyle())
                    }
                    
                    Spacer()
                }
                .padding(.top, 2)
            }

        }
        .padding(.vertical, 6)
    }
    
    private var detectedUSSD: String? {
        let pattern = #"\*([0-9]{3,5})#"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: message.content, range: NSRange(message.content.startIndex..., in: message.content)),
           let range = Range(match.range, in: message.content) {
            return String(message.content[range])
        }
        return nil
    }
    
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        if Calendar.current.isDateInToday(date) {
            formatter.dateStyle = .none
            formatter.timeStyle = .short
        } else {
            formatter.dateFormat = "MMM d, HH:mm"
        }
        return formatter.string(from: date)
    }
}
