import SwiftUI
import AVFoundation

struct QRCodeScannerView: View {
    @Binding var scannedCode: String?
    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationView {
            QRCodeScannerRepresentable(scannedCode: $scannedCode)
                .edgesIgnoringSafeArea(.bottom)
                .navigationTitle("Scan Android QR")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Cancel") {
                            presentationMode.wrappedValue.dismiss()
                        }
                    }
                }
        }
    }
}

struct QRCodeScannerRepresentable: UIViewControllerRepresentable {
    @Binding var scannedCode: String?
    @Environment(\.presentationMode) var presentationMode

    func makeUIViewController(context: Context) -> ScannerViewController {
        let controller = ScannerViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, ScannerViewControllerDelegate {
        var parent: QRCodeScannerRepresentable

        init(_ parent: QRCodeScannerRepresentable) {
            self.parent = parent
        }

        func didFindCode(_ code: String) {
            parent.scannedCode = code
            parent.presentationMode.wrappedValue.dismiss()
        }
    }
}

protocol ScannerViewControllerDelegate: AnyObject {
    func didFindCode(_ code: String)
}

class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var captureSession: AVCaptureSession?
    var previewLayer: AVCaptureVideoPreviewLayer?
    weak var delegate: ScannerViewControllerDelegate?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black
        checkCameraPermissionsAndSetup()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if captureSession?.isRunning == true {
            captureSession?.stopRunning()
        }
    }

    private func checkCameraPermissionsAndSetup() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setupCaptureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        self?.setupCaptureSession()
                    } else {
                        self?.showPermissionDeniedMessage()
                    }
                }
            }
        case .denied, .restricted:
            showPermissionDeniedMessage()
        @unknown default:
            showPermissionDeniedMessage()
        }
    }

    private func setupCaptureSession() {
        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            showNoCameraMessage()
            return
        }

        let session = AVCaptureSession()
        let videoInput: AVCaptureDeviceInput

        do {
            videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
        } catch {
            return
        }

        if session.canAddInput(videoInput) {
            session.addInput(videoInput)
        } else {
            return
        }

        let metadataOutput = AVCaptureMetadataOutput()
        if session.canAddOutput(metadataOutput) {
            session.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]
        } else {
            return
        }

        self.captureSession = session
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.frame = view.layer.bounds
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        self.previewLayer = layer

        // Reticle
        let reticle = UIView()
        reticle.layer.borderColor = UIColor.systemGreen.cgColor
        reticle.layer.borderWidth = 3
        reticle.layer.cornerRadius = 16
        reticle.backgroundColor = .clear
        reticle.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(reticle)
        NSLayoutConstraint.activate([
            reticle.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            reticle.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            reticle.widthAnchor.constraint(equalToConstant: 250),
            reticle.heightAnchor.constraint(equalToConstant: 250)
        ])

        DispatchQueue.global(qos: .background).async {
            session.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.layer.bounds
    }

    private func showPermissionDeniedMessage() {
        let label = UILabel()
        label.text = "Camera access is needed to scan QR code.\nPlease enable Camera permission in iOS Settings."
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32)
        ])
    }

    private func showNoCameraMessage() {
        let label = UILabel()
        label.text = "Camera is not available on this device."
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        captureSession?.stopRunning()

        if let metadataObject = metadataObjects.first {
            guard let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject else { return }
            guard let stringValue = readableObject.stringValue else { return }
            AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
            delegate?.didFindCode(stringValue)
        }
    }
}
