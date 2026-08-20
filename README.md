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

