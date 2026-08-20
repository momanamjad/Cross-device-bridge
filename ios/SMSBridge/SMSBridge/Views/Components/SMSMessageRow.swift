import SwiftUI

struct SMSMessageRow: View {
    let message: SMSMessage
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                // Sender Address
                Text(message.sender)
                    .font(.subheadline)
                    .bold()
                    .foregroundColor(.blue)
                
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
                .lineLimit(5)
        }
        .padding(.vertical, 6)
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
