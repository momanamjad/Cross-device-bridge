import Foundation

class LocalStore {
    static let shared = LocalStore()
    
    private let fileManager = FileManager.default
    private let queue = DispatchQueue(label: "com.momanamjad.smsbridge.localstore", qos: .utility)
    
    private var documentsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
    
    private var smsFileURL: URL {
        documentsDirectory.appendingPathComponent("sms_history.json")
    }
    
    private var callsFileURL: URL {
        documentsDirectory.appendingPathComponent("calls_history.json")
    }
    
    private init() {}
    
    // MARK: - SMS Persistence
    
    func loadMessages() -> [SMSMessage] {
        guard fileManager.fileExists(atPath: smsFileURL.path) else { return [] }
        do {
            let data = try Data(contentsOf: smsFileURL)
            let messages = try JSONDecoder().decode([SMSMessage].self, from: data)
            AppLog("Loaded \(messages.count) cached SMS messages from local disk", tag: "STORE")
            return messages
        } catch {
            AppLog("Failed to load cached SMS messages: \(error.localizedDescription)", tag: "STORE")
            return []
        }
    }
    
    func saveMessages(_ messages: [SMSMessage]) {
        queue.async { [weak self] in
            guard let self = self else { return }
            do {
                let data = try JSONEncoder().encode(messages)
                try data.write(to: self.smsFileURL, options: .atomic)
            } catch {
                AppLog("Failed to save SMS messages to disk: \(error.localizedDescription)", tag: "STORE")
            }
        }
    }
    
    func deleteMessage(id: String, currentMessages: [SMSMessage]) -> [SMSMessage] {
        let updated = currentMessages.filter { $0.id != id }
        saveMessages(updated)
        return updated
    }
    
    // MARK: - Calls Persistence
    
    func loadCalls() -> [Call] {
        guard fileManager.fileExists(atPath: callsFileURL.path) else { return [] }
        do {
            let data = try Data(contentsOf: callsFileURL)
            let calls = try JSONDecoder().decode([Call].self, from: data)
            AppLog("Loaded \(calls.count) cached call logs from local disk", tag: "STORE")
            return calls
        } catch {
            AppLog("Failed to load cached calls: \(error.localizedDescription)", tag: "STORE")
            return []
        }
    }
    
    func saveCalls(_ calls: [Call]) {
        queue.async { [weak self] in
            guard let self = self else { return }
            do {
                let data = try JSONEncoder().encode(calls)
                try data.write(to: self.callsFileURL, options: .atomic)
            } catch {
                AppLog("Failed to save calls to disk: \(error.localizedDescription)", tag: "STORE")
            }
        }
    }
}
