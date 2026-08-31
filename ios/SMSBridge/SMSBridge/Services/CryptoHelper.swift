import Foundation
import CryptoKit
import CommonCrypto

enum CryptoError: Error {
    case invalidPayloadFormat
    case invalidBase64
    case encryptionFailed
    case decryptionFailed
}

class CryptoHelper {
    static let iterations = 100000
    static let keyLen = 32
    
    static func deriveKey(secret: String, salt: Data) -> SymmetricKey {
        let secretData = Data(secret.utf8)
        
        var derivedKeyData = Data(count: keyLen)
        
        _ = derivedKeyData.withUnsafeMutableBytes { derivedKeyBytes in
            salt.withUnsafeBytes { saltBytes in
                secretData.withUnsafeBytes { secretBytes in
                    CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2),
                        secretBytes.bindMemory(to: Int8.self).baseAddress,
                        secretData.count,
                        saltBytes.bindMemory(to: UInt8.self).baseAddress,
                        salt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                        UInt32(iterations),
                        derivedKeyBytes.bindMemory(to: UInt8.self).baseAddress,
                        keyLen
                    )
                }
            }
        }
        
        return SymmetricKey(data: derivedKeyData)
    }
    
    static func decryptPayload(_ payloadStr: String, secret: String) throws -> Data {
        let parts = payloadStr.components(separatedBy: ":")
        guard parts.count == 4 else {
            throw CryptoError.invalidPayloadFormat
        }
        
        guard let salt = Data(base64Encoded: parts[0]),
              let iv = Data(base64Encoded: parts[1]),
              let authTag = Data(base64Encoded: parts[2]),
              let ciphertext = Data(base64Encoded: parts[3]) else {
            throw CryptoError.invalidBase64
        }
        
        let key = deriveKey(secret: secret, salt: salt)
        
        let sealedBox = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                              ciphertext: ciphertext,
                                              tag: authTag)
        
        let decryptedData = try AES.GCM.open(sealedBox, using: key)
        return decryptedData
    }
    
    static func encryptPayload(_ data: Data, secret: String) throws -> String {
        let salt = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
        let key = deriveKey(secret: secret, salt: salt)
        
        let iv = Data((0..<12).map { _ in UInt8.random(in: 0...255) })
        let nonce = try AES.GCM.Nonce(data: iv)
        
        let sealedBox = try AES.GCM.seal(data, using: key, nonce: nonce)
        
        let saltB64 = salt.base64EncodedString()
        let ivB64 = iv.base64EncodedString()
        let authTagB64 = sealedBox.tag.base64EncodedString()
        let ciphertextB64 = sealedBox.ciphertext.base64EncodedString()
        
        return "\(saltB64):\(ivB64):\(authTagB64):\(ciphertextB64)"
    }
}
