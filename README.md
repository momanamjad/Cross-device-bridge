# Device Bridge

Seamlessly forward SMS, OTP codes, and cellular voice calls from your **Android phone (Realme C3)** to your **iPhone** via a self-hosted Node.js backend, a native iOS SwiftUI app (with CallKit), and an optional web PWA.

Use this only on devices you own.

## Project Structure

- `android/` — Native Kotlin app with embedded Node.js C++ runtime (`libnode.so`), telephony listeners, WebRTC, and Make It Bright UI.
- `ios/SMSBridge/` — Native iOS SwiftUI app with system CallKit incoming call screens, WebRTC audio, auto-clipboard OTP copying, and offline local cache.
- `backend/` — Express + Socket.io server with embedded JSON database engine (`MockPrisma`), dual-bridge voice manager, and encrypted signaling.
- `frontend/` — Vite React PWA client (Tailwind + Zustand).
- `firmware/esp32-voice-bridge/` — Standalone ESP-32S Bluetooth Classic HFP voice firmware and PlatformIO configuration.
- `tools/audio-bridge/` — Native Windows C# WinMM audio loopback engine (`device-audio-bridge.exe`).

## Payloads (Android → API)

`POST /api/messages/sms`

```json
{
  "sender": "+923001234567",
  "message": "Hello",
  "timestamp": 1692547200000,
  "device_id": "realme_c3_1"
}
```

`POST /api/messages/call`

```json
{
  "caller": "+923001234567",
  "state": "RINGING",
  "timestamp": 1692547200000,
  "device_id": "realme_c3_1",
  "duration": 0
}
```

Use header `Authorization: Bearer <api_token>`. `device_id` must match the registered device.

## Quick start (backend + web)

1. Start Postgres from the repo root:

```bash
docker compose up -d
```

2. Backend:

```bash
cd backend
copy .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

The API listens on `0.0.0.0:4000` so phones on your LAN can reach it. Allow Node through Windows Firewall if the Realme cannot connect.

3. Frontend:

```bash
cd frontend
copy .env.example .env
```

Set `VITE_API_URL` to `http://YOUR_PC_LAN_IP:4000` (not `localhost` when opening from an iPhone). Then:

```bash
npm install
npm run dev
```

On the iPhone, open `http://YOUR_PC_LAN_IP:5173`, go to Settings, paste the same API URL and token, Save, then Enable notifications. Add to Home Screen for a PWA.

## Register a device

```bash
curl -X POST http://localhost:4000/api/devices/register ^
  -H "Content-Type: application/json" ^
  -H "X-Register-Secret: change-me-to-a-long-random-string" ^
  -d "{\"device_id\":\"realme_c3_1\",\"device_name\":\"Realme C3\",\"device_type\":\"android\",\"os_version\":\"11\"}"
```

Save `api_token`. Put the same token in the Android app **and** the PWA settings. Re-registering rotates the token.

You can also tap **Register device** in the Android settings screen (backend URL + register secret + device ID).

## Android (Realme C3)

1. Open the `android/` folder in Android Studio (first sync downloads Gradle).
2. Build → Build APK(s). Install `app/build/outputs/apk/debug/app-debug.apk` on the Realme.
3. Open Device Bridge → Grant permissions (SMS, phone, call log, notifications).
4. Tap **Start bridge** and leave the persistent notification running.
5. Settings: backend URL `http://YOUR_PC_LAN_IP:4000`, device ID `realme_c3_1`, token (or Register).
6. Enable SMS and call forwarding, Test connection, Sync now.

### ColorOS / Realme battery

ColorOS will kill idle apps. Do all of these:

- Settings → Battery → Device Bridge → Don’t optimize
- Allow autostart / associated startup
- Allow background activity
- Lock the app in Recents

## End-to-end checks

1. `curl http://localhost:4000/api/health` → `"status":"ok"` and `"database":"connected"`.
2. Register, then:

```bash
curl -X POST http://localhost:4000/api/messages/sms ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"sender\":\"+10000000000\",\"message\":\"test\",\"timestamp\":1692547200000,\"device_id\":\"realme_c3_1\"}"
```

3. PWA Messages list shows the test SMS and the header reads Connected.
4. Send a real SMS to the Realme; it should appear on the iPhone within a couple of seconds **while the PWA is open**.
5. Airplane mode on the Realme, receive an SMS, turn radios back on — pending count drops after Sync now or the 15-minute WorkManager run.

## iOS limit

Live alerts only work while Safari / the Home Screen PWA is open. Background Web Push is not in v1.

## WebRTC Peer-to-Peer Calling

WebRTC voice calls are routed signaling-only through the Node.js backend. Direct audio streams route peer-to-peer (P2P) on the local LAN network between devices without utilizing external cloud gateways.

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Health check |
| POST | `/api/devices/register` | `X-Register-Secret` | Register a device |
| POST | `/api/messages/sms` | Bearer | Forward SMS |
| POST | `/api/messages/call` | Bearer | Forward legacy call log |
| GET | `/api/messages` | Bearer | Fetch SMS messages list |
| GET | `/api/calls` | Bearer | Fetch call list |
| POST | `/api/messages/:id/confirm` | Bearer | Confirm message synced |
| POST | `/api/calls/:id/confirm` | Bearer | Confirm call log synced |
| POST | `/api/calls/incoming` | Bearer | Initiate WebRTC incoming call |
| POST | `/api/calls/outgoing` | Bearer | Initiate WebRTC outgoing call |
| POST | `/api/calls/ended` | Bearer | Conclude WebRTC call logs |

### Socket.io Events

