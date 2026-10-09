/*
 * Device Bridge - ESP-32S Standalone Bluetooth Hands-Free (HFP) Voice Relay
 * 
 * Hardware: Ai-Thinker ESP-32S (Classic ESP32 Dual Core)
 * Function:
 *   - Pairs with Android phone as a Bluetooth Hands-Free kit (HFP-HF).
 *   - Receives cellular call voice over Bluetooth SCO and relays over Wi-Fi UDP to backend.
 *   - Receives microphone voice from backend over Wi-Fi UDP and injects into Bluetooth SCO.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/ringbuf.h"
#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_event.h"

// Bluetooth Stack Headers
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_bt_device.h"
#include "esp_gap_bt_api.h"
#include "esp_hf_client_api.h"

// LwIP Networking
#include "lwip/err.h"
#include "lwip/sockets.h"
#include "lwip/sys.h"
#include <lwip/netdb.h>

#include "config.h"

static const char *TAG = "ESP32_VOICE_BRIDGE";

// Networking state
static int udp_sock = -1;
static struct sockaddr_in backend_addr;
static bool wifi_connected = false;

// Audio Ring Buffer for Uplink (iPhone Mic -> UDP -> Phone Call)
#define UPLINK_RINGBUF_SIZE (16 * 1024)
static RingbufHandle_t uplink_ringbuf = NULL;

// Statistics
static uint32_t downlink_frames = 0;
static uint32_t uplink_frames = 0;

/* =========================================================================
 * 1. WI-FI EVENT HANDLER
 * ========================================================================= */
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        ESP_LOGI(TAG, "Wi-Fi connecting to %s...", BRIDGE_WIFI_SSID);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_connected = false;
        ESP_LOGW(TAG, "Wi-Fi disconnected. Reconnecting in 2s...");
        vTaskDelay(pdMS_TO_TICKS(2000));
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Wi-Fi connected! Assigned IP: " IPSTR, IP2STR(&event->ip_info.ip));
        wifi_connected = true;
    }
}

