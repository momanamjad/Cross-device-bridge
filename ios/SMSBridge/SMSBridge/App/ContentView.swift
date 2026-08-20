import SwiftUI

struct ContentView: View {
    @StateObject private var callVM = CallViewModel()
    @StateObject private var smsVM = SMSViewModel()
    
    var body: some View {
        TabView {
            NavigationStack {
                CallsTabView(callVM: callVM)
            }
            .tabItem {
                Label("Calls", systemImage: "phone.fill")
            }
            
            NavigationStack {
                SMSTabView(smsVM: smsVM)
            }
            .tabItem {
                Label("SMS", systemImage: "message.fill")
            }
            
            NavigationStack {
                DialerView(callVM: callVM)
            }
            .tabItem {
                Label("Dialer", systemImage: "keypad.fill")
            }
            
            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape.fill")
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { if case .ringing(let info) = callVM.callState, info.isIncoming { return true } else { return false } },
            set: { _ in }
        )) {
            if case .ringing(let info) = callVM.callState {
                IncomingCallSheet(callViewModel: callVM, callInfo: info)
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: {
                switch callVM.callState {
                case .connecting, .connected: return true
                case .ringing(let info) where !info.isIncoming: return true
                default: return false
                }
            },
            set: { _ in }
        )) {
            ActiveCallView(callViewModel: callVM)
        }
        .onAppear {
            setupConnectionIfNeeded()
        }
    }
    
    private func setupConnectionIfNeeded() {
        let ip = UserDefaults.standard.string(forKey: "server_ip") ?? ""
        let port = UserDefaults.standard.integer(forKey: "server_port")
        let token = UserDefaults.standard.string(forKey: "api_token") ?? ""
        
        if !ip.isEmpty && port != 0 && !token.isEmpty {
            WebSocketService.shared.connect(host: ip, port: port, token: token)
            smsVM.startListening(host: ip, port: port, token: token)
            callVM.fetchHistory(host: ip, port: port, token: token)
        }
    }
}
