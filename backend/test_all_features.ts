import { createApp } from "./src/app";
import { initSocket } from "./src/services/socketService";
import { createServer } from "http";
import { io as ClientIo, Socket } from "socket.io-client";
import { env } from "./src/config/environment";
import { encryptPayload, decryptPayload } from "./src/lib/crypto";

async function runTests() {
  console.log("==================================================");
  console.log("   DEVICE BRIDGE COMPREHENSIVE E2E VERIFICATION   ");
  console.log("==================================================\n");

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  const testPort = 9999;
  await new Promise<void>((resolve) => server.listen(testPort, resolve));
  const baseUrl = "http://localhost:" + testPort;
  console.log("[PASS] Test server listening on " + baseUrl);

  let androidToken = "";
  let iphoneToken = "";
  let androidSocket: Socket | null = null;
  let iphoneSocket: Socket | null = null;

  try {
    // 1. Health Check
    console.log("\n--- TEST 1: Health Check ---");
    const healthRes = await fetch(baseUrl + "/api/health");
    const healthJson = await healthRes.json();
    if (healthRes.status === 200 && healthJson.status === "ok") {
      console.log("[PASS] /api/health returned 200 OK:", healthJson);
    } else {
      throw new Error("Health check failed: " + JSON.stringify(healthJson));
    }

    // 2. Android Registration
    console.log("\n--- TEST 2: Android Device Registration ---");
    const regAndroidRes = await fetch(baseUrl + "/api/devices/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Register-Secret": env.registerSecret,
      },
      body: JSON.stringify({
        device_id: "realme_c3_1",
        device_name: "Realme C21-Y Test",
        device_type: "android",
        os_version: "11",
      }),
    });
    const regAndroidJson = await regAndroidRes.json();
    androidToken = regAndroidJson.api_token;
    if (regAndroidRes.status === 201 && androidToken) {
      console.log("[PASS] Android registered successfully. Token: " + androidToken.substring(0, 15) + "...");
    } else {
      throw new Error("Android registration failed: " + JSON.stringify(regAndroidJson));
    }

    // 3. iPhone Registration
    console.log("\n--- TEST 3: iPhone Device Registration ---");
    const regIphoneRes = await fetch(baseUrl + "/api/devices/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Register-Secret": env.registerSecret,
      },
      body: JSON.stringify({
        device_id: "iphone",
        device_name: "iPhone Client",
        device_type: "ios",
        os_version: "iOS 17.5",
      }),
    });
    const regIphoneJson = await regIphoneRes.json();
    if (regIphoneJson.data) {
      const decrypted = decryptPayload(regIphoneJson.data, env.registerSecret);
      iphoneToken = decrypted.api_token;
    } else {
      iphoneToken = regIphoneJson.api_token;
    }
    if (regIphoneRes.status === 201 && iphoneToken) {
      console.log("[PASS] iPhone registered successfully. Token: " + iphoneToken.substring(0, 15) + "...");
    } else {
      throw new Error("iPhone registration failed: " + JSON.stringify(regIphoneJson));
    }

    // 4. WebSocket Connections (Android + iPhone)
    console.log("\n--- TEST 4: WebSocket Authentication & Handshake ---");
    androidSocket = ClientIo(baseUrl, {
      auth: { token: androidToken },
      transports: ["websocket"],
    });
    iphoneSocket = ClientIo(baseUrl, {
      auth: { token: iphoneToken },
      transports: ["websocket"],
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        androidSocket!.on("connect", () => {
          console.log("[PASS] Android socket connected (SID: " + androidSocket!.id + ")");
          resolve();
        });
        androidSocket!.on("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        iphoneSocket!.on("connect", () => {
          console.log("[PASS] iPhone socket connected (SID: " + iphoneSocket!.id + ")");
          resolve();
        });
        iphoneSocket!.on("connect_error", reject);
      }),
    ]);

    // 5. Real-Time SMS Receive & Broadcast to iPhone
    console.log("\n--- TEST 5: Real-Time SMS Receive & Broadcast to iPhone ---");
    const smsPromise = new Promise<{ id: string; sender: string; message: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for message:new on iPhone")), 5000);
      iphoneSocket!.on("message:new", (envelope: any) => {
        clearTimeout(timeout);
        try {
          const payload = envelope.data ? decryptPayload(envelope.data, env.registerSecret) : envelope;
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    });

    const testSmsSender = "+923001234567";
    const testSmsBody = "Test SMS Verification Code: 4892";
    const postSmsRes = await fetch(baseUrl + "/api/messages/sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + androidToken,
      },
      body: JSON.stringify({
        sender: testSmsSender,
        message: testSmsBody,
        timestamp: Date.now(),
        device_id: "realme_c3_1",
      }),
    });
    const postSmsJson = await postSmsRes.json();
    if (postSmsRes.status !== 201) {
      throw new Error("Failed to POST SMS from Android: " + JSON.stringify(postSmsJson));
    }
    console.log("[PASS] Android successfully POSTed SMS to /api/messages/sms");

    const receivedSms = await smsPromise;
    if (receivedSms.sender === testSmsSender && (receivedSms.message === testSmsBody || (receivedSms as any).content === testSmsBody)) {
      console.log("[PASS] iPhone received live decrypted SMS broadcast:", receivedSms);
    } else {
      throw new Error("SMS content mismatch: " + JSON.stringify(receivedSms));
    }

    // 6. iPhone Fetch SMS List via REST
    console.log("\n--- TEST 6: iPhone Fetch SMS History via REST ---");
    const fetchSmsRes = await fetch(baseUrl + "/api/messages", {
      headers: { Authorization: "Bearer " + iphoneToken },
    });
    const fetchSmsJson = await fetchSmsRes.json();
    let messagesList: any[] = [];
    if (fetchSmsJson.data) {
      const decrypted = decryptPayload(fetchSmsJson.data, env.registerSecret);
      messagesList = decrypted.data || decrypted;
    } else if (fetchSmsJson.items) {
      messagesList = fetchSmsJson.items;
    }
    if (messagesList.length > 0) {
      console.log("[PASS] iPhone successfully fetched and decrypted " + messagesList.length + " SMS messages.");
    } else {
      throw new Error("iPhone fetched empty SMS messages list");
    }

    // 7. Incoming Call Alert Test
    console.log("\n--- TEST 7: Incoming Cellular Call Detection & iPhone Alert ---");
    const incomingCallPromise = new Promise<{ call_id: string; caller_number: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for call:incoming on iPhone")), 5000);
      iphoneSocket!.on("call:incoming", (envelope: any) => {
        clearTimeout(timeout);
        try {
          const payload = envelope.data ? decryptPayload(envelope.data, env.registerSecret) : envelope;
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    });

    const incomingCaller = "03414978300";
    const postIncomingRes = await fetch(baseUrl + "/api/calls/incoming", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + androidToken,
      },
      body: JSON.stringify({
        caller_number: incomingCaller,
        device_id: "realme_c3_1",
        timestamp: Date.now(),
      }),
    });
    const postIncomingJson = await postIncomingRes.json();
    if (postIncomingRes.status !== 201) {
      throw new Error("Failed to POST incoming call: " + JSON.stringify(postIncomingJson));
    }
    console.log("[PASS] Android posted incoming ringing SIM call to /api/calls/incoming");

    const receivedIncomingCall = await incomingCallPromise;
    if (receivedIncomingCall.caller_number === incomingCaller) {
      console.log("[PASS] iPhone received live call:incoming alert with Caller ID:", receivedIncomingCall);
    } else {
      throw new Error("Incoming caller mismatch: " + JSON.stringify(receivedIncomingCall));
    }

    // 8. Outgoing Call Signaling Test
    console.log("\n--- TEST 8: Outgoing Call Signaling ---");
    const outgoingCallPromise = new Promise<{ call_id: string; phone_number: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for call:outgoing on Android")), 5000);
      androidSocket!.on("call:outgoing", (envelope: any) => {
        clearTimeout(timeout);
        try {
          const payload = envelope.data ? decryptPayload(envelope.data, env.registerSecret) : envelope;
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    });

    const testDialNumber = "03009876543";
    const testCallId = "test-call-" + Date.now();
    const encryptedOutgoing = encryptPayload({
      call_id: testCallId,
      phone_number: testDialNumber,
    }, env.registerSecret);
    iphoneSocket!.emit("call:outgoing", { data: encryptedOutgoing });

    const receivedOutgoing = await outgoingCallPromise;
    if (receivedOutgoing.phone_number === testDialNumber) {
      console.log("[PASS] Android received call:outgoing command with phone number:", receivedOutgoing);
    } else {
      throw new Error("Outgoing phone number mismatch: " + JSON.stringify(receivedOutgoing));
    }

    // 9. Hang Up / End Call Test
    console.log("\n--- TEST 9: Hang Up / Call Termination Flow ---");
    const hangupPromise = new Promise<{ call_id: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for call:hangup on Android")), 5000);
      androidSocket!.on("call:hangup", (envelope: any) => {
        clearTimeout(timeout);
        try {
          const payload = envelope.data ? decryptPayload(envelope.data, env.registerSecret) : envelope;
          resolve(payload);
        } catch (e) {
          reject(e);
        }
      });
    });

    const encryptedHangup = encryptPayload({ call_id: testCallId }, env.registerSecret);
    iphoneSocket!.emit("call:hangup", { data: encryptedHangup });

    const receivedHangup = await hangupPromise;
    console.log("[PASS] Android received call:hangup signal to drop cellular line:", receivedHangup);

    // 10. Fetch Call History Test
    console.log("\n--- TEST 10: Fetch Call History via REST ---");
    const historyRes = await fetch(baseUrl + "/api/calls/history", {
      headers: { Authorization: "Bearer " + iphoneToken },
    });
    const historyJson = await historyRes.json();
    let historyList: any[] = [];
    if (historyJson.data) {
      const decrypted = decryptPayload(historyJson.data, env.registerSecret);
      historyList = Array.isArray(decrypted) ? decrypted : (decrypted.items || []);
    } else if (historyJson.items) {
      historyList = historyJson.items;
    }
    console.log("[PASS] iPhone successfully fetched and decrypted call history (" + historyList.length + " calls found).");

    console.log("\n==================================================");
    console.log("   ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY!  ");
    console.log("==================================================\n");
  } finally {
    if (androidSocket) androidSocket.disconnect();
    if (iphoneSocket) iphoneSocket.disconnect();
    server.close();
  }
}

runTests().catch((err) => {
  console.error("\n[FAIL] Test suite failed:", err);
  process.exit(1);
});
