import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct FileDropView: View {
    @AppStorage("server_ip") private var backendHost = ""
    @AppStorage("server_port") private var backendPort = 3000
    @AppStorage("api_token") private var apiToken = ""
    
    @State private var isUploading = false
    @State private var uploadMessage: String?
    @State private var showPhotoPicker = false
    @State private var showDocumentPicker = false
    
    @State private var photoItem: PhotosPickerItem?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                if isUploading {
                    ProgressView("Uploading...")
                } else if let message = uploadMessage {
                    Text(message).foregroundColor(.green)
                }
                
                Button(action: { showPhotoPicker = true }) {
                    Label("Send Photo", systemImage: "photo")
                        .font(.headline)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                .padding(.horizontal)
                
                Button(action: { showDocumentPicker = true }) {
                    Label("Send File", systemImage: "doc")
                        .font(.headline)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.orange)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                .padding(.horizontal)
                
                Spacer()
            }
            .padding(.top, 50)
            .navigationTitle("File Drop")
            .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { newItem in
                if let newItem = newItem {
                    handlePhotoPicker(newItem)
                }
            }
            .sheet(isPresented: $showDocumentPicker) {
                DocumentPickerView { url in
                    handleFileUrl(url)
                }
            }
        }
    }
    
    private func handlePhotoPicker(_ item: PhotosPickerItem) {
        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                upload(data: data, filename: "photo-\(Date().timeIntervalSince1970).jpg", mimeType: "image/jpeg")
            }
        }
    }
    
    private func handleFileUrl(_ url: URL) {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        
        do {
            let data = try Data(contentsOf: url)
            upload(data: data, filename: url.lastPathComponent, mimeType: "application/octet-stream")
        } catch {
            print("Failed to read file: \(error)")
        }
    }
    
    private func upload(data: Data, filename: String, mimeType: String) {
        guard !backendHost.isEmpty, !apiToken.isEmpty else {
            uploadMessage = "Please configure settings first"
            return
        }
        
        isUploading = true
        uploadMessage = nil
        
        Task {
            do {
                let _ = try await BackendService.shared.uploadFile(
                    host: backendHost,
                    port: backendPort,
                    token: apiToken,
                    targetDeviceId: "realme_c3_1",
                    fileData: data,
                    filename: filename,
                    mimeType: mimeType
                )
                DispatchQueue.main.async {
                    isUploading = false
                    uploadMessage = "Sent successfully!"
                    photoItem = nil
                }
            } catch {
                DispatchQueue.main.async {
                    isUploading = false
                    uploadMessage = "Upload failed"
                    photoItem = nil
                }
            }
        }
    }
}

struct DocumentPickerView: UIViewControllerRepresentable {
    var onPick: (URL) -> Void
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }
    
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
    
    class Coordinator: NSObject, UIDocumentPickerDelegate {
        var onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) {
            self.onPick = onPick
        }
        
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let url = urls.first {
                onPick(url)
            }
        }
    }
}
