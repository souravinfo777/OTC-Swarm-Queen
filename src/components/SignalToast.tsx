import React from 'react';
import { ArrowUpRight, ArrowDownRight, X, Crown, Radio, Timer } from 'lucide-react';

/**
 * A new-signal popup item. Raised the moment ANY pair produces a fresh directional
 * verdict (UP/DOWN) and auto-dismissed after ~4.5s — the pair name and the side
 * (CALL/UP or PUT/DOWN) are always the two most prominent things on the card.
 */
export interface SignalToastItem {
  id: string;
  asset: string;
  side: 'UP' | 'DOWN';
  label: string;        // "CALL (UP)" | "PUT (DOWN)"
  confidence: number;   // 0..1
  power: number;        // 0..1
  votes: number;        // agreeing workers
  totalWorkers: number;
  source: string;       // QUOTEX_LIVE | SWARM_QUEEN
  expiryTimer?: string;
  createdAt: number;
}

interface SignalToastProps {
  toasts: SignalToastItem[];
  onDismiss: (id: string) => void;
}

export const SignalToast: React.FC<SignalToastProps> = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="fixed top-24 right-3 z-[90] flex flex-col gap-2 w-[286px] pointer-events-none select-none"
      aria-live="polite"
      aria-label="New signal alerts"
    >
      {toasts.map((t) => {
        const isUp = t.side === 'UP';
        const accent = isUp ? 'text-emerald-400' : 'text-rose-400';
        const border = isUp ? 'border-emerald-600/80' : 'border-rose-600/80';
        const bar = isUp ? 'bg-emerald-400' : 'bg-rose-400';
        const conf = Math.round((t.confidence || 0) * 100);
        const power = Math.round((t.power || 0) * 100);

        return (
          <div
            key={t.id}
            className={`sq-toast pointer-events-auto bg-zinc-950/95 backdrop-blur border ${border} border-l-4 rounded-xl shadow-2xl shadow-black/60 font-mono overflow-hidden`}
          >
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between text-[9px] tracking-wider text-zinc-400 font-bold">
                <span className="flex items-center gap-1.5">
                  {t.source === 'SWARM_QUEEN' ? (
                    <Crown className="w-3 h-3 text-amber-400" />
                  ) : (
                    <Radio className="w-3 h-3 text-sky-400" />
                  )}
                  <span>🚨 NEW SIGNAL · {t.source === 'SWARM_QUEEN' ? 'QUEEN ENGINE' : 'QUOTEX LIVE'}</span>
                </span>
                <button
                  onClick={() => onDismiss(t.id)}
                  title="Dismiss"
                  className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-baseline gap-2 mt-1.5">
                <span className={`flex items-center gap-1 text-sm font-black ${accent}`}>
                  {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{t.label}</span>
                </span>
                <span className="text-xs font-bold text-zinc-100 truncate">{t.asset}</span>
              </div>

              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-300">
                <span>
                  Conf <b className={accent}>{conf}%</b>
                </span>
                <span className="text-zinc-600">·</span>
                <span>
                  Pwr <b className="text-zinc-100">{power}%</b>
                </span>
                <span className="text-zinc-600">·</span>
                <span>
                  <b className="text-zinc-100">{t.votes}</b>/{t.totalWorkers} flies
                </span>
              </div>

              {t.expiryTimer && (
                <div className="flex items-center gap-1 mt-1 text-[9px] text-zinc-500">
                  <Timer className="w-3 h-3" />
                  <span>M1 candle closes in {t.expiryTimer}</span>
                </div>
              )}
            </div>

            {/* Auto-dismiss progress (4.5s, matches the .sq-toast animation) */}
            <div className="h-0.5 w-full bg-zinc-800/80">
              <div className={`sq-toast-bar h-full ${bar}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
