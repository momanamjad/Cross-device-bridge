import { useEffect } from "react";

interface IncomingCallModalProps {
  call: {
    call_id: string;
    caller_number: string;
    caller_name?: string;
  };
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ call, onAccept, onReject }: IncomingCallModalProps) {
  useEffect(() => {
    // Triggers vibration on browser load
    if (navigator.vibrate) {
      const interval = setInterval(() => {
        navigator.vibrate([500, 300, 500]);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950/95 p-8 text-white animate-fade-in">
      {/* Top Section */}
      <div className="flex flex-col items-center mt-20 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-mint/20 animate-ping" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 border-2 border-mint text-3xl">
            📞
          </div>
        </div>
        <p className="text-sm tracking-widest text-slate-400 uppercase">Incoming Voice Call</p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl animate-pulse">
          {call.caller_name || call.caller_number}
        </h2>
        {call.caller_name && (
          <p className="mt-1 text-lg text-slate-300">{call.caller_number}</p>
        )}
        <p className="mt-2 text-xs text-mint">via Realme SIM</p>
      </div>

      {/* Bottom Action buttons */}
      <div className="flex w-full max-w-sm justify-around mb-20 gap-8">
        {/* Reject button */}
        <button
          onClick={onReject}
          aria-label="Decline Call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg active:scale-95"
        >
          <span className="text-2xl">❌</span>
        </button>

        {/* Accept button */}
        <button
          onClick={onAccept}
          aria-label="Accept Call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg active:scale-95 animate-bounce"
        >
          <span className="text-2xl">📞</span>
        </button>
      </div>
    </div>
  );
}
