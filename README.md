# Device Bridge

Forward SMS and incoming calls from **your** Android phone (e.g. Realme C3) to an **iPhone** via a Node.js API and a Safari/PWA UI.

Use this only on devices you own.

## Layout

- `android/` — Kotlin app (`com.devicebridge.app`)
- `backend/` — Express + Prisma + PostgreSQL + Socket.io
- `frontend/` — Vite React PWA (Tailwind + Zustand)

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

# Dual-Strategy Voice Call Audio Bridge

## The Core Technical Challenge
On Android 10+ (including Realme UI / ColorOS on Realme C3), the operating system strictly isolates cellular modem baseband audio from third-party applications. Public Android APIs (`VOICE_DOWNLINK` / `VOICE_UPLINK` / `VOICE_CALL`) reject recording with `SecurityException` unless an app is signed with the platform manufacturer's private system key or has root access.

To achieve **full-duplex, two-way cellular voice transfer** (listening to the caller and speaking back through the iPhone microphone) without rooting the phone, Device Bridge provides two distinct strategies:

---

## Strategy 1: PC-Native Bluetooth Bridge (Branch: `voice-bridge-no-esp32`)
> **Ideal when:** Your Windows host PC is always on, and you want zero extra hardware purchases.

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
[ Node.js Backend ]
    │ (Socket.io 16kHz PCM Frames)
    ▼
[ iPhone Safari PWA (Web Audio API) ]
```

### How to Test Option 1:
1. Switch to the PC branch:
   ```bash
   git checkout voice-bridge-no-esp32
   ```
2. Pair your Android phone to Windows PC:
   * **Settings → Bluetooth & devices → Add device**.
   * Pair the Realme C3 and verify Windows sees it as a **"Hands-Free AG Audio"** device under Sound Settings.
3. Start Backend & Frontend:
   ```bash
   # Terminal 1
   cd backend && npm run dev

   # Terminal 2
   cd frontend && npm run dev
   ```
4. In iPhone PWA Settings:
   * Under **Voice Bridge (PC Bluetooth)**, tap **Scan Devices**, pick the phone Bluetooth input & output, and tap **Apply Audio Routing**.
5. Automated verification command:
   ```bash
   cd backend
   npx tsx test-voice-bridge.ts
   ```

---

## Strategy 2: ESP-32S Standalone Hardware Bridge (Branch: `voice-bridge-esp32`)
> **Ideal when:** You want a dedicated, headless 24/7 standalone hardware box that does not depend on your PC's Bluetooth adapter.

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
[ Node.js Backend (esp32VoiceBridge.ts) ]
    │ (Socket.io Realtime PCM Frames)
    ▼
[ iPhone Safari PWA (Web Audio API) ]
```

### Hardware Requirements
* **Board:** Classic ESP32 (e.g. Ai-Thinker ESP-32S or ESP-WROOM-32).
  * *Important:* Must be classic ESP32 with Dual-Mode Bluetooth (BR/EDR Classic + BLE). Single-core or BLE-only variants (ESP32-S2, ESP32-S3, ESP32-C3) do not support the Bluetooth Classic Hands-Free Profile (HFP).
* **Power:** Any standard 5V Micro-USB cable and charger.

### Firmware Setup & Flashing
The firmware is located in `firmware/esp32-voice-bridge/`.

1. **Configure Wi-Fi and Backend IP:**
   Open `firmware/esp32-voice-bridge/include/config.h`:
   ```c
   #define BRIDGE_WIFI_SSID        "Your_WiFi_SSID"
   #define BRIDGE_WIFI_PASS        "Your_WiFi_Password"
   #define BACKEND_HOST_IP         "192.168.1.100"      // Your PC's LAN IP
   #define BACKEND_UDP_AUDIO_PORT  4050
   ```

2. **Flash via PlatformIO (VS Code):**
   * Connect ESP-32S via USB.
   * Open folder `firmware/esp32-voice-bridge` in VS Code with PlatformIO.
   * Run:
     ```bash
     pio run --target upload
     pio device monitor
     ```

3. **Or Flash via ESP-IDF CLI:**
   ```bash
   cd firmware/esp32-voice-bridge
   idf.py set-target esp32
   idf.py build flash monitor
   ```

### Pairing with Android Phone
1. Once flashed, the ESP32 broadcasts Bluetooth Classic as **`DeviceBridge-Voice`**.
2. On your Realme C3, open **Settings → Bluetooth**, search for devices, and tap **DeviceBridge-Voice** to pair.
3. Grant permission for Phone Calls / Audio.
4. When any cellular phone call is answered, Android routes caller audio to the ESP32, which relays it over UDP port 4050 to the backend and down to your iPhone PWA in real time!

### Automated Verification
To verify the UDP listener, call state mapping, and bidirectional audio streaming without hardware:
```bash
cd backend
npx tsx test-esp32-bridge.ts
```
Expected output: `ALL 4/4 ESP32 VOICE BRIDGE TESTS PASSED!`.

