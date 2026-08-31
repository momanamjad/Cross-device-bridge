import SwiftUI

struct SMSTabView: View {
    @ObservedObject var smsVM: SMSViewModel
    
    var body: some View {
        List {
            if smsVM.messages.isEmpty {
                ContentUnavailableView("No Messages", systemImage: "message", description: Text("Incoming SMS from your Realme device will appear here in real-time."))
            } else {
                ForEach(smsVM.messages) { message in
                    SMSMessageRow(message: message)
                }
            }
        }
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
