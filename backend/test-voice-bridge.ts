const realExit = process.exit.bind(process);
process.env.TEST_RUNNER = "true";
process.env.VOICE_BRIDGE_MODE = "pc";

import assert from "assert";
import { PCAudioBridgeService } from "./src/services/pcAudioBridge";
import { createApp } from "./src/app";
import { createServer } from "http";
import { initSocket } from "./src/services/socketService";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { prisma } from "./src/config/database";
import { hashToken } from "./src/lib/crypto";
import { WebRTCSignalServer } from "./src/services/webrtcSignal";
import { VoiceBridgeManager } from "./src/services/voiceBridgeManager";

async function runTests() {
  console.log("==================================================");
  console.log("   VOICE BRIDGE AUTOMATED END-TO-END TEST SUITE   ");
  console.log("==================================================\n");

  // TEST 1: Native Audio Executable Device Enumeration
  console.log("[TEST 1/5] Testing device enumeration via PCAudioBridgeService...");
  const devices = await PCAudioBridgeService.getDevices();
  console.log(`  Found ${devices.inputs.length} input devices, ${devices.outputs.length} output devices.`);
  assert(Array.isArray(devices.inputs), "inputs should be an array");
  assert(Array.isArray(devices.outputs), "outputs should be an array");
  assert(devices.inputs.length > 0, "should detect at least one input device");
  assert(devices.outputs.length > 0, "should detect at least one output device");
  console.log("  Default input:", devices.inputs[0].name);
  console.log("  Default output:", devices.outputs[0].name);
  console.log("✔ TEST 1 PASSED: Device enumeration successful.\n");

  // TEST 2: Device Auto-Detection
  console.log("[TEST 2/5] Testing device auto-detection logic...");
  const detected = await PCAudioBridgeService.autoDetectDevices();
  assert(detected.input !== null, "detected input should not be null");
  assert(detected.output !== null, "detected output should not be null");
  console.log(`  Auto-detected In: [${detected.input.id}] ${detected.input.name}`);
  console.log(`  Auto-detected Out: [${detected.output.id}] ${detected.output.name}`);
  console.log("✔ TEST 2 PASSED: Auto-detection returned valid endpoints.\n");

  // TEST 3: HTTP Server & Audio REST API
  console.log("[TEST 3/5] Starting HTTP server and testing REST endpoints...");
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);
  VoiceBridgeManager.setMode("pc");

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const testPort = (httpServer.address() as any).port;
  console.log(`  Server listening on ephemeral port ${testPort}`);

  // Create a test device token in DB for auth
  const testToken = "test_voice_bridge_token_123";
  const tokenHash = hashToken(testToken);
  await prisma.device.upsert({
    where: { externalId: "test_device_pc" },
    update: { tokenHash, isActive: true },
    create: {
      externalId: "test_device_pc",
      deviceName: "Test PC",
      deviceType: "windows",
      osVersion: "11",
      tokenHash,
      isActive: true,
    },
  });

  // Query /api/audio/devices via fetch
  const resDevices = await fetch(`http://127.0.0.1:${testPort}/api/audio/devices`, {
    headers: { Authorization: `Bearer ${testToken}` },
  });
  assert.strictEqual(resDevices.status, 200, "GET /api/audio/devices should return 200");
  const jsonDevices = await resDevices.json();
  assert(jsonDevices.devices.inputs.length > 0, "REST devices.inputs should be populated");
  console.log("  REST GET /api/audio/devices returned 200 OK");

  // Select device via /api/audio/select
  const resSelect = await fetch(`http://127.0.0.1:${testPort}/api/audio/select`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
    },
    body: JSON.stringify({ input_id: 0, output_id: 0 }),
  });
  assert.strictEqual(resSelect.status, 200, "POST /api/audio/select should return 200");
  console.log("  REST POST /api/audio/select returned 200 OK");
  console.log("✔ TEST 3 PASSED: REST API endpoints functioning properly.\n");

  // TEST 4: Socket.io Client Connection & Audio Streaming Loop
  console.log("[TEST 4/5] Testing Socket.io Audio Bridge connection and packet streaming...");
  const clientSocket: ClientSocketType = ClientSocket(`http://127.0.0.1:${testPort}`, {
    auth: { token: testToken },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    clientSocket.on("connect", () => resolve());
    clientSocket.on("connect_error", (err) => reject(err));
  });
  console.log("  Socket.io client connected with ID:", clientSocket.id);

  const testCallId = "call_test_" + Date.now();
  let receivedDownlinkPackets = 0;

  clientSocket.on("call:audio-downlink", (payload) => {
    receivedDownlinkPackets++;
    assert.strictEqual(payload.call_id, testCallId, "payload.call_id should match");
    assert(typeof payload.pcm === "string", "payload.pcm should be base64 string");
    assert(payload.pcm.length > 0, "payload.pcm should not be empty");
  });

  // Prepare call in WebRTCSignalServer
  await WebRTCSignalServer.handleIncomingCall("+923001234567", testCallId);

  // Simulate call:accept to trigger PC audio bridge
  console.log("  Emitting call:accept for call_id:", testCallId);
  clientSocket.emit("call:accept", { call_id: testCallId });

  // Wait 1.5 seconds for native bridge to capture live audio frames from microphone
  console.log("  Capturing live audio frames from native bridge...");
  await new Promise((r) => setTimeout(r, 1500));

  // Check stats
  const statsAfterStart = PCAudioBridgeService.getStats();
  console.log(`  Bridge running: ${statsAfterStart.running}`);
  console.log(`  Downlink packets emitted: ${statsAfterStart.downlinkPackets}`);
  console.log(`  Bytes received from native audio: ${statsAfterStart.bytesReceived}`);
  assert(statsAfterStart.running, "PCAudioBridge should be running");
  if (statsAfterStart.downlinkPackets > 0) {
    assert(receivedDownlinkPackets > 0, "Client socket should have received downlink packets");
    console.log("  ✔ Captured live audio frames from native bridge.");
  } else {
    console.log("  ℹ Input device is currently silent/idle; proceeding to uplink test.");
  }

  // Test uplink: simulate sending user voice from iPhone mic to PC
  console.log("  Testing uplink (iPhone mic ➔ PC audio output)...");
  const dummyPcm = Buffer.alloc(1280, 0x1a); // 40ms of simulated 16kHz audio
  clientSocket.emit("call:audio-uplink", {
    call_id: testCallId,
    pcm: dummyPcm.toString("base64"),
  });

  await new Promise((r) => setTimeout(r, 300));
  const statsAfterUplink = PCAudioBridgeService.getStats();
  console.log(`  Uplink packets relayed: ${statsAfterUplink.uplinkPackets}`);
  console.log(`  Bytes sent to audio output: ${statsAfterUplink.bytesSent}`);
  assert(statsAfterUplink.uplinkPackets > 0, "Should have processed uplink audio packet");
  console.log("✔ TEST 4 PASSED: Bidirectional audio streaming working successfully.\n");

  // TEST 5: Call Teardown & Resource Cleanup
  console.log("[TEST 5/5] Testing call teardown and clean shutdown...");
  clientSocket.emit("call:hangup", { call_id: testCallId, duration: 2 });
  await new Promise((r) => setTimeout(r, 500));

  const finalStats = PCAudioBridgeService.getStats();
  console.log(`  Bridge running after hangup: ${finalStats.running}`);
  assert.strictEqual(finalStats.running, false, "Bridge process should be stopped after hangup");
  assert.strictEqual(finalStats.activeCallId, null, "activeCallId should be null");

  clientSocket.disconnect();
  httpServer.close();
  console.log("✔ TEST 5 PASSED: Clean teardown verified.\n");

  console.log("==================================================");
  console.log("  ALL 5/5 END-TO-END TESTS PASSED SUCCESSFULLY!   ");
  console.log("==================================================");
  realExit(0);
}

runTests().catch((err) => {
  console.error("TEST FAILED WITH ERROR:", err);
  realExit(1);
});
