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
  const [audioDevices, setAudioDevices] = useState<{ inputs: { id: number; name: string }[]; outputs: { id: number; name: string }[] } | null>(null);
  const [selectedIn, setSelectedIn] = useState<number | "">("");
  const [selectedOut, setSelectedOut] = useState<number | "">("");
  const [audioLoading, setAudioLoading] = useState(false);

  async function testConnection() {
    try {
      const api = createApi(urlDraft.replace(/\/$/, ""), tokenDraft);
      const res = await api.health();
      setStatus(`Health: ${res.data.status} / db ${res.data.database ?? "?"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function fetchAudioDevices() {
    setAudioLoading(true);
    try {
      const api = createApi(urlDraft.replace(/\/$/, ""), tokenDraft);
      const res = await api.getAudioDevices();
      setAudioDevices(res.data.devices);
      if (res.data.selected?.input) setSelectedIn(res.data.selected.input.id);
      if (res.data.selected?.output) setSelectedOut(res.data.selected.output.id);
      setStatus("Loaded PC audio devices.");
    } catch (err: any) {
      setStatus(err?.response?.data?.message || err.message || "Failed to load audio devices");
    } finally {
      setAudioLoading(false);
    }
  }

  async function saveAudioDevices() {
    if (selectedIn === "" || selectedOut === "") return;
    try {
      const api = createApi(urlDraft.replace(/\/$/, ""), tokenDraft);
      await api.selectAudioDevices(Number(selectedIn), Number(selectedOut));
      setStatus("Saved PC Voice Bridge audio routing.");
    } catch (err: any) {
      setStatus(err?.response?.data?.message || err.message || "Failed to save audio devices");
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

      {/* Voice Bridge Audio Settings */}
      <div className="rounded-2xl border border-white/10 bg-panel/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Voice Bridge (PC Bluetooth)</h3>
          <button
            type="button"
            onClick={() => void fetchAudioDevices()}
            disabled={audioLoading}
            className="text-xs px-2.5 py-1 rounded-lg bg-mint/20 text-mint hover:bg-mint/30 disabled:opacity-50"
          >
            {audioLoading ? "Scanning..." : "Scan Devices"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Routes call audio between your Android phone (paired to PC Bluetooth) and this PWA.
        </p>

        {audioDevices && (
          <div className="space-y-3 pt-2">
            <label className="block text-xs text-slate-300">
              Input Device (Caller Voice / Phone Mic)
              <select
                className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white outline-none border border-white/10"
                value={selectedIn}
                onChange={(e) => setSelectedIn(Number(e.target.value))}
              >
                {audioDevices.inputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.id}] {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-300">
              Output Device (Your Voice / Phone Ear)
              <select
                className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs text-white outline-none border border-white/10"
                value={selectedOut}
                onChange={(e) => setSelectedOut(Number(e.target.value))}
              >
                {audioDevices.outputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.id}] {d.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void saveAudioDevices()}
              className="w-full rounded-xl bg-mint/90 py-2 text-xs font-semibold text-ink hover:bg-mint"
            >
              Apply Audio Routing
            </button>
          </div>
        )}
      </div>

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
