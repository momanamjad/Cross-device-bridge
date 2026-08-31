import Foundation
import UIKit

class BackendService {
    static let shared = BackendService()
    private init() {}
    
    func registerDevice(host: String, port: Int, secret: String) async throws -> String {
        let url = URL(string: "http://\(host):\(port)/api/devices/register")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(secret, forHTTPHeaderField: "x-register-secret")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = [
            "device_id": "iphone",
            "device_name": "iPhone Client",
            "device_type": "ios",
            "os_version": "iOS " + UIDevice.current.systemVersion
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw NSError(domain: "BackendService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Registration failed"])
        }
        
        let jsonWrapper = try JSONSerialization.jsonObject(with: data) as? [String: String]
        guard let encryptedStr = jsonWrapper?["data"] else {
            throw NSError(domain: "BackendService", code: 500, userInfo: [NSLocalizedDescriptionKey: "Invalid encrypted registration response"])
        }
        
        let decrypted = try CryptoHelper.decryptPayload(encryptedStr, secret: secret)
        let json = try JSONSerialization.jsonObject(with: decrypted) as? [String: Any]
        guard let token = json?["api_token"] as? String else {
            throw NSError(domain: "BackendService", code: 500, userInfo: [NSLocalizedDescriptionKey: "Invalid token response"])
        }
        return token
    }
    
    func fetchMessages(host: String, port: Int, token: String, secret: String) async throws -> [SMSMessage] {
        let url = URL(string: "http://\(host):\(port)/api/messages")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        // Response is wrapped in { data: "encrypted_string" }
        guard let wrapper = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let encryptedStr = wrapper["data"] else {
            throw CryptoError.invalidPayloadFormat
        }
        
        let decryptedData = try CryptoHelper.decryptPayload(encryptedStr, secret: secret)
        let response = try JSONDecoder().decode(MessageListResponse.self, from: decryptedData)
        return response.data.map {
            SMSMessage(id: $0.id, sender: $0.sender, content: $0.message, timestamp: ISO8601DateFormatter().date(from: $0.timestamp) ?? Date())
        }
    }
    
    func fetchCalls(host: String, port: Int, token: String, secret: String) async throws -> [Call] {
        let url = URL(string: "http://\(host):\(port)/api/calls")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        // Response is wrapped in { data: "encrypted_string" }
        guard let wrapper = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let encryptedStr = wrapper["data"] else {
            throw CryptoError.invalidPayloadFormat
        }
        
        let decryptedData = try CryptoHelper.decryptPayload(encryptedStr, secret: secret)
        let response = try JSONDecoder().decode(CallListResponse.self, from: decryptedData)
        return response.data.map {
            Call(callId: $0.id, number: $0.caller, name: nil, duration: $0.duration, timestamp: ISO8601DateFormatter().date(from: $0.timestamp) ?? Date(), isIncoming: $0.state == "INCOMING" || $0.state == "RINGING" && $0.duration == 0)
        }
    }

    func uploadFile(host: String, port: Int, token: String, targetDeviceId: String?, fileData: Data, filename: String, mimeType: String) async throws -> String {
        let url = URL(string: "http://\(host):\(port)/api/files")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        if let target = targetDeviceId {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"targetDeviceId\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(target)\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        let (data, response) = try await URLSession.shared.upload(for: request, from: body)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "BackendService", code: 500, userInfo: [NSLocalizedDescriptionKey: "Upload failed"])
        }
        
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["url"] as? String ?? ""
    }
}

// Decodable wrappers
struct MessageListResponse: Decodable {
    struct MessageData: Decodable {
        let id: String
        let sender: String
        let message: String
        let timestamp: String
    }
    let data: [MessageData]
}

struct CallListResponse: Decodable {
    struct CallData: Decodable {
        let id: String
        let caller: String
        let state: String
        let timestamp: String
        let duration: Double
    }
    let data: [CallData]
}
