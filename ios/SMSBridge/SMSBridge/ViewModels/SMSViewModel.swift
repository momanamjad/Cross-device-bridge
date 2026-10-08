import Foundation
import Combine

enum SMSFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case otps = "⚡ OTPs"
    case services = "🏢 Services"
    
    var id: String { rawValue }
}

class SMSViewModel: ObservableObject {
    @Published var messages: [SMSMessage] = []
    @Published var selectedFilter: SMSFilter = .all
    
    private let ws = WebSocketService.shared
    
    init() {
        // 1. Instant offline load from local disk cache (0ms latency on launch)
        self.messages = LocalStore.shared.loadMessages()
        setupWebSocketListeners()
    }
    
    private func setupWebSocketListeners() {
        ws.onSMSReceived = { [weak self] message in
            DispatchQueue.main.async {
                guard let self = self else { return }
                // Deduplicate by message ID or identical sender+content within 10s
                let isDuplicate = self.messages.contains { existing in
                    existing.id == message.id || (
                        existing.sender == message.sender &&
                        existing.content == message.content &&
                        abs(existing.timestamp.timeIntervalSince(message.timestamp)) < 10
                    )
                }
                if !isDuplicate {
                    self.messages.insert(message, at: 0)
                    LocalStore.shared.saveMessages(self.messages)
                }
            }
        }
    }
    
    func deleteMessage(at offsets: IndexSet, in currentList: [SMSMessage]) {
        for index in offsets {
            let item = currentList[index]
            messages.removeAll { $0.id == item.id }
        }
        LocalStore.shared.saveMessages(messages)
    }
    
    func deleteMessage(id: String) {
        messages.removeAll { $0.id == id }
        LocalStore.shared.saveMessages(messages)
    }
    
    func fetchSMSHistory(host: String, port: Int, token: String, secret: String) {
        Task {
            do {
                let history = try await BackendService.shared.fetchMessages(host: host, port: port, token: token, secret: secret)
                DispatchQueue.main.async {
                    // Merge incoming history with local cache uniquely
                    var merged = history
                    for local in self.messages {
                        if !merged.contains(where: { $0.id == local.id }) {
                            merged.append(local)
                        }
                    }
                    merged.sort { $0.timestamp > $1.timestamp }
                    self.messages = merged
                    LocalStore.shared.saveMessages(self.messages)
                }
            } catch {
                AppLog("Failed to fetch SMS history: \(error.localizedDescription)", tag: "SMS")
            }
        }
    }
    
    func startListening(host: String, port: Int, token: String, secret: String) {
        fetchSMSHistory(host: host, port: port, token: token, secret: secret)
    }
}

