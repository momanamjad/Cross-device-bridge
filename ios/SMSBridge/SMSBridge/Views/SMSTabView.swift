import SwiftUI

struct SMSTabView: View {
    @ObservedObject var smsVM: SMSViewModel
    @ObservedObject private var ws = WebSocketService.shared
    
    @State private var searchText = ""
    
    private var filteredMessages: [SMSMessage] {
        var list = smsVM.messages
        
        // 1. Category Filter
        switch smsVM.selectedFilter {
        case .all:
            break
        case .otps:
            list = list.filter { $0.extractedOtp != nil }
        case .services:
            list = list.filter { $0.sender.count <= 6 || $0.sender.rangeOfCharacter(from: .letters) != nil }
        }
        
        // 2. Search Text
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            list = list.filter { msg in
                msg.sender.localizedCaseInsensitiveContains(query) ||
                msg.content.localizedCaseInsensitiveContains(query) ||
                (msg.extractedOtp?.localizedCaseInsensitiveContains(query) ?? false)
            }
        }
        return list
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Live Connection Status Header Pill
            HStack {
                HStack(spacing: 6) {
                    Circle()
                        .fill(ws.isConnected ? Color.green : Color.orange)
                        .frame(width: 8, height: 8)
                    Text(ws.isConnected ? "Connected to Realme" : "Offline (Showing Saved Logs)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(ws.isConnected ? .green : .orange)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(ws.isConnected ? Color.green.opacity(0.12) : Color.orange.opacity(0.12))
                .cornerRadius(12)
                
                Spacer()
                
                Text("\(smsVM.messages.count) saved")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal)
            .padding(.top, 6)
            .padding(.bottom, 6)
            
            // Category Filter Picker
            Picker("Filter", selection: $smsVM.selectedFilter) {
                ForEach(SMSFilter.allCases) { filter in
                    Text(filter.rawValue).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.bottom, 8)
            
            List {
                if filteredMessages.isEmpty {
                    ContentUnavailableView(
                        smsVM.messages.isEmpty ? "No Messages" : "No Matches",
                        systemImage: smsVM.messages.isEmpty ? "message" : "magnifyingglass",
                        description: Text(smsVM.messages.isEmpty ? "Incoming SMS from your Realme device will be saved and displayed here." : "No messages matching '\(searchText)'.")
                    )
                } else {
                    ForEach(filteredMessages) { message in
                        SMSMessageRow(message: message)
                    }
                    .onDelete { indexSet in
                        smsVM.deleteMessage(at: indexSet, in: filteredMessages)
                    }
                }
            }
            .listStyle(.insetGrouped)
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
