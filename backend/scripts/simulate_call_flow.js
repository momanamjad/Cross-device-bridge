/**
 * End-to-End Simulation Script for Device Bridge
 *
 * This script runs entirely on PC to test and verify the complete
 * calling and signaling handshake between simulated iPhone, Android, and Backend.
 *
 * Usage:
 *   node backend/scripts/simulate_call_flow.js [port]
 */

const { io } = require("socket.io-client");
const http = require("http");

const fs = require("fs");
const path = require("path");

// Read .env if exists
let envSecret = "super_secret_bridge_key";
let envPort = process.argv[2];

const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const secretMatch = envContent.match(/REGISTER_SECRET=(.*)/);
  if (secretMatch) envSecret = secretMatch[1].trim();
  const portMatch = envContent.match(/PORT=(.*)/);
  if (portMatch && !envPort) envPort = portMatch[1].trim();
}

const PORT = envPort || 9000;
const BASE_URL = `http://localhost:${PORT}`;
const REGISTER_SECRET = envSecret;

console.log(`\n🚀 Starting Device Bridge Simulation on ${BASE_URL} (Secret: ${REGISTER_SECRET})...`);

function postJson(path, headers, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyStr = JSON.stringify(data);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        let respData = "";
        res.on("data", (chunk) => (respData += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(respData) });
          } catch (e) {
            resolve({ status: res.statusCode, body: respData });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  try {
    // 1. Health Check
    console.log("1. Checking Server Health...");
    const health = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/health`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      }).on("error", reject);
    });
    console.log(`   ✅ Server is healthy! (Server IP: ${health.server_ip}, Status: ${health.status})`);

    // 2. Register Devices
    console.log("2. Registering Simulated Devices...");
    const androidReg = await postJson("/api/devices/register", { "x-register-secret": REGISTER_SECRET }, {
      device_id: "realme_c3_1",
      device_name: "Simulated Realme C3",
      device_type: "android",
      os_version: "11"
    });
    const androidToken = androidReg.body.api_token;
    console.log(`   ✅ Android registered (token: ${androidToken.slice(0, 10)}...)`);

    const iphoneReg = await postJson("/api/devices/register", { "x-register-secret": REGISTER_SECRET }, {
      device_id: "iphone",
      device_name: "Simulated iPhone 15 Pro",
      device_type: "ios",
      os_version: "iOS 17.5"
    });
    const iphoneToken = iphoneReg.body.api_token;
    console.log(`   ✅ iPhone registered (token: ${iphoneToken.slice(0, 10)}...)`);

    // 3. Connect Sockets
    console.log("3. Connecting WebSockets...");
    const androidSocket = io(BASE_URL, {
      auth: { token: androidToken },
      query: { token: androidToken },
      transports: ["websocket"]
    });

    const iphoneSocket = io(BASE_URL, {
      auth: { token: iphoneToken },
      query: { token: iphoneToken },
      transports: ["websocket"]
    });

    await Promise.all([
      new Promise((res) => androidSocket.on("connect", () => {
        console.log("   ✅ Android Socket Connected");
        res();
      })),
      new Promise((res) => iphoneSocket.on("connect", () => {
        console.log("   ✅ iPhone Socket Connected");
        res();
      }))
    ]);

    // 4. Test Call Flow
    console.log("4. Simulating Outgoing Call from iPhone...");
    const testCallId = `test_${Date.now()}`;
    const testPhone = "+1234567890";

    // Setup Android expectation: receive call:outgoing
    const callReceivedPromise = new Promise((resolve) => {
      androidSocket.on("call:outgoing", (data) => {
        console.log(`   📞 Android received "call:outgoing": call_id=${data.call_id}, number=${data.phone_number}`);
        resolve(data);
      });
    });

    // iPhone initiates call
    iphoneSocket.emit("call:outgoing", {
      call_id: testCallId,
      phone_number: testPhone
    });

    const outgoingData = await callReceivedPromise;
    if (outgoingData.call_id !== testCallId) {
      throw new Error(`Call ID mismatch! Expected ${testCallId}, got ${outgoingData.call_id}`);
    }

    // 5. WebRTC Handshake (Android sends offer -> iPhone answers)
    console.log("5. Testing WebRTC Signaling Handshake...");
    const offerReceivedPromise = new Promise((resolve) => {
      iphoneSocket.on("webrtc:offer", (data) => {
        console.log(`   📡 iPhone received "webrtc:offer" for call_id=${data.call_id || testCallId}`);
        resolve(data);
      });
    });

    // Android generates offer
    androidSocket.emit("webrtc:offer", {
      call_id: testCallId,
      sdp_offer: "v=0\r\no=- 1234 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
    });

    await offerReceivedPromise;

    // iPhone sends answer
    const answerReceivedPromise = new Promise((resolve) => {
      androidSocket.on("webrtc:answer", (data) => {
        console.log(`   📡 Android received "webrtc:answer" for call_id=${data.call_id || testCallId}`);
        resolve(data);
      });
    });

    iphoneSocket.emit("webrtc:answer", {
      call_id: testCallId,
      sdp_answer: "v=0\r\no=- 5678 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
    });

    await answerReceivedPromise;

    // 6. Test Hangup from iPhone
    console.log("6. Testing Call Hangup from iPhone...");
    const hangupReceivedPromise = new Promise((resolve) => {
      androidSocket.on("call:hangup", (data) => {
        console.log(`   📴 Android received "call:hangup" for call_id=${data.call_id || testCallId}`);
        resolve(data);
      });
    });

    iphoneSocket.emit("call:hangup", {
      call_id: testCallId,
      duration: 5
    });

    await hangupReceivedPromise;

    console.log("\n✨ SUCCESS! All call signaling, WebRTC negotiation, and hangup completed cleanly!");
    androidSocket.disconnect();
    iphoneSocket.disconnect();
    process.exit(0);

  } catch (err) {
    console.error("\n❌ Simulation Error:", err.message || err);
    process.exit(1);
  }
}

run();
