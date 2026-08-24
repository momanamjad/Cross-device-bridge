import SwiftUI

struct SettingsView: View {
    @Binding var selectedTab: Int
    @ObservedObject private var ws = WebSocketService.shared
    
    @State private var serverIP: String = {
        let saved = UserDefaults.standard.string(forKey: "server_ip") ?? ""
        return saved.isEmpty ? "192.168.18.147" : saved
    }()
    @State private var serverPort = String(UserDefaults.standard.integer(forKey: "server_port") == 0 ? 9000 : UserDefaults.standard.integer(forKey: "server_port"))
    @State private var apiToken = UserDefaults.standard.string(forKey: "api_token") ?? ""
    @State private var registerSecret = "super_secret_bridge_key"
    
    @State private var alertMessage = ""
    @State private var showAlert = false
    @State private var isRegistering = false
    
    var body: some View {
        Form {
            Section(header: Text("Connection Status")) {
                HStack {
                    Text("Status:")
                    Spacer()
                    if ws.isConnected {
                        Text("Connected ✅")
                            .foregroundColor(.green)
                            .bold()
                    } else {
                        Text("Disconnected ❌")
                            .foregroundColor(.red)
                            .bold()
                    }
                }
            }
            
            Section(header: Text("Server Settings")) {
                HStack {
                    Text("IP Address")
                    Spacer()
                    TextField("192.168.1.100", text: $serverIP)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                }
                
                HStack {
                    Text("Port")
                    Spacer()
                    TextField("9000", text: $serverPort)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
            }
            
            Section(header: Text("Authentication")) {
                HStack {
                    Text("API Token")
                    Spacer()
                    TextField("Enter Token or Register", text: $apiToken)
                        .multilineTextAlignment(.trailing)
                }
            }
            
            Section(header: Text("Register New Device")) {
                SecureField("Backend Register Secret", text: $registerSecret)
                
                Button(action: registerDevice) {
                    if isRegistering {
                        ProgressView()
                    } else {
                        Text("Register iPhone as Client")
                    }
                }
                .disabled(serverIP.isEmpty || serverPort.isEmpty || registerSecret.isEmpty || isRegistering)
            }
            
            Section {
                Button("Connect & Save") {
                    saveSettings()
                    connect()
                }
                .disabled(serverIP.isEmpty || serverPort.isEmpty || apiToken.isEmpty)
                
                Button("Forget Credentials") {
                    forgetSettings()
                }
                .foregroundColor(.red)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: {
                    selectedTab = 2 // Switch back to Dialer tab
                }) {
                    HStack(spacing: 5) {
                        Image(systemName: "chevron.left")
                            .bold()
                        Text("Back")
                    }
                }
            }
            
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: {
                    selectedTab = 2 // Switch back to Dialer tab
                }) {
                    Image(systemName: "keypad")
                }
            }
        }
        .alert(isPresented: $showAlert) {
            Alert(title: Text("Settings"), message: Text(alertMessage), dismissButton: .default(Text("OK")))
        }
    }
    
    private func saveSettings() {
        let portInt = Int(serverPort) ?? 9000
        UserDefaults.standard.set(serverIP, forKey: "server_ip")
        UserDefaults.standard.set(portInt, forKey: "server_port")
        UserDefaults.standard.set(apiToken, forKey: "api_token")
        
        alertMessage = "Configuration saved successfully!"
        showAlert = true
    }
    
    private func connect() {
        let portInt = Int(serverPort) ?? 9000
        ws.connect(host: serverIP, port: portInt, token: apiToken)
    }
    
    private func registerDevice() {
        guard let portInt = Int(serverPort) else {
            alertMessage = "Invalid port number"
            showAlert = true
            return
        }
        
        isRegistering = true
        Task {
            do {
                let token = try await BackendService.shared.registerDevice(
                    host: serverIP,
                    port: portInt,
                    secret: registerSecret
                )
                DispatchQueue.main.async {
                    self.apiToken = token
                    UserDefaults.standard.set(token, forKey: "api_token")
                    UserDefaults.standard.set(self.serverIP, forKey: "server_ip")
                    UserDefaults.standard.set(portInt, forKey: "server_port")
                    self.isRegistering = false
                    self.alertMessage = "Device Registered! Token saved."
                    self.showAlert = true
                    
                    // Auto connect after successful registration
                    self.connect()
                }
            } catch {
                DispatchQueue.main.async {
                    self.isRegistering = false
                    self.alertMessage = "Registration failed: \(error.localizedDescription)"
                    self.showAlert = true
                }
            }
        }
    }
    
    private func forgetSettings() {
        ws.disconnect()
        UserDefaults.standard.removeObject(forKey: "server_ip")
        UserDefaults.standard.removeObject(forKey: "server_port")
        UserDefaults.standard.removeObject(forKey: "api_token")
        
        serverIP = ""
        serverPort = "9000"
        apiToken = ""
        registerSecret = ""
        
        alertMessage = "All credentials cleared."
        showAlert = true
    }
}
