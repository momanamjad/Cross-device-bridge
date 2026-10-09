import { Socket } from "socket.io-client";

export class VoiceBridgeService {
  private socket: Socket;
  private audioCtx: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isRunning: boolean = false;
  private isMuted: boolean = false;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private activeCallId: string | null = null;

  private onDownlinkLevelCallback?: (level: number) => void;
  private onUplinkLevelCallback?: (level: number) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public setCallbacks(callbacks: {
    onDownlinkLevel?: (level: number) => void;
    onUplinkLevel?: (level: number) => void;
  }) {
    this.onDownlinkLevelCallback = callbacks.onDownlinkLevel;
    this.onUplinkLevelCallback = callbacks.onUplinkLevel;
  }

  public async start(callId: string) {
    if (this.isRunning && this.activeCallId === callId) return;
    this.stop();

    this.activeCallId = callId;
    this.isRunning = true;

    // 1. Initialize Web Audio Context (16kHz for telephony clarity)
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
    this.nextPlayTime = this.audioCtx.currentTime + 0.05; // 50ms pre-buffer

    // 2. Listen for downlink audio from PC Bluetooth bridge
    this.socket.on("call:audio-downlink", this.handleDownlinkAudio);

    // 3. Start microphone capture for uplink
    await this.startMicrophoneCapture();
  }

  public stop() {
    this.isRunning = false;
    this.activeCallId = null;

    this.socket.off("call:audio-downlink", this.handleDownlinkAudio);

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (_) {}
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }

    this.nextPlayTime = 0;
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
  }

  private handleDownlinkAudio = (data: { call_id: string; pcm: string }) => {
    if (!this.isRunning || !this.audioCtx || data.call_id !== this.activeCallId) return;

    try {
      const binaryStr = atob(data.pcm);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Convert 16-bit PCM little-endian to Float32
      const numSamples = Math.floor(len / 2);
      const floatSamples = new Float32Array(numSamples);
      const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      let sumSquare = 0;
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(i * 2, true);
        const floatVal = sample / 32768.0;
        floatSamples[i] = floatVal;
        sumSquare += floatVal * floatVal;
      }

      // Calculate audio meter level
      const rms = Math.sqrt(sumSquare / (numSamples || 1));
      if (this.onDownlinkLevelCallback) {
        this.onDownlinkLevelCallback(Math.min(1, rms * 4));
      }

      // Play via AudioBuffer
      const audioBuffer = this.audioCtx.createBuffer(1, numSamples, 16000);
      audioBuffer.copyToChannel(floatSamples, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      const currentTime = this.audioCtx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime + 0.02; // Small catch-up buffer
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
    } catch (err) {
      console.warn("Failed to play downlink PCM frame", err);
    }
  };

  private async startMicrophoneCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!this.audioCtx) return;

      const micSource = this.audioCtx.createMediaStreamSource(this.mediaStream);
      // Use 1024 or 2048 buffer size
      this.scriptProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isRunning || !this.activeCallId || this.isMuted) {
          if (this.onUplinkLevelCallback) this.onUplinkLevelCallback(0);
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const inputSampleRate = this.audioCtx?.sampleRate || 44100;
        const targetSampleRate = 16000;

        // Downsample input to 16kHz
        const ratio = inputSampleRate / targetSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const pcm16 = new Int16Array(outputLength);

        let sumSquare = 0;
        for (let i = 0; i < outputLength; i++) {
          const sampleIndex = Math.floor(i * ratio);
          const sample = Math.max(-1, Math.min(1, inputData[sampleIndex]));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          sumSquare += sample * sample;
        }

        const rms = Math.sqrt(sumSquare / (outputLength || 1));
        if (this.onUplinkLevelCallback) {
          this.onUplinkLevelCallback(Math.min(1, rms * 4));
        }

        // Convert Int16Array to base64
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        this.socket.emit("call:audio-uplink", {
          call_id: this.activeCallId,
          pcm: base64,
        });
      };

      micSource.connect(this.scriptProcessor);
      // ScriptProcessor needs to connect to destination on some browsers to run
      this.scriptProcessor.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn("Could not capture microphone for uplink", err);
    }
  }
}
