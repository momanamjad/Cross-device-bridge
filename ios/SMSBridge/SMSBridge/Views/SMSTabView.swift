import SwiftUI

struct SMSTabView: View {
    @ObservedObject var smsVM: SMSViewModel
    
    @State private var searchText = ""
    
    private var filteredMessages: [SMSMessage] {
        if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return smsVM.messages
        }
        return smsVM.messages.filter { msg in
            msg.sender.localizedCaseInsensitiveContains(searchText) ||
            msg.content.localizedCaseInsensitiveContains(searchText) ||
            (msg.extractedOtp?.contains(searchText) ?? false)
        }
    }
    
    var body: some View {
        List {
            if filteredMessages.isEmpty {
                ContentUnavailableView(
                    smsVM.messages.isEmpty ? "No Messages" : "No Results",
                    systemImage: smsVM.messages.isEmpty ? "message" : "magnifyingglass",
                    description: Text(smsVM.messages.isEmpty ? "Incoming SMS from your Realme device will appear here in real-time." : "No messages found matching '\(searchText)'.")
                )
            } else {
                ForEach(filteredMessages) { message in
                    SMSMessageRow(message: message)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search sender, OTP, or text...")
        .navigationTitle("SMS Logs")
        .refreshable {
            refreshSMSHistory()
        }
        .onAppear {
            refreshSMSHistory()
        }
    }
    
    private func refreshSMSHistory() {
        let ip = UserDefaults.standard.string(forKey: "server_ip") ?? ""
        let port = UserDefaults.standard.integer(forKey: "server_port")
        let token = UserDefaults.standard.string(forKey: "api_token") ?? ""
        let secret = UserDefaults.standard.string(forKey: "register_secret") ?? ""
        
        if !ip.isEmpty && port != 0 && !token.isEmpty && !secret.isEmpty {
            smsVM.fetchSMSHistory(host: ip, port: port, token: token, secret: secret)
        }
    }
}
