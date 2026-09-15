import Foundation
import Combine

class LogManager: ObservableObject {
    static let shared = LogManager()
    
    @Published private(set) var logEntries: [String] = []
    private let queue = DispatchQueue(label: "com.momanamjad.smsbridge.logmanager", attributes: .concurrent)
    private let dateFormatter: DateFormatter
    private let maxEntries = 600

    private init() {
        dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "HH:mm:ss.SSS"
        log("LogManager initialized", tag: "SYSTEM")
    }

    func log(_ message: String, tag: String = "APP") {
        let timestamp = dateFormatter.string(from: Date())
        let line = "[\(timestamp)] [\(tag)] \(message)"
        
        #if DEBUG
        print(line)
        #endif

        queue.async(flags: .barrier) {
            DispatchQueue.main.async {
                self.logEntries.append(line)
                if self.logEntries.count > self.maxEntries {
                    self.logEntries.removeFirst(self.logEntries.count - self.maxEntries)
                }
            }
        }
    }

    func getLogsFormatted() -> String {
        return logEntries.joined(separator: "\n")
    }

    func clear() {
        queue.async(flags: .barrier) {
            DispatchQueue.main.async {
                self.logEntries.removeAll()
                self.log("Logs cleared", tag: "SYSTEM")
            }
        }
    }
}

public func AppLog(_ message: String, tag: String = "APP") {
    LogManager.shared.log(message, tag: tag)
}
