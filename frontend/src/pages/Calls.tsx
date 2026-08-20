import { useSelector } from "react-redux";
import { RootState } from "../store/index";
import { useWebRTC } from "../hooks/useWebRTC";
import { IncomingCallModal } from "../components/IncomingCallModal";
import { ActiveCallScreen } from "../components/ActiveCallScreen";
import { DialerScreen } from "../components/DialerScreen";
import { CallHistoryScreen } from "../components/CallHistoryScreen";

export function CallsPage() {
  const webrtc = useWebRTC();
  const incomingCall = useSelector((state: RootState) => state.call.incomingCall);
  const activeCall = useSelector((state: RootState) => state.call.activeCall);
  const history = useSelector((state: RootState) => state.call.callHistory);

  return (
    <div className="space-y-4">
      {/* Call Errors display */}
      {webrtc.error && (
        <div className="p-4 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-900 rounded-2xl flex items-center justify-between gap-2">
          <span>Error: {webrtc.error}</span>
          <button
            onClick={webrtc.clearError}
            className="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-900 text-[10px] uppercase font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Conditional Call UI Render */}
      {incomingCall && !activeCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={webrtc.acceptCall}
          onReject={webrtc.rejectCall}
        />
      )}

      {activeCall && (
        <ActiveCallScreen
          call={activeCall}
          isMuted={webrtc.isMuted}
          onMuteToggle={webrtc.toggleMute}
          isSpeaker={webrtc.isSpeaker}
          onSpeakerToggle={webrtc.toggleSpeaker}
          onHangup={webrtc.hangupCall}
        />
      )}

      {!incomingCall && !activeCall && (
        <div className="animate-fade-in">
          <DialerScreen onCall={webrtc.makeCall} />
          <CallHistoryScreen history={history} onDial={webrtc.makeCall} />
        </div>
      )}
    </div>
  );
}
