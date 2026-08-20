import { Socket } from "socket.io-client";

export const remoteAudioRef = { current: null as HTMLAudioElement | null };

export class WebRtcService {
  private peerConnection: RTCPeerConnection | null = null;
  private signalingSocket: Socket;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private onTrackCallback: ((stream: MediaStream) => void) | null = null;
  private activeCallId: string | null = null;

  constructor(signalingSocket: Socket) {
    this.signalingSocket = signalingSocket;
  }

  setCallId(callId: string) {
    this.activeCallId = callId;
  }

  async initialize(): Promise<MediaStream> {
    console.log("WebRtcService: Initializing local audio media stream");
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return this.localStream;
    } catch (err) {
      console.error("WebRtcService: getUserMedia microphone permission denied", err);
      throw err;
    }
  }

  private createPeerConnection() {
    if (this.peerConnection) {
      this.closeInternal();
    }

    console.log("WebRtcService: Creating RTCPeerConnection");
    const config: RTCConfiguration = {
      // Local network WebRTC works fine with default google STUN for ICE candidates
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Add local audio tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Set ICE candidate event listener
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.activeCallId) {
        console.log("WebRtcService: Gathered ICE candidate", event.candidate);
        this.signalingSocket.emit("webrtc:ice-candidate", {
          call_id: this.activeCallId,
          candidate: event.candidate,
        });
      }
    };

    // Set remote track listener
    this.peerConnection.ontrack = (event) => {
      console.log("WebRtcService: Remote track received", event.streams);
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch((err) => {
            console.error("WebRtcService: Remote audio autoplay failed", err);
          });
        }
        if (this.onTrackCallback) {
          this.onTrackCallback(stream);
        }
      }
    };
  }

  async createOffer(): Promise<string> {
    this.createPeerConnection();
    if (!this.peerConnection) throw new Error("PeerConnection not created");

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer.sdp || "";
  }

  async createAnswer(offerSdp: string): Promise<string> {
    this.createPeerConnection();
    if (!this.peerConnection) throw new Error("PeerConnection not created");

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: offerSdp })
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer.sdp || "";
  }

  async setRemoteDescription(sdp: string) {
    if (!this.peerConnection) {
      console.warn("WebRtcService: Cannot set remote description, PC is null");
      return;
    }
    const type = this.peerConnection.localDescription ? "answer" : "offer";
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type, sdp })
    );
  }

  async addIceCandidate(candidate: any) {
    if (!this.peerConnection) {
      console.warn("WebRtcService: Cannot add ICE candidate, PC is null");
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("WebRtcService: Failed to add remote ICE candidate", err);
    }
  }

  onRemoteAudioTrack(callback: (stream: MediaStream) => void) {
    this.onTrackCallback = callback;
    if (this.remoteStream) {
      callback(this.remoteStream);
    }
  }

  async close() {
    this.closeInternal();
  }

  private closeInternal() {
    console.log("WebRtcService: Closing WebRTC PeerConnection");
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.onTrackCallback = null;
    this.activeCallId = null;
  }
}
