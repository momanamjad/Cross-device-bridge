import { useBridgeStore } from "../store";

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function MessagesPage() {
  const messages = useBridgeStore((s) => s.messages);
  const expandedId = useBridgeStore((s) => s.expandedId);
  const setExpandedId = useBridgeStore((s) => s.setExpandedId);

  if (messages.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-slate-400">
        No messages yet. Keep this page open to receive live SMS.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {messages.map((msg) => {
        const open = expandedId === msg.id;
        const preview =
          msg.content.length > 80 && !open
            ? `${msg.content.slice(0, 80)}…`
            : msg.content;
        return (
          <li key={msg.id}>
            <button
              type="button"
              onClick={() => setExpandedId(open ? null : msg.id)}
              className="w-full rounded-2xl bg-panel p-4 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{msg.sender}</span>
                <span className="text-xs text-slate-400">
                  {relativeTime(msg.timestamp)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                {preview}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
