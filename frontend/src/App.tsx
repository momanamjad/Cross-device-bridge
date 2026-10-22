import { Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "./store/index";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { IncomingCallModal } from "./components/IncomingCallModal";
import { useBridgeRealtime } from "./hooks/useBridgeRealtime";
import { useWebRTC } from "./hooks/useWebRTC";
import { CallsPage } from "./pages/Calls";
import { MessagesPage } from "./pages/Messages";
import { SettingsPage } from "./pages/Settings";
import { remoteAudioRef } from "./services/webrtcService";

export function App() {
  useBridgeRealtime();
  const webrtc = useWebRTC();
  const incomingCall = useSelector((state: RootState) => state.call.incomingCall);
  const activeCall = useSelector((state: RootState) => state.call.activeCall);

  return (
    <div className="min-h-screen bg-ink pb-20">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-4">
        <Routes>
          <Route path="/" element={<MessagesPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      {incomingCall && !activeCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={webrtc.acceptCall}
          onReject={webrtc.rejectCall}
        />
      )}
      <audio autoPlay playsInline ref={remoteAudioRef} onCanPlay={() => console.log("Audio playing")} className="hidden" />
    </div>
  );
}
