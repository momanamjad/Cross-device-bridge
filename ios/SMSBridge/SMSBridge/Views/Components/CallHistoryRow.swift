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
            
            // Timestamp
            Text(formattedDate(record.timestamp))
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
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
