import { useBridgeStore } from "../store";
import type { ConnectionStatus } from "../types";

const labels: Record<ConnectionStatus, string> = {
  connecting: "Connecting",
  connected: "Connected",
  offline: "Offline",
};

export function Header() {
  const status = useBridgeStore((s) => s.status);
  const color =
    status === "connected"
      ? "bg-mint"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-slate-500";

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <h1 className="text-lg font-semibold">SMS Bridge</h1>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
          {labels[status]}
        </div>
      </div>
    </header>
  );
}
