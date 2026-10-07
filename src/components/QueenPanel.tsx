import React, { useState, useEffect } from 'react';
import { QueenSignal } from '../types/swarm';
import { Crown, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, ShieldCheck, Timer, Target, Clock, Zap } from 'lucide-react';

interface QueenPanelProps {
  signal: QueenSignal | null;
  onExplainWithAI?: () => void;
}

export const QueenPanel: React.FC<QueenPanelProps> = ({ signal, onExplainWithAI }) => {
  // Live ticking countdown for current M1 candle expiry
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    return 59 - (Math.floor(Date.now() / 1000) % 60);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const sec = 59 - (Math.floor(Date.now() / 1000) % 60);
      setSecondsRemaining(sec);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  if (!signal) {
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-zinc-500 text-xs flex items-center justify-center min-h-[220px]">
        Awaiting Queen Fly state initialization...
      </div>
    );
  }

  const rawDir = String(signal.direction || 'HOLD');
  const isUp = rawDir === 'UP' || rawDir === 'CALL';
  const isDown = rawDir === 'DOWN' || rawDir === 'PUT';
  const isHold = !isUp && !isDown;

  const isEntryZone = secondsRemaining <= 7;
  const timeFormatted = `00:${String(secondsRemaining).padStart(2, '0')}s`;

  const statusColors: Record<string, string> = {
    NO_SIGNAL: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    WATCH: 'bg-amber-950/80 text-amber-400 border-amber-800',
    PAPER_SIGNAL: 'bg-sky-950/80 text-sky-400 border-sky-800',
    VALIDATED_SIGNAL: 'bg-emerald-950 text-emerald-400 border-emerald-700',
    FEED_OFFLINE_HOLD: 'bg-rose-950/80 text-rose-400 border-rose-800',
    ACCUMULATING_REAL_CANDLES: 'bg-amber-950/80 text-amber-400 border-amber-800',
    FEED_ERROR_NO_REAL_DATA: 'bg-rose-950/80 text-rose-400 border-rose-800',
    ACTIVE_SMC: 'bg-sky-950/80 text-sky-400 border-sky-800',
    LIVE_CONSENSUS_SIGNAL: 'bg-emerald-950 text-emerald-400 border-emerald-700',
    HOLD_AWAITING_CONFLUENCE: 'bg-amber-950/80 text-amber-400 border-amber-800',
    CALCULATING_SIGNALS: 'bg-sky-950/80 text-sky-400 border-sky-800',
    QUICK_SIGNAL: 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700',
    MTF_CONFLICT_HOLD: 'bg-amber-950/80 text-amber-400 border-amber-800',
    WARMING_UP: 'bg-amber-950/80 text-amber-400 border-amber-800',
    AWAITING_LIVE_TICKS: 'bg-amber-950/80 text-amber-400 border-amber-800',
    STREAMING_REAL_TICKS: 'bg-sky-950/80 text-sky-400 border-sky-800',
    SCANNING_MARKET: 'bg-sky-950/80 text-sky-400 border-sky-800',
    SAFE_HOLD_NEUTRAL_MARKET: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    HOLD_NEUTRAL_MARKET: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    COOLDOWN_HOLD: 'bg-amber-950/80 text-amber-400 border-amber-800'
  };

  const statusKey = signal.status || 'NO_SIGNAL';
  const statusBadgeClass = statusColors[statusKey] || 'bg-zinc-800 text-zinc-400 border-zinc-700';
  const statusDisplay = String(statusKey).replace(/_/g, ' ');

  const confidence = signal.confidence ?? 0;
  const upVotes = signal.upVotes ?? 0;
  const downVotes = signal.downVotes ?? 0;
  const holdVotes = signal.holdVotes ?? 0;
  const totalWorkers = signal.totalWorkers || (upVotes + downVotes + holdVotes) || 20;
  const cooldownRemaining = signal.cooldownRemaining ?? 0;
  const evidenceList = Array.isArray(signal.evidence) && signal.evidence.length > 0 
    ? signal.evidence 
    : ['Analyzing real-time order block flow and liquidity sweeps'];

  const roundData = signal.roundLevels;

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 font-mono relative overflow-hidden flex flex-col justify-between shadow-xl min-h-[340px]">
      {/* Background Glow */}
      <div
        className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isUp ? 'bg-emerald-500' : isDown ? 'bg-rose-500' : 'bg-zinc-500'
        }`}
      />

      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                <span>QUEEN FLY CONSENSUS</span>
                <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${statusBadgeClass}`}>
                  {statusDisplay}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500">20-Worker Reliability Weighted Decision</div>
            </div>
          </div>

          {/* Cooldown or Entry Alert */}
          {cooldownRemaining > 0 ? (
            <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400">
              <Timer className="w-3 h-3 animate-spin" />
              <span>{cooldownRemaining}s COOLDOWN</span>
            </div>
          ) : isEntryZone ? (
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-rose-950 border border-rose-700 text-rose-300 font-bold animate-pulse">
              <Zap className="w-3 h-3" />
              <span>ENTRY ZONE ({timeFormatted})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800/80 text-sky-300 font-semibold">
              <Clock className="w-3 h-3" />
              <span>EXPIRY: {timeFormatted}</span>
            </div>
          )}
        </div>

        {/* Hero Direction Banner with EXPLICIT NEXT CANDLE DIRECTION & TIMING */}
        <div
          className={`rounded-xl p-4 mb-3 border text-center transition-all ${
            isUp
              ? 'bg-gradient-to-b from-emerald-950/40 to-emerald-950/10 border-emerald-800/80 text-emerald-400'
              : isDown
              ? 'bg-gradient-to-b from-rose-950/40 to-rose-950/10 border-rose-800/80 text-rose-400'
              : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'
          }`}
        >
          <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
            <span>PREDICTION TARGET</span>
            <span className={`px-2 py-0.5 rounded font-bold ${isEntryZone ? 'bg-rose-900/80 text-rose-200 animate-pulse' : 'bg-zinc-800 text-sky-300'}`}>
              ⏱ M1 EXPIRY: {timeFormatted}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-black tracking-wider my-2">
            {isUp && <ArrowUpRight className="w-8 h-8 text-emerald-400 flex-shrink-0" />}
            {isDown && <ArrowDownRight className="w-8 h-8 text-rose-400 flex-shrink-0" />}
            {isHold && <Minus className="w-8 h-8 text-zinc-500 flex-shrink-0" />}
            <span>
              {isUp ? 'NEXT CANDLE: CALL ⬆ (UP)' : isDown ? 'NEXT CANDLE: PUT ⬇ (DOWN)' : 'NEXT CANDLE: HOLD ⏸ (WAIT)'}
            </span>
          </div>

          {/* Subtitle explaining entry point */}
          <div className="text-[11px] text-zinc-300 font-semibold mb-2">
            {isUp ? (
              <span className="text-emerald-300">Take 1-Minute CALL trade at candle open or pullback to support</span>
            ) : isDown ? (
              <span className="text-rose-300">Take 1-Minute PUT trade at candle open or rejection at resistance</span>
            ) : (
              <span className="text-zinc-400">Market choppy or balanced — Wait for clear breakout</span>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 pt-2 border-t border-zinc-800/60 text-xs">
            <div>
              <span className="text-zinc-500">Queen Confidence:</span>{' '}
              <strong className={isUp ? 'text-emerald-300' : isDown ? 'text-rose-300' : 'text-zinc-300'}>
                {Math.round(confidence * 100)}%
              </strong>
            </div>
            <div>
              <span className="text-zinc-500">Worker Agreement:</span>{' '}
              <strong className="text-zinc-200">
                {isUp ? upVotes : isDown ? downVotes : Math.max(upVotes, downVotes, holdVotes)} / {totalWorkers}
              </strong>
            </div>
          </div>
        </div>

        {/* OPTIMAL ROUND NUMBER ENTRY BOX (User Requested) */}
        {roundData && (
          <div className="mb-3 p-3 rounded-xl bg-zinc-900/90 border border-sky-900/60">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="flex items-center gap-1.5 font-bold text-sky-400">
                <Target className="w-3.5 h-3.5" />
                <span>OPTIMAL ROUND NUMBER ENTRY</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                {roundData.label}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-sm font-black text-emerald-400 font-mono">
                🎯 Level: {roundData.optimalRound}
              </div>
              <div className="text-[10px] text-zinc-400">
                Distance: <span className="text-zinc-200 font-bold">{roundData.pipsDiff} pips</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-800/80">
              <span>Support Round: <strong className="text-zinc-300 font-mono">{roundData.lowerRound}</strong></span>
              <span>Resistance Round: <strong className="text-zinc-300 font-mono">{roundData.upperRound}</strong></span>
            </div>
          </div>
        )}

        {/* Real-time Evidence Bullet Points */}
        <div className="space-y-1.5 mb-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Confluence Factors</div>
          <div className="space-y-1">
            {evidenceList.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-xs text-zinc-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0" />
                <span className="leading-tight">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Details */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>Asset: <strong className="text-zinc-300">{signal.asset}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>Expiry: <strong className="text-zinc-300">1 MIN OTC ({timeFormatted})</strong></span>
        </div>
      </div>
    </div>
  );
};