static void init_wifi(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = BRIDGE_WIFI_SSID,
            .password = BRIDGE_WIFI_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

/* =========================================================================
 * 2. UDP AUDIO NETWORKING
 * ========================================================================= */
static void init_udp_socket(void)
{
    udp_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (udp_sock < 0) {
        ESP_LOGE(TAG, "Unable to create UDP socket: errno %d", errno);
        return;
    }

    memset(&backend_addr, 0, sizeof(backend_addr));
    backend_addr.sin_family = AF_INET;
    backend_addr.sin_port = htons(BACKEND_UDP_AUDIO_PORT);
    backend_addr.sin_addr.s_addr = inet_addr(BACKEND_HOST_IP);

    ESP_LOGI(TAG, "UDP audio socket initialized targeting %s:%d", BACKEND_HOST_IP, BACKEND_UDP_AUDIO_PORT);
}

// Background task to receive uplink voice from backend over UDP
static void udp_uplink_rx_task(void *pvParameters)
{
    uint8_t rx_buffer[1024];
    struct sockaddr_in source_addr;
    socklen_t socklen = sizeof(source_addr);

    while (1) {
        if (udp_sock >= 0 && wifi_connected) {
            int len = recvfrom(udp_sock, rx_buffer, sizeof(rx_buffer), 0, (struct sockaddr *)&source_addr, &socklen);
            if (len > 0 && uplink_ringbuf != NULL) {
                // Push microphone packet to ring buffer for Bluetooth SCO transmission
                xRingbufferSend(uplink_ringbuf, rx_buffer, len, pdMS_TO_TICKS(10));
                uplink_frames++;
            }
        } else {
            vTaskDelay(pdMS_TO_TICKS(500));
        }
    }
}

/* =========================================================================
 * 3. BLUETOOTH HFP AUDIO CALLBACKS
 * ========================================================================= */

// DOWNLINK: Called when incoming voice frames arrive from the phone call
static void bt_hf_incoming_audio_cb(const uint8_t *buf, uint32_t sz)
{
    if (sz == 0 || buf == NULL) return;

    downlink_frames++;

    // Forward raw PCM audio frame to backend over Wi-Fi UDP
    if (wifi_connected && udp_sock >= 0) {
        sendto(udp_sock, buf, sz, 0, (struct sockaddr *)&backend_addr, sizeof(backend_addr));
    }
}

// UPLINK: Called by Bluetooth stack when it needs mic PCM bytes to send to caller
static uint32_t bt_hf_outgoing_audio_cb(uint8_t *buf, uint32_t sz)
{
    if (buf == NULL || sz == 0) return 0;

    if (uplink_ringbuf != NULL) {
        size_t item_size = 0;
        uint8_t *data = (uint8_t *)xRingbufferReceiveUpTo(uplink_ringbuf, &item_size, pdMS_TO_TICKS(2), sz);
        if (data != NULL) {
            memcpy(buf, data, item_size);
            vRingbufferReturnItem(uplink_ringbuf, (void *)data);
            return (uint32_t)item_size;
        }
    }

    // If no mic audio in buffer, output silence (0)
    memset(buf, 0, sz);
    return sz;
}

/* =========================================================================
 * 4. BLUETOOTH HFP CLIENT EVENT HANDLER
 * ========================================================================= */
static void bt_hf_client_cb(esp_hf_client_cb_event_t event, esp_hf_client_cb_param_t *param)
{
    switch (event) {
    case ESP_HF_CLIENT_CONNECTION_STATE_EVT:
        ESP_LOGI(TAG, "HFP Connection state changed: %d", param->conn_stat.state);
        if (param->conn_stat.state == ESP_HF_CLIENT_CONNECTION_STATE_CONNECTED) {
            ESP_LOGI(TAG, ">>> PHONE CONNECTED VIA BLUETOOTH HFP! <<<");
        }
        break;

    case ESP_HF_CLIENT_AUDIO_STATE_EVT:
        ESP_LOGI(TAG, "HFP Audio state: %d", param->audio_stat.state);
        if (param->audio_stat.state == ESP_HF_CLIENT_AUDIO_STATE_CONNECTED) {
            ESP_LOGI(TAG, ">>> CALL AUDIO ACTIVE (SCO LINK ESTABLISHED) <<<");
        } else {
            ESP_LOGI(TAG, "Call audio idle (SCO link closed)");
        }
        break;

    case ESP_HF_CLIENT_CIND_CALL_EVT:
        ESP_LOGI(TAG, "Call status: %d", param->cind_call.status);
        break;

    case ESP_HF_CLIENT_CIND_CALL_SETUP_EVT:
        ESP_LOGI(TAG, "Call setup status: %d (1=Incoming ringing, 2=Outgoing dialing)", param->cind_call_setup.status);
        break;

    default:
        break;
    }
}

/* =========================================================================
 * 5. MAIN ENTRY POINT
 * ========================================================================= */
void app_main(void)
{
    ESP_LOGI(TAG, "==================================================");
    ESP_LOGI(TAG, " DEVICE BRIDGE: ESP-32S STANDALONE VOICE RELAY    ");
    ESP_LOGI(TAG, "==================================================");

    // 1. Initialize NVS (required for Wi-Fi and Bluetooth pairing keys)
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // 2. Initialize Uplink Ring Buffer
    uplink_ringbuf = xRingbufferCreate(UPLINK_RINGBUF_SIZE, RINGBUF_TYPE_BYTEBUF);
    if (uplink_ringbuf == NULL) {
        ESP_LOGE(TAG, "Failed to create uplink ring buffer");
    }

    // 3. Initialize Wi-Fi
    init_wifi();
    init_udp_socket();

    // Start UDP uplink worker task
    xTaskCreatePinnedToCore(udp_uplink_rx_task, "udp_uplink_rx", 4096, NULL, 5, NULL, 0);

    // 4. Initialize Bluetooth Classic Controller
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_BLE));

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_CLASSIC_BT));

    // 5. Initialize Bluedroid Stack
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    // 6. Set Bluetooth Device Name and Discoverability
    esp_bt_dev_set_device_name(BT_DEVICE_NAME);

    // 7. Initialize HFP Client Profile
    esp_hf_client_register_callback(bt_hf_client_cb);
    esp_hf_client_init();
    esp_hf_client_register_data_callback(bt_hf_incoming_audio_cb, bt_hf_outgoing_audio_cb);

    // Make ESP32 discoverable and connectable
    esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);

    ESP_LOGI(TAG, "Bluetooth HFP Client active as '%s'.", BT_DEVICE_NAME);
    ESP_LOGI(TAG, "Pair your Android phone via Bluetooth settings.");
}
