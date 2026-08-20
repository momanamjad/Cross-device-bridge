import { Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { useBridgeRealtime } from "./hooks/useBridgeRealtime";
import { CallsPage } from "./pages/Calls";
import { MessagesPage } from "./pages/Messages";
import { SettingsPage } from "./pages/Settings";
import { remoteAudioRef } from "./services/webrtcService";

export function App() {
  useBridgeRealtime();

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
      <audio autoPlay playsInline ref={remoteAudioRef} onCanPlay={() => console.log("Audio playing")} className="hidden" />
    </div>
  );
}
