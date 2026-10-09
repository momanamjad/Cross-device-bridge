const realExit = process.exit.bind(process);
process.env.TEST_RUNNER = "true";

import assert from "assert";
import dgram from "dgram";
import { createApp } from "./src/app";
import { createServer } from "http";
import { initSocket } from "./src/services/socketService";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { prisma } from "./src/config/database";
import { hashToken } from "./src/lib/crypto";
import { WebRTCSignalServer } from "./src/services/webrtcSignal";
import { ESP32VoiceBridgeService } from "./src/services/esp32VoiceBridge";

async function runTests() {
  console.log("==================================================");
  console.log(" ESP32 HARDWARE RELAY AUTOMATED END-TO-END SUITE  ");
  console.log("==================================================\n");

  // TEST 1: Initialize Backend & Services
  console.log("[TEST 1/4] Starting HTTP server and initializing ESP32VoiceBridgeService...");
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);
  ESP32VoiceBridgeService.initialize(io);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const testPort = (httpServer.address() as any).port;
  console.log(`  Server listening on ephemeral port ${testPort}`);

  const testToken = "test_esp32_token_456";
  const tokenHash = hashToken(testToken);
  await prisma.device.upsert({
    where: { externalId: "test_device_esp32" },
    update: { tokenHash, isActive: true },
    create: {
      externalId: "test_device_esp32",
      deviceName: "Test Device ESP32",
      deviceType: "android",
      osVersion: "11",
      tokenHash,
      isActive: true,
    },
  });

  const initialStats = ESP32VoiceBridgeService.getStats();
  assert(initialStats.running, "ESP32 UDP listener should be running on port 4050");
  console.log("✔ TEST 1 PASSED: UDP listener active on port 4050.\n");

  // TEST 2: Socket.io Client Connection & Call Signaling
  console.log("[TEST 2/4] Connecting Socket.io client and accepting call...");
  const clientSocket: ClientSocketType = ClientSocket(`http://127.0.0.1:${testPort}`, {
    auth: { token: testToken },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    clientSocket.on("connect", () => resolve());
    clientSocket.on("connect_error", (err) => reject(err));
  });
  console.log("  Socket.io client connected with ID:", clientSocket.id);

  const testCallId = "call_esp32_" + Date.now();
  let receivedDownlinkPackets = 0;

  clientSocket.on("call:audio-downlink", (payload) => {
    receivedDownlinkPackets++;
    assert.strictEqual(payload.call_id, testCallId);
    assert(typeof payload.pcm === "string");
  });

  await WebRTCSignalServer.handleIncomingCall("+923001234567", testCallId);
  clientSocket.emit("call:accept", { call_id: testCallId });

  await new Promise((r) => setTimeout(r, 200));
  const activeStats = ESP32VoiceBridgeService.getStats();
  assert.strictEqual(activeStats.activeCallId, testCallId, "activeCallId should be set on accept");
  console.log("✔ TEST 2 PASSED: Active call mapped to ESP32 voice relay.\n");

  // TEST 3: Simulated ESP-32S Hardware UDP Streaming (Downlink: Phone -> ESP32 -> Backend -> iPhone)
  console.log("[TEST 3/4] Simulating ESP-32S sending cellular voice packets over UDP...");
  const mockEsp32Socket = dgram.createSocket("udp4");
  await new Promise<void>((r) => mockEsp32Socket.bind(0, r));

  let receivedUdpUplinkBytes = 0;
  mockEsp32Socket.on("message", (msg) => {
    receivedUdpUplinkBytes += msg.length;
  });

  const dummyPcmDownlink = Buffer.alloc(1280, 0x33); // 40ms of 16kHz audio
  // Send 5 UDP packets from mock ESP32 to backend port 4050
  for (let i = 0; i < 5; i++) {
    mockEsp32Socket.send(dummyPcmDownlink, 4050, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 40));
  }

  await new Promise((r) => setTimeout(r, 200));

  const statsAfterDownlink = ESP32VoiceBridgeService.getStats();
  console.log(`  ESP32 remote address learned: ${statsAfterDownlink.esp32Ip}`);
  console.log(`  Downlink packets received from ESP32: ${statsAfterDownlink.downlinkPackets}`);
  console.log(`  Downlink packets received by iPhone client: ${receivedDownlinkPackets}`);
  assert(statsAfterDownlink.downlinkPackets >= 5, "Backend should have received all 5 UDP packets");
  assert(receivedDownlinkPackets >= 5, "iPhone socket should have received all 5 downlink packets");
  console.log("✔ TEST 3 PASSED: Downlink audio relayed from ESP32 to iPhone.\n");

  // TEST 4: Uplink Streaming (iPhone Mic -> Backend -> ESP32 -> Caller)
  console.log("[TEST 4/4] Testing uplink audio (iPhone mic ➔ Backend ➔ ESP32 UDP)...");
  const dummyPcmUplink = Buffer.alloc(1280, 0x77);
  clientSocket.emit("call:audio-uplink", {
    call_id: testCallId,
    pcm: dummyPcmUplink.toString("base64"),
  });

  await new Promise((r) => setTimeout(r, 200));

  const statsAfterUplink = ESP32VoiceBridgeService.getStats();
  console.log(`  Uplink packets forwarded to ESP32: ${statsAfterUplink.uplinkPackets}`);
  console.log(`  Bytes received by mock ESP32: ${receivedUdpUplinkBytes}`);
  assert.strictEqual(statsAfterUplink.uplinkPackets, 1, "Should have forwarded 1 uplink packet");
  assert.strictEqual(receivedUdpUplinkBytes, 1280, "Mock ESP32 should have received 1280 bytes");

  // Call Teardown
  clientSocket.emit("call:hangup", { call_id: testCallId, duration: 3 });
  await new Promise((r) => setTimeout(r, 200));
  const finalStats = ESP32VoiceBridgeService.getStats();
  assert.strictEqual(finalStats.activeCallId, null, "Active call should be cleared on hangup");

  mockEsp32Socket.close();
  clientSocket.disconnect();
  httpServer.close();
  ESP32VoiceBridgeService.stop();
  console.log("✔ TEST 4 PASSED: Uplink audio verified and call cleared cleanly.\n");

  console.log("==================================================");
  console.log(" ALL 4/4 ESP32 VOICE BRIDGE TESTS PASSED!         ");
  console.log("==================================================");
  realExit(0);
}

runTests().catch((err) => {
  console.error("TEST FAILED WITH ERROR:", err);
  realExit(1);
});
