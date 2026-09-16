import SwiftUI

struct CallHistoryRow: View {
    let record: Call
    
    var body: some View {
        HStack(spacing: 15) {
            // Directional icon
            Image(systemName: record.isIncoming ? "phone.arrow.down.left" : "phone.arrow.up.right")
                .font(.title3)
                .foregroundColor(record.isIncoming ? .green : .blue)
                .frame(width: 30)
            
            VStack(alignment: .leading, spacing: 4) {
                // Phone number
                Text(record.number)
                    .font(.body)
                    .bold()
                
                // Duration details
                Text(formattedDuration(record.duration))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // WhatsApp Action
            if let waURL = whatsappURL {
                Button(action: {
                    let impact = UIImpactFeedbackGenerator(style: .light)
                    impact.impactOccurred()
                    UIApplication.shared.open(waURL)
                }) {
                    Image(systemName: "message.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.white)
                        .padding(6)
                        .background(Color.green)
                        .clipShape(Circle())
                }
                .buttonStyle(BorderlessButtonStyle())
            }
            
            // Timestamp
            Text(formattedDate(record.timestamp))
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
    
    private var whatsappURL: URL? {
        let raw = record.number.filter { $0.isNumber }
        var phone = raw
        if phone.hasPrefix("00") {
            phone = String(phone.dropFirst(2))
        } else if phone.hasPrefix("0") {
            phone = "92" + phone.dropFirst()
        }
        guard !phone.isEmpty else { return nil }
        return URL(string: "https://wa.me/\(phone)")
    }
    
    private func formattedDuration(_ seconds: TimeInterval) -> String {
        if seconds == 0 { return "No answer" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        if mins > 0 {
            return "\(mins)m \(secs)s"
        }
        return "\(secs)s"
    }
    
    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        if Calendar.current.isDateInToday(date) {
            formatter.dateStyle = .none
            formatter.timeStyle = .short
        } else {
            formatter.dateStyle = .short
            formatter.timeStyle = .none
        }
        return formatter.string(from: date)
    }
}
