import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Call {
  call_id: string;
  caller_number: string;
  caller_name?: string;
  duration?: number;
  started_at: number;
  ended_at?: number;
  is_incoming: boolean;
  status: "ringing" | "connected" | "ended" | "missed";
}

interface CallState {
  activeCall: Call | null;
  incomingCall: Call | null;
  callHistory: Call[];
  isLoading: boolean;
  error: string | null;
}

const initialState: CallState = {
  activeCall: null,
  incomingCall: null,
  callHistory: [],
  isLoading: false,
  error: null,
};

export const callSlice = createSlice({
  name: "call",
  initialState,
  reducers: {
    setIncomingCall: (state, action: PayloadAction<Call | null>) => {
      state.incomingCall = action.payload;
    },
    setActiveCall: (state, action: PayloadAction<Call | null>) => {
      state.activeCall = action.payload;
    },
    addToCallHistory: (state, action: PayloadAction<Call>) => {
      // Avoid duplicate history entries
      state.callHistory = [
        action.payload,
        ...state.callHistory.filter((c) => c.call_id !== action.payload.call_id),
      ];
    },
    updateCallDuration: (state, action: PayloadAction<number>) => {
      if (state.activeCall) {
        state.activeCall.duration = action.payload;
      }
    },
    clearActiveCall: (state) => {
      state.activeCall = null;
    },
    setCallError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setIncomingCall,
  setActiveCall,
  addToCallHistory,
  updateCallDuration,
  clearActiveCall,
  setCallError,
} = callSlice.actions;

export default callSlice.reducer;
