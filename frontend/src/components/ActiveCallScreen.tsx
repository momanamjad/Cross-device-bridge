import { useEffect, useState } from "react";
import { Call } from "../store/callSlice";

interface ActiveCallScreenProps {
  call: Call;
  isMuted: boolean;
  onMuteToggle: () => void;
  isSpeaker: boolean;
  onSpeakerToggle: () => void;
  onHangup: () => void;
}

export function ActiveCallScreen({
  call,
  isMuted,
  onMuteToggle,
  isSpeaker,
  onSpeakerToggle,
  onHangup,
}: ActiveCallScreenProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (call.status !== "connected") {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - call.started_at) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.status, call.started_at]);

  const formatDuration = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return [
      hours > 0 ? String(hours).padStart(2, "0") : null,
      String(mins).padStart(2, "0"),
      String(secs).padStart(2, "0"),
    ]
      .filter(Boolean)
      .join(":");
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[70vh] bg-slate-900 rounded-3xl p-8 text-white shadow-xl max-w-md mx-auto my-4 border border-slate-800">
      {/* Top Status Panel */}
      <div className="flex flex-col items-center mt-12 text-center w-full">
        <div className="flex items-center gap-2 rounded-full bg-slate-800 border border-slate-700 px-4 py-1.5 text-xs text-mint">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
          </span>
          {call.status === "connected" ? "Direct P2P Audio Active" : "Connecting SIM Relay..."}
        </div>

        <h2 className="mt-8 text-3xl font-bold text-white">
          {call.caller_name || call.caller_number}
        </h2>
        {call.caller_name && (
          <p className="mt-2 text-slate-400 text-sm font-medium">{call.caller_number}</p>
        )}

        <div className="mt-6 text-5xl font-mono tracking-tight text-white/90">
          {call.status === "connected" ? formatDuration(elapsed) : "Ringing..."}
        </div>
      </div>

      {/* Visualizer effect */}
      <div className="flex items-center gap-1.5 h-12 my-6">
        {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((height, i) => (
          <div
            key={i}
            style={{
              height: call.status === "connected" && !isMuted ? `${height * 6 + 4}px` : "4px",
            }}
            className={`w-1 rounded-full bg-mint transition-all duration-150 ${
              call.status === "connected" && !isMuted ? "animate-pulse" : ""
            }`}
          />
        ))}
      </div>

      {/* Control Buttons Panel */}
      <div className="flex flex-col items-center gap-8 w-full">
        <div className="flex items-center justify-center gap-8 w-full">
          {/* Mute Toggle */}
          <button
            onClick={onMuteToggle}
            aria-label="Toggle Mute"
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all active:scale-95 ${
              isMuted
                ? "bg-amber-500 border-amber-600 text-slate-950 font-bold"
                : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white"
            }`}
          >
            🎙️
          </button>

          {/* Hang up Call */}
          <button
            onClick={onHangup}
            aria-label="Hang up Call"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg active:scale-95"
          >
            <span className="text-2xl">❌</span>
          </button>

          {/* Speaker Phone Toggle */}
          <button
            onClick={onSpeakerToggle}
            aria-label="Toggle Speaker"
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all active:scale-95 ${
              isSpeaker
                ? "bg-sky-500 border-sky-600 text-slate-950 font-bold"
                : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white"
            }`}
          >
            🔊
          </button>
        </div>

        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          Call ID: {call.call_id.slice(0, 8)}...
        </p>
      </div>
    </div>
  );
}
