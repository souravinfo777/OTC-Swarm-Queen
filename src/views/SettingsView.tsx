import React from 'react';
import { Settings, ShieldAlert, Sliders, CheckCircle2, Lock } from 'lucide-react';

interface SettingsViewProps {
  consensusThreshold: number;
  onConsensusChange: (val: number) => void;
  minConfidence: number;
  onMinConfidenceChange: (val: number) => void;
  cooldownSeconds: number;
  onCooldownChange: (val: number) => void;
  minTradesForValidation: number;
  onMinTradesChange: (val: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  consensusThreshold,
  onConsensusChange,
  minConfidence,
  onMinConfidenceChange,
  cooldownSeconds,
  onCooldownChange,
  minTradesForValidation,
  onMinTradesChange
}) => {
  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">
              PLATFORM CONFIGURATION & SAFETY PROTOCOL
            </div>
            <div className="text-xs text-zinc-400">
              Tune swarm arbitration thresholds, signal cooldowns, and genetic mutation parameters
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-900/60 text-rose-400 text-xs font-bold">
          <Lock className="w-3.5 h-3.5" />
          <span>EXECUTION SAFETY: HARD-LOCKED</span>
        </div>
      </div>

      {/* Safety Protocol Section */}
      <div className="bg-rose-950/20 border border-rose-900/60 rounded-xl p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
          <ShieldAlert className="w-4 h-4" />
          <span>LIVE TRADE EXECUTION ARCHITECTURE SAFEGUARD</span>
        </div>
        <p className="text-zinc-300 leading-relaxed">
          The execution layer in <code className="text-rose-300 bg-rose-950/80 px-1 py-0.5 rounded">backend/app/execution/adapter.py</code> and client services is hard-coded to <strong className="text-rose-300">DISABLED</strong>.
          The platform operates solely in <strong className="text-zinc-100">ANALYSIS</strong>, <strong className="text-zinc-100">SIGNAL_ONLY</strong>, and <strong className="text-zinc-100">PAPER TRADING</strong> modes. Real broker accounts cannot be debited.
        </p>
      </div>

      {/* Tunable Parameters Form */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-6">
        <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider border-b border-zinc-800 pb-3">
          Swarm Intelligence & Queen Consensus Controls
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Consensus Threshold */}
          <div className="space-y-2">
            <div className="flex justify-between text-zinc-300">
              <span className="font-semibold">Worker Consensus Threshold:</span>
              <span className="text-sky-400 font-bold">{Math.round(consensusThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.50"
              max="0.90"
              step="0.05"
              value={consensusThreshold}
              onChange={(e) => onConsensusChange(parseFloat(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-500">
              Minimum fraction of 20 Worker Flies that must vote for the same direction before Queen considers a signal.
            </p>
          </div>

          {/* Min Queen Confidence */}
          <div className="space-y-2">
            <div className="flex justify-between text-zinc-300">
              <span className="font-semibold">Minimum Queen Confidence:</span>
              <span className="text-emerald-400 font-bold">{Math.round(minConfidence * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.60"
              max="0.95"
              step="0.05"
              value={minConfidence}
              onChange={(e) => onMinConfidenceChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-500">
              Confidence floor required to trigger PAPER_SIGNAL status. Lower confidence results in WATCH mode.
            </p>
          </div>

          {/* Cooldown Seconds */}
          <div className="space-y-2">
            <div className="flex justify-between text-zinc-300">
              <span className="font-semibold">Signal Cooldown Duration:</span>
              <span className="text-amber-400 font-bold">{cooldownSeconds} seconds</span>
            </div>
            <input
              type="range"
              min="15"
              max="180"
              step="15"
              value={cooldownSeconds}
              onChange={(e) => onCooldownChange(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-500">
              Prevents spamming multiple signals within the same 60-second binary expiration window.
            </p>
          </div>

          {/* Min Trades For Validation */}
          <div className="space-y-2">
            <div className="flex justify-between text-zinc-300">
              <span className="font-semibold">Validation Trades Sample Floor:</span>
              <span className="text-purple-400 font-bold">{minTradesForValidation} trades</span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="25"
              value={minTradesForValidation}
              onChange={(e) => onMinTradesChange(parseInt(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-500">
              Number of paper trades required to graduate from PAPER_SIGNAL to VALIDATED_SIGNAL tier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
