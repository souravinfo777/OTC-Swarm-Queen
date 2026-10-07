import React from 'react';
import { WorkerFly } from '../types/swarm';
import { ArrowUpRight, ArrowDownRight, Minus, Heart, Dna, Trophy, AlertOctagon } from 'lucide-react';

interface WorkerCardProps {
  worker: WorkerFly;
  onSelectWorker: (worker: WorkerFly) => void;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({ worker, onSelectWorker }) => {
  // No fabricated defaults — missing metrics read as 0, never as a fake track record.
  const health = worker?.health ?? 0;
  const fitness = worker?.fitness ?? 0;
  const winRate = worker?.winRate ?? 0;
  const wins = worker?.wins ?? 0;
  const losses = worker?.losses ?? 0;
  const status = worker?.status ?? 'ACTIVE';
  const generation = worker?.generation ?? 1;

  const getHealthColor = (hp: number) => {
    if (hp >= 70) return 'text-emerald-400 bg-emerald-500';
    if (hp >= 35) return 'text-amber-400 bg-amber-500';
    return 'text-rose-400 bg-rose-500';
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';
      case 'WEAK':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/80';
      case 'DEAD':
        return 'bg-rose-950 text-rose-400 border-rose-800';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const rawDecision = (worker as any)?.vote || worker?.lastDecision?.decision || 'HOLD';
  const decision = rawDecision === 'CALL' || rawDecision === 'UP' ? 'UP' : rawDecision === 'PUT' || rawDecision === 'DOWN' ? 'DOWN' : 'HOLD';
  const confidence = (worker as any)?.confidence || worker?.lastDecision?.confidence || 0.70;

  return (
    <div
      onClick={() => onSelectWorker(worker)}
      className="bg-zinc-950/90 border border-zinc-800/80 hover:border-sky-500/60 transition-all rounded-xl p-3 font-mono cursor-pointer flex flex-col justify-between group shadow-md"
    >
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-zinc-200 text-xs">
              Fly #{String(worker?.id || 1).padStart(2, '0')}
            </span>
            <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1 rounded border border-zinc-800">
              Gen {generation}
            </span>
          </div>
          <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold ${getStatusBadge(status)}`}>
            {status}
          </span>
        </div>

        {/* Health Bar */}
        <div className="mb-2.5">
          <div className="flex justify-between items-center text-[10px] mb-1">
            <span className="text-zinc-500 flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-500" /> Health:
            </span>
            <span className={`font-bold ${getHealthColor(health).split(' ')[0]}`}>
              {Math.round(health)}/100
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800/60">
            <div
              style={{ width: `${Math.max(0, Math.min(100, health))}%` }}
              className={`h-full transition-all duration-300 ${getHealthColor(health).split(' ')[1]}`}
            />
          </div>
        </div>

        {/* Decision Badge */}
        <div
          className={`rounded-lg p-2 flex items-center justify-between border mb-2 text-xs font-bold ${
            decision === 'UP'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
              : decision === 'DOWN'
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-400'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {decision === 'UP' && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
            {decision === 'DOWN' && <ArrowDownRight className="w-4 h-4 text-rose-400" />}
            {decision === 'HOLD' && <Minus className="w-4 h-4 text-zinc-500" />}
            <span>{decision === 'UP' ? 'CALL' : decision === 'DOWN' ? 'PUT' : 'HOLD'}</span>
          </div>
          <span className="text-[10px] font-normal opacity-80">
            {Math.round(confidence * 100)}% conf
          </span>
        </div>
      </div>

      {/* Fitness & Win Rate Footer */}
      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
        <div className="flex items-center gap-1" title="Bayesian smoothed fitness">
          <Trophy className="w-3 h-3 text-amber-400" />
          <span>Fit: <strong className="text-zinc-200">{fitness.toFixed(2)}</strong></span>
        </div>
        <div title="Win / Total">
          <span>WR: <strong className="text-sky-400">{Math.round(winRate * 100)}%</strong> ({wins}/{wins + losses})</span>
        </div>
      </div>
    </div>
  );
};
