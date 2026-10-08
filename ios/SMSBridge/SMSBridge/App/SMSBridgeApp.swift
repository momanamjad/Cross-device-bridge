import SwiftUI

@main
struct SMSBridgeApp: App {
    init() {
        _ = NotificationManager.shared
        NotificationManager.shared.requestAuthorization()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

