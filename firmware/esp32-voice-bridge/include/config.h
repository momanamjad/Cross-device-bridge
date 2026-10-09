#ifndef CONFIG_H
#define CONFIG_H

// =========================================================================
// DEVICE BRIDGE: ESP-32S VOICE RELAY CONFIGURATION
// =========================================================================

// Wi-Fi Credentials
#define BRIDGE_WIFI_SSID        "YOUR_WIFI_SSID"
#define BRIDGE_WIFI_PASS        "YOUR_WIFI_PASSWORD"

// Node.js Backend Host & Port
#define BACKEND_HOST_IP         "192.168.1.100"
#define BACKEND_UDP_AUDIO_PORT  4050

// Bluetooth Configuration
#define BT_DEVICE_NAME          "DeviceBridge-Voice"

// Audio Stream Parameters
#define AUDIO_SAMPLE_RATE       16000       // 16kHz telephony wideband (mSBC) or 8kHz (CVSD)
#define AUDIO_CHANNELS          1           // Mono
#define AUDIO_BITS_PER_SAMPLE   16          // 16-bit signed PCM
#define AUDIO_BUFFER_SIZE       1280        // 40ms frame at 16kHz 16-bit mono

#endif // CONFIG_H
