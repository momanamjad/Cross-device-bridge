import SwiftUI

struct SettingsView: View {
    @Binding var selectedTab: Int
    @ObservedObject private var ws = WebSocketService.shared
    
    @State private var serverIP: String = UserDefaults.standard.string(forKey: "server_ip") ?? ""
    @State private var serverPort = String(UserDefaults.standard.integer(forKey: "server_port") == 0 ? 9000 : UserDefaults.standard.integer(forKey: "server_port"))
    @State private var apiToken = UserDefaults.standard.string(forKey: "api_token") ?? ""
    @State private var registerSecret = "super_secret_bridge_key"
    
    @State private var alertMessage = ""
    @State private var showAlert = false
    @State private var isRegistering = false
    @State private var isDiscovering = false
    
    @State private var showingScanner = false
    @State private var scannedCode: String?
    
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
                    TextField("IP Address", text: $serverIP)
                        .keyboardType(.default)
                        .multilineTextAlignment(.trailing)
                }
                
                HStack {
                    Text("Port")
                    Spacer()
                    TextField("9000", text: $serverPort)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
                
                Button(action: {
                    showingScanner = true
                }) {
                    HStack {
                        Image(systemName: "qrcode.viewfinder")
                            .foregroundColor(.accentColor)
                        Text("Scan QR from Android")
                            .foregroundColor(.accentColor)
                            .bold()
                    }
                }
                
                Button(action: discoverServer) {
                    HStack {
                        if isDiscovering {
                            ProgressView()
                                .padding(.trailing, 4)
                        }
                        Image(systemName: "antenna.radiowaves.left.and.right")
                        Text(isDiscovering ? "Scanning Network..." : "Discover Server on Wi-Fi")
                    }
                }
                .disabled(isDiscovering)
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
                    let impact = UIImpactFeedbackGenerator(style: .medium)
                    impact.impactOccurred()
                    saveSettings()
                    connect()
                }
                .disabled(serverIP.isEmpty || serverPort.isEmpty || apiToken.isEmpty)
                
                Button("Forget Credentials") {
                    let impact = UIImpactFeedbackGenerator(style: .heavy)
                    impact.impactOccurred()
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
                    selectedTab = 2
                }) {
                    HStack(spacing: 5) {
                        Image(systemName: "chevron.left")
                            .bold()
                        Text("Back")
                    }
                }
            }
        }
        .alert(isPresented: $showAlert) {
            Alert(title: Text("Settings"), message: Text(alertMessage), dismissButton: .default(Text("OK")))
        }
        .sheet(isPresented: $showingScanner) {
            QRCodeScannerView(scannedCode: $scannedCode)
        }
        .onChange(of: scannedCode) { newCode in
            if let code = newCode, let data = code.data(using: .utf8) {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let ip = json["ip"] as? String { self.serverIP = ip }
                    if let port = json["port"] as? Int { self.serverPort = String(port) }
                    if let secret = json["secret"] as? String { self.registerSecret = secret }
                    
                    self.alertMessage = "QR Code scanned successfully! Registering..."
                    self.showAlert = true
                    
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.success)
                    
                    // Auto register
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        self.registerDevice()
                    }
                } else {
                    self.alertMessage = "Invalid QR Code format."
                    self.showAlert = true
                }
            }
        }
    }
    
    private func saveSettings() {
        let portInt = Int(serverPort) ?? 9000
        UserDefaults.standard.set(serverIP, forKey: "server_ip")
        UserDefaults.standard.set(portInt, forKey: "server_port")
        UserDefaults.standard.set(apiToken, forKey: "api_token")
        UserDefaults.standard.set(registerSecret, forKey: "register_secret")
        
        alertMessage = "Configuration saved successfully!"
        showAlert = true
    }
    
    private func connect() {
        let portInt = Int(serverPort) ?? 9000
        ws.connect(host: serverIP, port: portInt, token: apiToken)
    }
    
    private func discoverServer() {
        isDiscovering = true
        let port = Int(serverPort) ?? 9000
        
        Task {
            let candidates = generateCandidateIPs()
            for ip in candidates {
                if let foundIP = await tryHealth(ip: ip, port: port) {
                    DispatchQueue.main.async {
                        self.serverIP = foundIP
                        self.isDiscovering = false
                        self.alertMessage = "Found Android server at \(foundIP)!"
                        self.showAlert = true
                        let impact = UINotificationFeedbackGenerator()
                        impact.notificationOccurred(.success)
                    }
                    return
                }
            }
            
            DispatchQueue.main.async {
                self.isDiscovering = false
                self.alertMessage = "Could not find Android server on network."
                self.showAlert = true
                let impact = UINotificationFeedbackGenerator()
                impact.notificationOccurred(.error)
            }
        }
    }
    
    private func tryHealth(ip: String, port: Int) async -> String? {
        guard let url = URL(string: "http://\(ip):\(port)/api/health") else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.0
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else { return nil }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let serverIP = json["server_ip"] as? String,
               serverIP != "127.0.0.1" {
                return serverIP
            }
            return ip
        } catch {
            return nil
        }
    }
    
    private func generateCandidateIPs() -> [String] {
        var candidates: [String] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let firstAddr = ifaddr else { return candidates }
        defer { freeifaddrs(ifaddr) }
        
        for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
            let addr = ptr.pointee.ifa_addr.pointee
            if addr.sa_family == UInt8(AF_INET) {
                let name = String(cString: ptr.pointee.ifa_name)
                if name == "en0" || name == "en1" {
                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    getnameinfo(ptr.pointee.ifa_addr, socklen_t(addr.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST)
                    let myIP = String(cString: hostname)
                    let parts = myIP.split(separator: ".")
                    if parts.count == 4, let subnet = parts.prefix(3).joined(separator: ".") as String? {
                        for i in 1...254 {
                            let candidate = "\(subnet).\(i)"
                            if candidate != myIP { candidates.append(candidate) }
                        }
                    }
                }
            }
        }
        
        if candidates.isEmpty {
            for subnet in ["192.168.1", "192.168.0", "100.254.0", "10.0.0"] {
                for i in 1...254 { candidates.append("\(subnet).\(i)") }
            }
        }
        return candidates
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
                    UserDefaults.standard.set(self.registerSecret, forKey: "register_secret")
                    self.isRegistering = false
                    self.alertMessage = "Device Registered! Token saved."
                    self.showAlert = true
                    
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.success)
                    
                    self.connect()
                }
            } catch {
                DispatchQueue.main.async {
                    self.isRegistering = false
                    self.alertMessage = "Registration failed: \(error.localizedDescription)"
                    self.showAlert = true
                    
                    let impact = UINotificationFeedbackGenerator()
                    impact.notificationOccurred(.error)
                }
            }
        }
    }
    
    private func forgetSettings() {
        ws.disconnect()
        UserDefaults.standard.removeObject(forKey: "server_ip")
        UserDefaults.standard.removeObject(forKey: "server_port")
        UserDefaults.standard.removeObject(forKey: "api_token")
        UserDefaults.standard.removeObject(forKey: "register_secret")
        
        serverIP = ""
        serverPort = "9000"
        apiToken = ""
        registerSecret = ""
        
        alertMessage = "All credentials cleared."
        showAlert = true
    }
}
