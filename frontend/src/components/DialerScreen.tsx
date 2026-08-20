import { useState } from "react";

interface DialerScreenProps {
  onCall: (phoneNumber: string) => void;
}

export function DialerScreen({ onCall }: DialerScreenProps) {
  const [digits, setDigits] = useState("");

  const handleKeyPress = (char: string) => {
    if (digits.length < 20) {
      setDigits((prev) => prev + char);
    }
  };

  const handleDelete = () => {
    setDigits((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDigits("");
  };

  const handleCall = () => {
    if (digits.trim().length > 0) {
      onCall(digits);
    }
  };

  // Helper to format number
  const formatDisplay = (val: string) => {
    // Standard visual grouping formatting
    if (val.startsWith("+")) {
      return val;
    }
    return val;
  };

  const keypad = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  return (
    <div className="flex flex-col w-full max-w-sm mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg text-white">
      {/* Display Screen */}
      <div className="flex flex-col items-end justify-center h-20 px-4 mb-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
        <span className="text-2xl font-semibold tracking-wide text-white select-all break-all text-right">
          {formatDisplay(digits) || "Enter number"}
        </span>
        {digits.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider mt-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid Keypad */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {keypad.map((row) =>
          row.map((char) => (
            <button
              key={char}
              onClick={() => handleKeyPress(char)}
              className="flex h-14 items-center justify-center rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/40 text-xl font-medium transition active:scale-95 select-none"
            >
              {char}
            </button>
          ))
        )}

        {/* Plus Button */}
        <button
          onClick={() => handleKeyPress("+")}
          className="flex h-14 items-center justify-center rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/40 text-xl font-medium transition active:scale-95 select-none"
        >
          +
        </button>

        {/* 0 digit */}
        <button
          onClick={() => handleKeyPress("0")}
          className="hidden" // Handled in grid keypad mapping, this placeholder aligns elements
        >
          0
        </button>

        {/* Delete backspace */}
        <button
          onClick={handleDelete}
          aria-label="Backspace"
          className="flex h-14 items-center justify-center rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/40 text-xl font-medium transition active:scale-95 select-none col-start-3"
        >
          ⌫
        </button>
      </div>

      {/* Action triggers */}
      <div className="flex justify-center w-full">
        <button
          onClick={handleCall}
          disabled={digits.trim().length === 0}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors shadow-lg active:scale-95"
        >
          <span className="text-2xl">📞</span>
        </button>
      </div>
    </div>
  );
}
