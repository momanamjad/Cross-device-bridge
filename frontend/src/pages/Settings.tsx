import { useState } from "react";
import { createApi } from "../services/api";
import { useBridgeStore } from "../store";

export function SettingsPage() {
  const apiUrl = useBridgeStore((s) => s.apiUrl);
  const token = useBridgeStore((s) => s.token);
  const setApiUrl = useBridgeStore((s) => s.setApiUrl);
  const setToken = useBridgeStore((s) => s.setToken);
  const setMessages = useBridgeStore((s) => s.setMessages);
  const setCalls = useBridgeStore((s) => s.setCalls);

  const [urlDraft, setUrlDraft] = useState(apiUrl);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [status, setStatus] = useState("");

  async function testConnection() {
    try {
      const api = createApi(urlDraft.replace(/\/$/, ""), tokenDraft);
      const res = await api.health();
      setStatus(`Health: ${res.data.status} / db ${res.data.database ?? "?"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection failed");
    }
  }

  function save() {
    setApiUrl(urlDraft);
    setToken(tokenDraft);
    setStatus("Saved. Live connection will restart.");
  }

  function clearCache() {
    setMessages([]);
    setCalls([]);
    setStatus("Local cache cleared.");
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setStatus("Notifications are not available in this browser.");
      return;
    }
    const result = await Notification.requestPermission();
    setStatus(`Notification permission: ${result}`);
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm text-slate-300">
        Backend URL
        <input
          className="mt-1 w-full rounded-xl bg-panel px-3 py-3 text-white outline-none ring-1 ring-white/10"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="http://192.168.1.10:4000"
        />
      </label>
      <label className="block text-sm text-slate-300">
        API token
        <input
          className="mt-1 w-full rounded-xl bg-panel px-3 py-3 text-white outline-none ring-1 ring-white/10"
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
          type="password"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        onClick={save}
        className="w-full rounded-xl bg-mint py-3 font-semibold text-ink"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => void testConnection()}
        className="w-full rounded-xl bg-white/10 py-3"
      >
        Test connection
      </button>
      <button
        type="button"
        onClick={() => void requestNotifications()}
        className="w-full rounded-xl bg-white/10 py-3"
      >
        Enable notifications
      </button>
      <button
        type="button"
        onClick={clearCache}
        className="w-full rounded-xl bg-white/10 py-3"
      >
        Clear cache
      </button>
      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      <p className="text-xs text-slate-500">
        Device Bridge 1.0.0. Live alerts work only while this PWA is open. Add
        to Home Screen on iPhone for a full-screen app.
      </p>
    </div>
  );
}
