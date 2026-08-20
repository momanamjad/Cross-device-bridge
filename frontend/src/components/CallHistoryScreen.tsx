import { Call } from "../store/callSlice";

interface CallHistoryScreenProps {
  history: Call[];
  onDial: (phoneNumber: string) => void;
}

export function CallHistoryScreen({ history, onDial }: CallHistoryScreenProps) {
  const formatDuration = (sec?: number) => {
    if (!sec) return "00:00";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-full max-w-sm mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg text-white mt-6">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
        <h3 className="text-lg font-bold text-white">Call History</h3>
        <span className="text-xs text-slate-500 font-mono">{history.length} records</span>
      </div>

      {history.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-500">No calls in local history yet.</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          {history.map((record) => (
            <div
              key={record.call_id}
              onClick={() => onDial(record.caller_number)}
              className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/40 cursor-pointer transition active:scale-98"
            >
              {/* Left detail */}
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {record.status === "missed" ? "❌" : record.is_incoming ? "📥" : "📤"}
                </span>
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold ${record.status === "missed" ? "text-rose-400" : "text-white"}`}>
                    {record.caller_name || record.caller_number}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{formatTime(record.started_at)}</span>
                </div>
              </div>

              {/* Right duration badge */}
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full text-slate-300">
                  {formatDuration(record.duration)}
                </span>
                {record.status === "missed" && (
                  <span className="text-[9px] text-rose-500 font-bold uppercase tracking-wider mt-1">Missed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