- **Authentication**: Connect with `auth: { token }`
- **Signaling Rooms**: Automatically joins rooms based on registered identifiers (e.g. `device_ext:realme_c3_1`, `device_ext:iphone`).
- **Events**:
  - `message:new` — SMS message payload forwarded to iPhone
  - `call:new` — Legacy phone status logging
  - `call:incoming` — WebRTC inbound voice call alert
  - `call:accept` — Outbound accept confirmation
  - `call:connected` — Active session handshake completed
  - `webrtc:offer` — SDP connection parameter offer
  - `webrtc:answer` — SDP connection answer response
  - `webrtc:ice-candidate` — ICE routing candidate relay
  - `call:hangup` — End active voice call and release resources
  - `call:audio-downlink` — Real-time 16kHz PCM caller voice chunks streamed to iPhone
  - `call:audio-uplink` — Real-time 16kHz PCM microphone voice chunks sent from iPhone to caller

---

---

# Unified Voice Call Audio Bridge (Dual-Mode Support)

## The Core Technical Challenge
On Android 10+ (including Realme UI / ColorOS on Realme C3), the operating system strictly isolates cellular modem baseband audio from third-party applications. Public Android APIs (`VOICE_DOWNLINK` / `VOICE_UPLINK` / `VOICE_CALL`) reject recording with `SecurityException` unless an app is signed with the platform manufacturer's private system key or has root access.

To achieve **full-duplex, two-way cellular voice transfer** (listening to the caller and speaking back through the iPhone microphone) without rooting the phone, Device Bridge provides **two complementary modes in this single codebase**:

1. **Option 1 (PC Bluetooth Loopback):** Runs on your host Windows PC using native audio APIs (`winmm.dll`). Zero extra hardware required.
2. **Option 2 (ESP-32S Hardware Relay):** Runs headlessly on a $3 ESP-32S microcontroller plugged into any USB phone charger anywhere in your home.

You can switch modes anytime via the **iPhone PWA Settings screen** (`Auto Detect`, `ESP-32S HW`, or `PC Bluetooth`), or let the system auto-detect whichever is active!

---

## Mode 1: PC-Native Bluetooth Bridge
> **Best for:** When your Windows PC is nearby, and you want zero extra hardware purchases.

### Architecture
```
[ Caller ]
    │ (Cellular Call)
    ▼
[ Android Phone (Realme C3) ]
    │ (Bluetooth Hands-Free Profile / HFP)
    ▼
[ Windows PC (Intel Bluetooth) ]
    │ (WinMM C# Engine: device-audio-bridge.exe)
    ▼
[ Node.js Backend (VoiceBridgeManager) ]
    │ (Socket.io 16kHz PCM Frames)
    ▼
[ iPhone Safari PWA (Web Audio API) ]
```

### Quick Setup:
1. Pair your Android phone to Windows PC:
   * **Settings → Bluetooth & devices → Add device**.
   * Pair the Realme C3 and verify Windows sees it as a **"Hands-Free AG Audio"** device under Sound Settings.
2. Start the Backend & Frontend:
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev

   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```
3. In iPhone PWA Settings:
   * Set mode to **PC Bluetooth** (or **Auto Detect**).
   * Tap **Scan PC Devices**, select your phone's Bluetooth input and output, and tap **Apply PC Audio Routing**.
4. Automated verification test:
   ```bash
   cd backend
   npx tsx test-voice-bridge.ts
   ```
   *(5/5 automated tests pass)*

---

## Mode 2: ESP-32S Standalone Hardware Bridge
> **Best for:** When you want a dedicated, headless 24/7 standalone hardware box that does not depend on your PC's Bluetooth adapter.

### Architecture
```
[ Caller ]
    │ (Cellular Call)
    ▼
[ Android Phone (Realme C3) ]
    │ (Bluetooth Classic HFP / SCO Audio Link)
    ▼
[ ESP-32S Board (Ai-Thinker / ESP-WROOM-32) ]
    │ (Wi-Fi 802.11b/g/n UDP Socket / Port 4050)
    ▼
[ Node.js Backend (VoiceBridgeManager) ]
    │ (Socket.io Realtime PCM Frames)
    ▼
[ iPhone Safari PWA (Web Audio API) ]
```

### Hardware Requirements
* **Board:** Classic ESP32 (e.g. Ai-Thinker ESP-32S or ESP-WROOM-32).
  * *Important:* Must be classic ESP32 with Dual-Mode Bluetooth (BR/EDR Classic + BLE). Single-core or BLE-only variants (ESP32-S2, ESP32-S3, ESP32-C3) do not support the Bluetooth Classic Hands-Free Profile (HFP).
* **Power:** Any standard 5V Micro-USB cable and charger.

### Firmware Flashing (Beginner-Friendly)
A step-by-step beginner guide with download links for VS Code, drivers, and PlatformIO is available in:  
👉 **[firmware/esp32-voice-bridge/README.md](firmware/esp32-voice-bridge/README.md)**

Quick steps:
1. Open `firmware/esp32-voice-bridge/include/config.h` and enter your 2.4 GHz Wi-Fi SSID, password, and PC IP.
2. Open folder `firmware/esp32-voice-bridge` in VS Code with PlatformIO.
3. Plug in the ESP-32S via USB and click the **Upload** arrow (`➔`). *(If `Connecting...` appears, hold the board's **BOOT** button for 2 seconds).*
4. On your Realme C3, open **Bluetooth Settings** and pair with **`DeviceBridge-Voice`** (enable Phone Calls permission).
5. In iPhone PWA Settings, set mode to **ESP-32S HW** (or leave on **Auto Detect**).
6. Automated verification test:
   ```bash
   cd backend
   npx tsx test-esp32-bridge.ts
   ```
   *(4/4 automated tests pass)*

  
