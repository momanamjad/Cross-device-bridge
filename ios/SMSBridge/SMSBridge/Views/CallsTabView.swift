import SwiftUI

struct CallsTabView: View {
    @ObservedObject var callVM: CallViewModel
    
    var body: some View {
        List {
            if callVM.callHistory.isEmpty {
                ContentUnavailableView("No Call History", systemImage: "phone.badge.plus", description: Text("Call records from your Realme device will appear here."))
            } else {
                ForEach(callVM.callHistory) { record in
                    CallHistoryRow(record: record)
                }
            }
        }
        .navigationTitle("Calls")
        .refreshable {
            refreshCallHistory()
        }
        .onAppear {
            refreshCallHistory()
        }
    }
    
    private func refreshCallHistory() {
        let ip = UserDefaults.standard.string(forKey: "server_ip") ?? ""
        let port = UserDefaults.standard.integer(forKey: "server_port")
        let token = UserDefaults.standard.string(forKey: "api_token") ?? ""
        let secret = UserDefaults.standard.string(forKey: "register_secret") ?? ""
        
        if !ip.isEmpty && port != 0 && !token.isEmpty && !secret.isEmpty {
            callVM.fetchHistory(host: ip, port: port, token: token, secret: secret)
        }
    }
}
