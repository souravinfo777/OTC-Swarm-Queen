import React from 'react';
import { QueenSignal, WorkerFly, PaperStatistics } from '../types/swarm';
import { Crown, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Scale } from 'lucide-react';

interface QueenViewProps {
  queenSignal: QueenSignal | null;
  workers: WorkerFly[];
  paperStats: PaperStatistics;
  minTradesForValidation: number;
}

export const QueenView: React.FC<QueenViewProps> = ({
  queenSignal,
  workers,
  paperStats,
  minTradesForValidation
}) => {
  const isUp = queenSignal?.direction === 'UP';
  const isDown = queenSignal?.direction === 'DOWN';
  const isHold = queenSignal?.direction === 'HOLD';

  // Criteria validation checks
  const criteria = [
    {
      label: 'Consensus Threshold (>= 60% of workers)',
      met: (queenSignal?.consensus || 0) >= 0.60,
      current: `${Math.round((queenSignal?.consensus || 0) * 100)}%`
    },
    {
      label: 'Minimum Queen Confidence (>= 70%)',
      met: (queenSignal?.confidence || 0) >= 0.70,
      current: `${Math.round((queenSignal?.confidence || 0) * 100)}%`
    },
    {
      label: 'Signal Cooldown Inactive',
      met: (queenSignal?.cooldownRemaining || 0) === 0,
      current: queenSignal?.cooldownRemaining ? `${queenSignal.cooldownRemaining}s left` : 'READY'
    },
    {
      label: `Paper Trade Sample Size (>= ${minTradesForValidation} trades)`,
      met: paperStats.totalTrades >= minTradesForValidation,
      current: `${paperStats.totalTrades} / ${minTradesForValidation}`
    },
    {
      label: 'Stable Win Rate Floor (>= 60%)',
      met: paperStats.winRate >= 0.60 && paperStats.totalTrades >= 20,
      current: `${Math.round(paperStats.winRate * 100)}%`
    }
  ];

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Queen Master Status */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-950 border border-sky-800 text-sky-400">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <div className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <span>QUEEN FLY ARBITRATION & CONSENSUS ENGINE</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                {queenSignal?.status || 'NO_SIGNAL'}
              </span>
            </div>
            <div className="text-xs text-zinc-400">
              Aggregates 20 Worker Flies with health-weighted Bayesian reliability arbitration
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase">Queen Consensus</div>
            <div className="text-2xl font-black text-sky-400">
              {Math.round((queenSignal?.consensus || 0) * 100)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase">Signal Confidence</div>
            <div className="text-2xl font-black text-emerald-400">
              {Math.round((queenSignal?.confidence || 0) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Criteria Checklist & Worker Reliability Weights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Validation Criteria Checklist */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-zinc-200">
              VALIDATION GATING CRITERIA (Rule 23 & 25)
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            To prevent statistical overconfidence, Queen Fly requires strict reliability consensus
            and at least {minTradesForValidation} paper trades before qualifying for VALIDATED status.
          </p>

          <div className="space-y-2 pt-2">
            {criteria.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs"
              >
                <div className="flex items-center gap-2">
                  {c.met ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span className={c.met ? 'text-zinc-200 font-semibold' : 'text-zinc-400'}>
                    {c.label}
                  </span>
                </div>
                <span className={`font-bold ${c.met ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {c.current}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Worker Reliability Weighting */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
            <Scale className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-zinc-200">
              WORKER RELIABILITY VOTE WEIGHTS
            </span>
          </div>

          <div className="space-y-1.5 max-h-[310px] overflow-y-auto">
            {workers.map((w) => {
              const weight = w.fitness * 0.6 + (w.health / 100) * 0.4;
              const dec = w.lastDecision?.decision || 'HOLD';
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-2 rounded bg-zinc-900/40 border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-300">Fly #{String(w.id).padStart(2, '0')}</span>
                    <span className="text-[10px] text-zinc-500">HP: {Math.round(w.health)}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        dec === 'UP'
                          ? 'bg-emerald-950 text-emerald-400'
                          : dec === 'DOWN'
                          ? 'bg-rose-950 text-rose-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {dec}
                    </span>
                    <span className="text-zinc-300 font-bold">
                      Weight: {(weight * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
