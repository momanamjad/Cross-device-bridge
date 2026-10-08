import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    
    private let center = UNUserNotificationCenter.current()
    
    override init() {
        super.init()
        center.delegate = self
        setupCategories()
    }
    
    func requestAuthorization() {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                AppLog("Notification permission granted", tag: "NOTIF")
            } else if let error = error {
                AppLog("Notification permission error: \(error.localizedDescription)", tag: "NOTIF")
            } else {
                AppLog("Notification permission denied by user", tag: "NOTIF")
            }
        }
    }
    
    private func setupCategories() {
        let copyAction = UNNotificationAction(
            identifier: "COPY_OTP_ACTION",
            title: "📋 Copy OTP",
            options: [.foreground]
        )
        let otpCategory = UNNotificationCategory(
            identifier: "SMS_OTP_CATEGORY",
            actions: [copyAction],
            intentIdentifiers: [],
            options: []
        )
        let standardCategory = UNNotificationCategory(
            identifier: "SMS_STANDARD_CATEGORY",
            actions: [],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([otpCategory, standardCategory])
    }
    
    func postSMSNotification(message: SMSMessage) {
        let content = UNMutableNotificationContent()
        content.sound = .default
        
        let otp = message.extractedOtp
        if let otp = otp, !otp.isEmpty {
            content.title = "SMS: \(message.sender)"
            content.subtitle = "OTP: \(otp) • (Auto-copied to clipboard)"
            content.body = message.content
            content.categoryIdentifier = "SMS_OTP_CATEGORY"
            content.userInfo = ["otp": otp, "id": message.id]
        } else {
            content.title = "SMS from \(message.sender)"
            content.body = message.content
            content.categoryIdentifier = "SMS_STANDARD_CATEGORY"
            content.userInfo = ["id": message.id]
        }
        
        let request = UNNotificationRequest(
            identifier: "sms-\(message.id)-\(UUID().uuidString)",
            content: content,
            trigger: nil // immediate delivery
        )
        
        center.add(request) { error in
            if let error = error {
                AppLog("Failed to post notification: \(error.localizedDescription)", tag: "NOTIF")
            } else {
                AppLog("Posted local notification for SMS from \(message.sender)", tag: "NOTIF")
            }
        }
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    
    // Display banner and play sound even while the app is active in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
    
    // Handle action buttons (e.g. Copy OTP)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.actionIdentifier == "COPY_OTP_ACTION" || response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            if let otp = response.notification.request.content.userInfo["otp"] as? String {
                UIPasteboard.general.string = otp
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.success)
                AppLog("Copied OTP \(otp) to clipboard from notification action", tag: "NOTIF")
            }
        }
        completionHandler()
    }
}
