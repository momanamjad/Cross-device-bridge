import Foundation
import Combine

class SMSViewModel: ObservableObject {
    @Published var messages: [SMSMessage] = []
    
    private let ws = WebSocketService.shared
    
    init() {
        setupWebSocketListeners()
    }
    
    private func setupWebSocketListeners() {
        ws.onSMSReceived = { [weak self] message in
            DispatchQueue.main.async {
                // Insert message at the top of the list
                if !(self?.messages.contains(where: { $0.id == message.id }) ?? false) {
                    self?.messages.insert(message, at: 0)
                }
            }
        }
    }
    
    func fetchSMSHistory(host: String, port: Int, token: String) {
        Task {
            do {
                let history = try await BackendService.shared.fetchMessages(host: host, port: port, token: token)
                DispatchQueue.main.async {
                    self.messages = history
                }
            } catch {
                print("Failed to fetch SMS history: \(error)")
            }
        }
    }
    
    func startListening(host: String, port: Int, token: String) {
        fetchSMSHistory(host: host, port: port, token: token)
    }
}
