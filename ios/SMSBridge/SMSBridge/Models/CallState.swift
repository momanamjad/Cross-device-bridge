import Foundation

enum CallState: Equatable {
    case idle
    case ringing(CallInfo)
    case connecting(CallInfo)
    case connected(CallInfo, startTime: Date)
    case ended(CallInfo, duration: TimeInterval)
    
    static func == (lhs: CallState, rhs: CallState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.ringing(let a), .ringing(let b)): return a.callId == b.callId
        case (.connecting(let a), .connecting(let b)): return a.callId == b.callId
        case (.connected(let a, _), .connected(let b, _)): return a.callId == b.callId
        case (.ended(let a, _), .ended(let b, _)): return a.callId == b.callId
        default: return false
        }
    }
}

struct CallInfo: Codable, Equatable {
    let callId: String
    let callerId: String
    let callerName: String?
    let isIncoming: Bool
    let timestamp: Date
}

struct Call: Identifiable, Codable, Equatable {
    var id: String { callId }
    let callId: String
    let number: String
    let name: String?
    let duration: TimeInterval
    let timestamp: Date
    let isIncoming: Bool
}

struct SMSMessage: Identifiable, Codable, Equatable {
    let id: String
    let sender: String
    let content: String
    let timestamp: Date
    var otpCode: String?
    
    var smsRetrieverHash: String? {
        let pattern = #"<([a-zA-Z0-9_\-\+]{11})>"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
           let range = Range(match.range(at: 1), in: content) {
            return String(content[range])
        }
        return nil
    }
    
    var extractedOtp: String? {
        if let otp = otpCode, !otp.isEmpty { return otp }
        
        // 1. Clean out the trailing SMS Retriever hash <...> so it is never mistaken for the OTP
        var cleanContent = content
        if let hashRegex = try? NSRegularExpression(pattern: #"<[a-zA-Z0-9_\-\+]{10,12}>"#) {
            cleanContent = hashRegex.stringByReplacingMatches(in: cleanContent, range: NSRange(cleanContent.startIndex..., in: cleanContent), withTemplate: "")
        }
        
        // 2. High-confidence prefix match: Supports alphanumeric (e.g. Easypaisa 'VgPr44F96f') and numeric
        let contextualPattern = #"(?i)(?:registration\/login\s+otp\s+is|login\s+otp\s+is|registration\s+otp\s+is|otp\s+is|code\s+is|pin\s+is|verification\s+code\s+is|password\s+is|otp[:\s]+|code[:\s]+|pin[:\s]+)\s*([a-zA-Z0-9]{4,10})"#
        if let regex = try? NSRegularExpression(pattern: contextualPattern),
           let match = regex.firstMatch(in: cleanContent, range: NSRange(cleanContent.startIndex..., in: cleanContent)),
           let range = Range(match.range(at: 1), in: cleanContent) {
            let candidate = String(cleanContent[range])
            if candidate == "3737" || candidate == "111003737" {
                return nil
            }
            // Ensure candidate contains at least one digit
            if candidate.rangeOfCharacter(from: .decimalDigits) != nil {
                return candidate
            }
        }
        
        // 3. Fallback: If message contains keywords (otp, code, pin, verification, verify, password), look for 4-8 digits
        let hasOtpKeyword = cleanContent.range(of: #"(?i)\b(otp|code|pin|verification|verify|password)\b"#, options: .regularExpression) != nil
        if hasOtpKeyword {
            let digitPattern = #"\b([0-9]{4,8})\b"#
            if let regex = try? NSRegularExpression(pattern: digitPattern) {
                let matches = regex.matches(in: cleanContent, range: NSRange(cleanContent.startIndex..., in: cleanContent))
                for match in matches {
                    if let range = Range(match.range(at: 1), in: cleanContent) {
                        let candidate = String(cleanContent[range])
                        if candidate == "3737" || candidate.contains("3737") {
                            continue
                        }
                        let startIdx = match.range.lowerBound
                        let precedingLength = min(15, startIdx)
                        if let precedingRange = Range(NSRange(location: startIdx - precedingLength, length: precedingLength), in: cleanContent) {
                            let precedingText = String(cleanContent[precedingRange]).lowercased()
                            if precedingText.contains("call") || precedingText.contains("dial") || precedingText.contains("helpline") || precedingText.contains("rabta") || precedingText.contains("contact") {
                                continue
                            }
                        }
                        let endIdx = match.range.upperBound
                        let lengthRemaining = cleanContent.utf16.count - endIdx
                        let peekLength = min(10, max(0, lengthRemaining))
                        if let peekRange = Range(NSRange(location: endIdx, length: peekLength), in: cleanContent) {
                            let followingText = String(cleanContent[peekRange]).lowercased()
                            if followingText.contains("mb") || followingText.contains("gb") || followingText.contains("min") || followingText.contains("rs") || followingText.contains("paisa") {
                                continue
                            }
                        }
                        return candidate
                    }
                }
            }
        }
        return nil
    }
}

