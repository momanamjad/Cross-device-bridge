import SwiftUI

struct PhoneKeypad: View {
    @Binding var phoneNumber: String
    
    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    private let keys = [
        "1", "2", "3",
        "4", "5", "6",
        "7", "8", "9",
        "*", "0", "#"
    ]
    
    var body: some View {
        LazyVGrid(columns: columns, spacing: 20) {
            ForEach(keys, id: \.self) { key in
                Button(action: {
                    let impact = UIImpactFeedbackGenerator(style: .light)
                    impact.impactOccurred()
                    phoneNumber.append(key)
                }) {
                    VStack(spacing: 2) {
                        Text(key)
                            .font(.system(size: 32, weight: .regular))
                            .foregroundColor(.primary)
                        
                        Text(letters(for: key))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 75)
                    .background(Color(.systemGray6))
                    .clipShape(Circle())
                }
            }
        }
    }
    
    private func letters(for key: String) -> String {
        switch key {
        case "2": return "A B C"
        case "3": return "D E F"
        case "4": return "G H I"
        case "5": return "J K L"
        case "6": return "M N O"
        case "7": return "P Q R S"
        case "8": return "T U V"
        case "9": return "W X Y Z"
        case "0": return "+"
        default: return " "
        }
    }
}
