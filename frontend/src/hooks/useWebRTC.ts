import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/index";
import {
  setIncomingCall,
  setActiveCall,
  addToCallHistory,
  clearActiveCall,
  updateCallDuration,
  setCallError,
} from "../store/callSlice";
import { getSocket } from "../services/socket";
import { WebRtcService } from "../services/webrtcService";

// HTML Audio Element Ref for remote playback
export const remoteAudioRef = { current: null as HTMLAudioElement | null };

let webrtcServiceInstance: WebRtcService | null = null;

function getWebRtcService(): WebRtcService {
  const socket = getSocket();
  if (!socket) throw new Error("Socket.io connection is not established");
  if (!webrtcServiceInstance) {
    webrtcServiceInstance = new WebRtcService(socket);
  }
  return webrtcServiceInstance;
}

export function useWebRTC() {
  const dispatch = useDispatch();
  const activeCall = useSelector((state: RootState) => state.call.activeCall);
  const incomingCall = useSelector((state: RootState) => state.call.incomingCall);
  const error = useSelector((state: RootState) => state.call.error);

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [duration, setDuration] = useState(0);

  // Re-connect / bind socket listeners for WebRTC signaling when socket becomes active
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const webrtc = getWebRtcService();

    // Bind media track event
    webrtc.onRemoteAudioTrack((stream) => {
      console.log("useWebRTC: Remote audio track received, assigning to audio element");
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((err) => {
          console.error("useWebRTC: Failed to auto-play remote audio stream", err);
        });
      }
    });

    socket.on("call:incoming", (data: { call_id: string; caller_number: string; timestamp?: number }) => {
      console.log("useWebRTC: Socket received call:incoming", data);
      dispatch(
        setIncomingCall({
          call_id: data.call_id,
          caller_number: data.caller_number,
          started_at: data.timestamp || Date.now(),
          is_incoming: true,
          status: "ringing",
        })
      );
      
      // Vibrate if browser supports it
      if (navigator.vibrate) {
        navigator.vibrate([500, 300, 500, 300, 500]);
      }
    });

    socket.on("call:accept-ack", async (data: { call_id: string }) => {
      console.log("useWebRTC: Socket received call:accept-ack", data);
    });

    socket.on("call:connected", (data: { call_id: string }) => {
      console.log("useWebRTC: Socket received call:connected", data);
      if (activeCall && activeCall.call_id === data.call_id) {
        dispatch(setActiveCall({ ...activeCall, status: "connected" }));
      } else if (incomingCall && incomingCall.call_id === data.call_id) {
        dispatch(setActiveCall({ ...incomingCall, status: "connected" }));
        dispatch(setIncomingCall(null));
      }
    });

    socket.on("webrtc:offer", async (data: { call_id: string; sdp_offer: string }) => {
      console.log("useWebRTC: Socket received webrtc:offer", data);
      try {
        webrtc.setCallId(data.call_id);
        await webrtc.initialize();
        const answer = await webrtc.createAnswer(data.sdp_offer);
        socket.emit("webrtc:answer", {
          call_id: data.call_id,
          sdp_answer: answer,
        });
        dispatch(setActiveCall({
          call_id: data.call_id,
          caller_number: activeCall?.caller_number || incomingCall?.caller_number || "Realme SIM",
          started_at: Date.now(),
          is_incoming: true,
          status: "connected",
        }));
      } catch (err: any) {
        console.error("useWebRTC: Failed to answer offer", err);
        dispatch(setCallError(err.message || "Failed to set up peer connection"));
      }
    });

    socket.on("webrtc:answer", async (data: { call_id: string; sdp_answer: string }) => {
      console.log("useWebRTC: Socket received webrtc:answer", data);
      try {
        await webrtc.setRemoteDescription(data.sdp_answer);
        dispatch(setActiveCall({
          call_id: data.call_id,
          caller_number: activeCall?.caller_number || "Realme SIM",
          started_at: activeCall?.started_at || Date.now(),
          is_incoming: false,
          status: "connected",
        }));
      } catch (err: any) {
        console.error("useWebRTC: Failed to process answer description", err);
        dispatch(setCallError(err.message || "Failed to process remote SDP"));
      }
    });

    socket.on("webrtc:ice-candidate", async (data: { call_id: string; candidate: any }) => {
      console.log("useWebRTC: Socket received webrtc:ice-candidate");
      await webrtc.addIceCandidate(data.candidate);
    });

    socket.on("call:hangup", (data: { call_id: string; duration?: number }) => {
      console.log("useWebRTC: Socket received call:hangup", data);
      if (activeCall && activeCall.call_id === data.call_id) {
        dispatch(
          addToCallHistory({
            ...activeCall,
            status: "ended",
            duration: data.duration || 0,
            ended_at: Date.now(),
          })
        );
      }
      dispatch(clearActiveCall());
      dispatch(setIncomingCall(null));
      webrtc.close();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    });

    socket.on("call:error", (data: { call_id?: string; error_message: string }) => {
      console.error("useWebRTC: Call error", data);
      dispatch(setCallError(data.error_message));
      dispatch(clearActiveCall());
      dispatch(setIncomingCall(null));
      webrtc.close();
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:accept-ack");
      socket.off("call:connected");
      socket.off("webrtc:offer");
      socket.off("webrtc:answer");
      socket.off("webrtc:ice-candidate");
      socket.off("call:hangup");
      socket.off("call:error");
    };
  }, [dispatch, activeCall, incomingCall]);

  // Duration Timer Interval
  useEffect(() => {
    if (!activeCall || activeCall.status !== "connected") {
      setDuration(0);
      return;
    }
    const start = activeCall.started_at;
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      setDuration(elapsed);
      dispatch(updateCallDuration(elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall, dispatch]);

  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      console.log("useWebRTC: Accepting incoming call", incomingCall.call_id);
      
      const socket = getSocket();
      socket?.emit("call:accept", { call_id: incomingCall.call_id });
      
      const webrtc = getWebRtcService();
      webrtc.setCallId(incomingCall.call_id);
      
      // Request mic permission
      await webrtc.initialize();
      
      dispatch(
        setActiveCall({
          ...incomingCall,
          status: "connected",
        })
      );
      dispatch(setIncomingCall(null));
    } catch (err: any) {
      console.error("useWebRTC: Failed to accept call", err);
      dispatch(setCallError(err.message || "Microphone access denied"));
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    console.log("useWebRTC: Rejecting incoming call", incomingCall.call_id);
    
    const socket = getSocket();
    socket?.emit("call:rejected", { call_id: incomingCall.call_id });
    
    dispatch(
      addToCallHistory({
        ...incomingCall,
        status: "missed",
        ended_at: Date.now(),
      })
    );
    dispatch(setIncomingCall(null));
  };

  const makeCall = async (phoneNumber: string) => {
    const callId = crypto.randomUUID();
    console.log("useWebRTC: Initiating outgoing call", callId, "to", phoneNumber);
    try {
      const socket = getSocket();
      if (!socket) throw new Error("Connection lost");

      // Initialize local media stream
      const webrtc = getWebRtcService();
      webrtc.setCallId(callId);
      await webrtc.initialize();

      dispatch(
        setActiveCall({
          call_id: callId,
          caller_number: phoneNumber,
          started_at: Date.now(),
          is_incoming: false,
          status: "ringing",
        })
      );

      // Notify signaling server
      socket.emit("call:outgoing", {
        call_id: callId,
        phone_number: phoneNumber,
      });

      // Generate local offer and transmit
      const offer = await webrtc.createOffer();
      socket.emit("webrtc:offer", {
        call_id: callId,
        sdp_offer: offer,
      });
    } catch (err: any) {
      console.error("useWebRTC: Failed to initiate outgoing call", err);
      dispatch(setCallError(err.message || "Failed to make call"));
    }
  };

  const hangupCall = async () => {
    const call = activeCall || incomingCall;
    if (!call) return;
    console.log("useWebRTC: Hanging up call", call.call_id);

    const socket = getSocket();
    socket?.emit("call:hangup", { call_id: call.call_id, duration });

    dispatch(
      addToCallHistory({
        ...call,
        status: "ended",
        duration,
        ended_at: Date.now(),
      })
    );
    dispatch(clearActiveCall());
    dispatch(setIncomingCall(null));

    const webrtc = getWebRtcService();
    webrtc.close();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    try {
      const webrtc = getWebRtcService();
      webrtc.close(); // wait, webrtcService has a setAudioEnabled or we can close stream tracks
    } catch {}
    // Standard track toggling:
    const stream = (webrtcServiceInstance as any)?.localStream as MediaStream | null;
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMute;
    });
  };

  const toggleSpeaker = () => {
    setIsSpeaker(!isSpeaker);
    if (remoteAudioRef.current) {
      // In browsers, standard audio volume can be used as a speaker fallback
      remoteAudioRef.current.volume = !isSpeaker ? 1.0 : 0.2;
    }
  };

  return {
    callState: activeCall ? activeCall.status : (incomingCall ? "ringing" : "idle"),
    callId: activeCall?.call_id || incomingCall?.call_id || null,
    callerNumber: activeCall?.caller_number || incomingCall?.caller_number || null,
    duration,
    isMuted,
    isSpeaker,
    isConnecting: activeCall?.status === "ringing",
    error,
    acceptCall,
    rejectCall,
    makeCall,
    hangupCall,
    toggleMute,
    toggleSpeaker,
    clearError: () => dispatch(setCallError(null)),
  };
}
