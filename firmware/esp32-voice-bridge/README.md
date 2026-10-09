# ESP-32S Standalone Bluetooth Hands-Free Voice Bridge

This firmware turns the **ESP-32S** board into a dedicated, 24/7 hardware voice relay between your Android phone and the Device Bridge backend.

---

## Hardware Overview
* **Board:** Ai-Thinker ESP-32S (ESP32-D0WDQ6 / ESP-WROOM-32).
* **Radios Used:**
  * **Bluetooth Classic (BR/EDR):** Acts as a Hands-Free (HFP-HF) headset paired with your Android phone.
  * **Wi-Fi (802.11b/g/n):** Streams bidirectional PCM voice over UDP (port 4050) to your Node.js backend.
* **Power:** Runs continuously from any 5V USB phone charger or USB port.

---

## Architecture Flow

```
[ Caller ]
    │ (Cellular Call)
    ▼
[ Android Phone ]
    │ (Bluetooth HFP / SCO Audio Link)
    ▼
[ ESP-32S Board ]
    │ (Wi-Fi UDP Socket / Port 4050)
    ▼
[ Node.js Backend ]
    │ (Socket.io / Web Audio)
    ▼
[ iPhone PWA Client ]
```

---

## Configuration

Open `include/config.h` and set your local network credentials:

```c
#define BRIDGE_WIFI_SSID        "Your_Home_WiFi"
#define BRIDGE_WIFI_PASS        "Your_WiFi_Password"
#define BACKEND_HOST_IP         "192.168.1.100"      // IP of your PC / server
#define BACKEND_UDP_AUDIO_PORT  4050
```

---

## How to Flash the Firmware

### Option A: Using PlatformIO (VS Code) — Recommended
1. Install the **PlatformIO IDE** extension in VS Code.
2. In VS Code, choose **File → Open Folder** and select `firmware/esp32-voice-bridge`.
3. Connect your ESP-32S board to your PC via a micro-USB data cable.
4. Click the PlatformIO **Upload** button (arrow icon in bottom status bar) or run:
   ```bash
   pio run --target upload
   pio device monitor
   ```

### Option B: Using ESP-IDF CLI
1. Open the ESP-IDF command prompt (ESP-IDF v5.x).
2. Navigate to `firmware/esp32-voice-bridge`.
3. Set target and flash:
   ```bash
   idf.py set-target esp32
   idf.py build flash monitor
   ```

---

## How to Pair with Your Android Phone

1. Once flashed, the ESP32 will boot and print:
   ```text
   Bluetooth HFP Client active as 'DeviceBridge-Voice'.
   Pair your Android phone via Bluetooth settings.
   ```
2. On your Android phone (Realme C3):
   * Go to **Settings → Bluetooth**.
   * Tap on **DeviceBridge-Voice** to pair.
   * Allow access to calls when prompted.
3. Done! When a call arrives, Android will automatically route call audio through the ESP-32S, which relays it over Wi-Fi to your iPhone PWA.
