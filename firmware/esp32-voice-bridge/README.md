# Complete Beginner's Guide: ESP-32S Hands-Free Voice Bridge

Welcome! If you are completely new to the **ESP32** microcontroller, do not worry. This guide is written specifically for beginners with **zero prior electronics or hardware experience**. Every single step is explained in plain English, with exact links to download everything you need.

---

## Table of Contents
1. [What is This Board & What Does It Do?](#1-what-is-this-board--what-does-it-do)
2. [What You Need (Checklist)](#2-what-you-need-checklist)
3. [Step 1: Download & Install the Free Software](#3-step-1-download--install-the-free-software)
4. [Step 2: Connect the ESP32 to Your PC](#4-step-2-connect-the-esp32-to-your-pc)
5. [Step 3: Put Your Wi-Fi & PC Info into the Code](#5-step-3-put-your-wi-fi--pc-info-into-the-code)
6. [Step 4: Upload the Code to the ESP32 (Flashing)](#6-step-4-upload-the-code-to-the-esp32-flashing)
7. [Step 5: View the Live Board Logs (Serial Monitor)](#7-step-5-view-the-live-board-logs-serial-monitor)
8. [Step 6: Pair Your Android Phone with the ESP32](#8-step-6-pair-your-android-phone-with-the-esp32)
9. [Step 7: Testing Your First Live Call](#9-step-7-testing-your-first-live-call)
10. [Troubleshooting & Frequently Asked Questions](#10-troubleshooting--frequently-asked-questions)
11. [Helpful Learning Links & Video Tutorials](#11-helpful-learning-links--video-tutorials)

---

## 1. What is This Board & What Does It Do?

### The Problem
On Android 10 and newer versions (including your Realme C3), Google strictly blocks third-party apps from recording phone calls or sending microphone audio into a cellular call for security and privacy reasons. Regular Android apps simply cannot access the live voice in a cellular call without rooting the phone.

### The ESP-32S Solution
The **ESP-32S** is a tiny, low-cost ($3–$5) computer chip with built-in Bluetooth and Wi-Fi. 

Instead of fighting Android's software restrictions, we use hardware:
1. This ESP-32S board **acts like a wireless Bluetooth headset / car hands-free system**.
2. When you receive a cellular phone call on your Realme C3, Android automatically routes the caller's voice to this Bluetooth "headset" (the ESP32).
3. The ESP32 immediately beams that voice over your home Wi-Fi to your PC backend.
4. Your PC backend forwards the audio in real time to your **iPhone Safari PWA**.
5. When you speak into your iPhone microphone, your voice travels back:
   $$\text{iPhone} \longrightarrow \text{PC} \longrightarrow \text{ESP32 (via Wi-Fi)} \longrightarrow \text{Cellular Call (via Bluetooth)} \longrightarrow \text{Caller's Ear}$$

**Result:** True full-duplex two-way voice calling between your Android phone and iPhone, 24/7, without rooting your Android phone!

```
[ Caller on Phone ]
        │  (Cellular Call)
        ▼
[ Android Phone (Realme C3) ]
        │  (Bluetooth Hands-Free Profile)
        ▼
[ ESP-32S Hardware Board ]  <--- THIS DEVICE
        │  (Home Wi-Fi / UDP Port 4050)
        ▼
[ Your PC Backend (Node.js) ]
        │  (Local Network / Web Audio)
        ▼
[ Your iPhone PWA Client ]
```

---

## 2. What You Need (Checklist)

Before getting started, make sure you have:

* [x] **ESP-32S Development Board**:
  * Must be a standard **ESP32** (e.g. Ai-Thinker ESP-32S, ESP-WROOM-32, NodeMCU-32S).
  * ⚠️ *Note:* Do **NOT** use ESP32-S2, ESP32-S3, or ESP32-C3 boards. Those newer variants only support Bluetooth Low Energy (BLE) and **cannot** run Bluetooth Classic Hands-Free calls.
* [x] **Micro-USB Data Cable**:
  * ⚠️ *Critical:* Ensure your cable supports **Data transfer**, not just charging! Many cheap cables bundled with lamps or cheap power banks only have 2 power wires. If your PC does not make a connection sound when you plug it in, try another cable.
* [x] **Windows PC** connected to your local home Wi-Fi network.
* [x] **Android Phone** (e.g., Realme C3) with an active SIM card.
* [x] **iPhone** connected to the same home Wi-Fi.

---

## 3. Step 1: Download & Install the Free Software

You only need two free pieces of software on your Windows PC:

### 1. Visual Studio Code (VS Code)
VS Code is the code editor we will use.
* **Download link:** [https://code.visualstudio.com/Download](https://code.visualstudio.com/Download)
* Run the installer (`VSCodeUserSetup-x64-....exe`) and install with default settings.

### 2. PlatformIO Extension (Inside VS Code)
PlatformIO is a free tool that automatically downloads the ESP32 compiler, libraries, and flasher without you needing to configure anything in the command line.
1. Open **VS Code**.
2. Click the **Extensions** icon on the far left sidebar (or press `Ctrl + Shift + X`).
3. In the search box at the top, type `PlatformIO IDE`.
4. Click the blue **Install** button on **PlatformIO IDE** (it has an alien/ant icon).
5. Wait 2–3 minutes while it finishes setup. When done, restart VS Code if prompted.

### 3. USB-to-UART Driver (If Windows doesn't recognize your board)
Most ESP32 boards use a tiny chip near the USB connector to talk to your PC: either **CP2102** or **CH340**. Windows 10/11 usually installs these automatically, but if your board isn't detected:
* **For Silicon Labs CP2102 boards:**
  * Download: [Silicon Labs CP210x Universal Windows Driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
  * Unzip the downloaded file, right-click `silabser.inf`, and select **Install**.
* **For WCH CH340 boards:**
  * Download: [CH341SER.EXE Installer](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
  * Run the installer and click **INSTALL**.

---

## 4. Step 2: Connect the ESP32 to Your PC

1. Plug one end of your Micro-USB data cable into your **ESP-32S board**, and the other end into a **USB port on your PC**.
2. A red power LED on the board should light up immediately.
3. Check if Windows recognizes the board:
   * Right-click the **Start** button on Windows and click **Device Manager**.
   * Look down the list and expand **Ports (COM & LPT)**.
   * You should see an entry like:
     * `Silicon Labs CP210x USB to UART Bridge (COM3)`  
       *OR*
     * `USB-SERIAL CH340 (COM4)`
   * The number (e.g. `COM3` or `COM4`) is your port number.
   * *If nothing appears under "Ports (COM & LPT)":* Try a different USB cable or a different USB port on your PC.

---

## 5. Step 3: Put Your Wi-Fi & PC Info into the Code

Before flashing, we need to tell the ESP32 your home Wi-Fi name, password, and your PC's IP address so it can send the audio to your computer.

### A. Find Your PC's Local IP Address
1. Press `Windows Key + R`, type `cmd`, and press Enter.
2. In the black window, type:
   ```cmd
   ipconfig
   ```
3. Press Enter. Look for the section titled **Wireless LAN adapter Wi-Fi** (or Ethernet if on cable).
4. Find the line that says **IPv4 Address**. It looks like:
   ```text
   IPv4 Address. . . . . . . . . . . : 192.168.1.50
   ```
   *(Note down your actual number, e.g., `192.168.1.50`).*

### B. Edit the Configuration File
1. In VS Code, open the firmware folder:
   * Click **File → Open Folder...**
   * Navigate to `c:\Users\moman\Projects\device bridge\firmware\esp32-voice-bridge` and click **Select Folder**.
2. On the left file explorer, click on `include` and open the file [config.h](file:///c:/Users/moman/Projects/device%20bridge/firmware/esp32-voice-bridge/include/config.h).
3. You will see lines 9 to 14:
   ```c
   // Wi-Fi Credentials
   #define BRIDGE_WIFI_SSID        "YOUR_WIFI_SSID"
   #define BRIDGE_WIFI_PASS        "YOUR_WIFI_PASSWORD"

   // Node.js Backend Host & Port
   #define BACKEND_HOST_IP         "192.168.1.100"
   #define BACKEND_UDP_AUDIO_PORT  4050
   ```
4. Replace:
   * `"YOUR_WIFI_SSID"` with your actual home Wi-Fi name (e.g. `"HomeNetwork"`).
     > ⚠️ **Important:** ESP32 only supports **2.4 GHz Wi-Fi**. If your router has separate 2.4 GHz and 5 GHz networks, pick the 2.4 GHz network name.
   * `"YOUR_WIFI_PASSWORD"` with your actual home Wi-Fi password.
   * `"192.168.1.100"` with your PC's IPv4 address from step A (e.g. `"192.168.1.50"`).
   * Leave `BACKEND_UDP_AUDIO_PORT` as `4050`.
5. Press `Ctrl + S` to save the file.

---

## 6. Step 4: Upload the Code to the ESP32 (Flashing)

With your ESP32 plugged in and `config.h` saved:

1. Look at the very bottom blue status bar of VS Code. You will see several small PlatformIO icons:
   * **Checkmark (`✔`)**: Build (checks for errors).
   * **Right Arrow (`➔`)**: Upload (compiles and flashes the code onto your ESP32).
2. Click the **Right Arrow (`➔`)** button to upload.
3. A terminal window will open inside VS Code and begin compiling the code.

### ⚠️ The "BOOT" Button Trick (Crucial for Beginners)
During upload, watch the terminal text. If the terminal displays:
```text
Connecting........_____....._____.....
```
This means the board is waiting for permission to accept new code:
1. Find the two tiny pushbuttons on the ESP32 board: one is labeled **EN** (or RST) and the other is labeled **BOOT** (or IO0).
2. **Press and hold the `BOOT` button down for 2 seconds**, then let go.
3. You will immediately see the dots stop and text start scrolling:
   ```text
   Writing at 0x00010000... (100%)
   Wrote 561280 bytes (312450 compressed) at 0x00010000 in 6.4 seconds...
   Hash of data verified.
   Leaving...
   Hard resetting via RTS pin...
   [SUCCESS] Took 15.22 seconds
   ```
4. Congratulations! The voice bridge firmware is now installed and running permanently on your ESP32!

---

## 7. Step 5: View the Live Board Logs (Serial Monitor)

To confirm that the ESP32 is running and connected to your Wi-Fi:

1. In the bottom blue status bar of VS Code, click the **Electrical Plug icon (`🔌`)** (PlatformIO: Serial Monitor).
2. The terminal will show the live serial output at 115200 baud:
   ```text
   ========================================
     DEVICE BRIDGE: ESP-32S VOICE RELAY    
   ========================================
   Connecting to Wi-Fi SSID: 'HomeNetwork'...
   Wi-Fi Connected! IP Address: 192.168.1.88
   UDP Audio Socket active on port 4050 -> 192.168.1.50:4050
   Bluetooth HFP Client active as 'DeviceBridge-Voice'.
   Pair your Android phone via Bluetooth settings.
   ```
3. If you see this, your ESP32 is 100% operational, connected to your router, and broadcasting Bluetooth!

---

## 8. Step 6: Pair Your Android Phone with the ESP32

Now connect your Realme C3 to the ESP32:

1. On your **Realme C3**, open **Settings → Bluetooth**.
2. Turn Bluetooth **ON**.
3. Under **Available Devices**, you will see **`DeviceBridge-Voice`**.
4. Tap on **DeviceBridge-Voice** to pair.
5. If Android asks *"Pair with DeviceBridge-Voice? Allow access to your contacts and call history?"*, tap **Pair / Allow**.
6. Tap the little `(i)` or gear icon next to `DeviceBridge-Voice`:
   * Ensure that **Phone calls** is enabled (slider is ON).

Android now treats the ESP-32S board as its dedicated Hands-Free calling device!

---

## 9. Step 7: Testing Your First Live Call

Now let's test everything end-to-end:

### A. Start the Backend and Frontend on your PC
Open two separate PowerShell or Command Prompt terminals on your PC:

**Terminal 1 (Backend):**
```powershell
cd "c:\Users\moman\Projects\device bridge\backend"
npm run dev
```
*(You will see: `ESP32VoiceBridge: UDP listener active on port 4050`)*

**Terminal 2 (Frontend):**
```powershell
cd "c:\Users\moman\Projects\device bridge\frontend"
npm run dev
```

### B. Open on Your iPhone
1. On your iPhone, open Safari and navigate to:
   ```text
   http://YOUR_PC_IP:5173
   ```
   *(e.g., `http://192.168.1.50:5173`)*
2. In the PWA settings, confirm the API URL matches your PC IP.

### C. Make a Phone Call
1. Have someone call your Android phone's number (or call a test number like your carrier's customer service).
2. The incoming call alert will pop up on your **iPhone Safari PWA**.
3. Tap **Accept** on the iPhone:
   * The caller's voice will stream out of your iPhone's speaker in crisp real time!
   * Speak into your iPhone's microphone — the caller will hear your voice clearly!
4. Tap **End Call** when finished.

---

## 10. Troubleshooting & Frequently Asked Questions

### Q1: My PC doesn't detect the ESP32 board when plugged in (no sound in Windows).
* **Cause:** Most commonly, the USB cable is a "charge-only" cable without data wires.
* **Fix:** Swap the Micro-USB cable for a known good data cable (such as one used for transferring photos from a phone or camera). Test another USB port directly on your PC motherboard instead of an unpowered USB hub.

### Q2: During upload, it keeps printing `Connecting........_____.....` and fails.
* **Cause:** The ESP32's bootloader did not automatically enter flash mode.
* **Fix:** Hold down the **BOOT** button on the ESP32 as soon as the dots appear until the upload percentage starts moving, then release it.

### Q3: The Serial Monitor shows gibberish / strange characters (``).
* **Cause:** Baud rate mismatch.
* **Fix:** In VS Code, ensure the Serial Monitor baud rate is set to `115200`. In `platformio.ini`, `monitor_speed = 115200` is already configured.

### Q4: The ESP32 won't connect to my Wi-Fi.
* **Cause 1:** Your Wi-Fi name or password in `include/config.h` has a typo.
* **Cause 2:** You connected to a 5 GHz Wi-Fi frequency.
* **Fix:** Make sure you select your router's 2.4 GHz SSID. ESP32 hardware does not have a 5 GHz radio.

### Q5: Can I keep the ESP32 running permanently without my PC plugged in?
* **Yes!** Once flashed, the code is stored permanently in the ESP32's flash memory. You can unplug it from your PC and power it with any standard 5V USB phone charger brick plugged into a wall outlet anywhere in your home within Wi-Fi range.

---

## 11. Helpful Learning Links & Video Tutorials

If you want to watch visual video guides or read more about the ESP32:

* 📺 **Beginner ESP32 & PlatformIO Guide (YouTube):**
  * [PlatformIO in VS Code for Beginners (Step-by-Step)](https://www.youtube.com/results?search_query=platformio+vs+code+esp32+tutorial+beginners)
  * [How to Fix ESP32 "A fatal error occurred: Failed to connect" (BOOT Button Trick)](https://www.youtube.com/results?search_query=esp32+connecting+failed+to+connect+boot+button)
* 📖 **Official Hardware References:**
  * [Official Espressif ESP32 Overview](https://www.espressif.com/en/products/socs/esp32)
  * [PlatformIO ESP-IDF Documentation](https://docs.platformio.org/en/latest/frameworks/espidf.html)
* 🔧 **Driver Downloads:**
  * [CP210x USB to UART Drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
  * [CH340 / CH341 USB Drivers](https://www.wch-ic.com/downloads/CH341SER_EXE.html)

---

Enjoy your dedicated, standalone **Device Bridge Voice Relay**! If you ever want to switch back to the PC-only track without hardware, just run `git checkout voice-bridge-no-esp32`.
