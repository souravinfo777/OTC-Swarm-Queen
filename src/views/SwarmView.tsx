import React from 'react';
import { WorkerFly, QueenSignal } from '../types/swarm';
import { Users, Dna, Trophy, Heart, Activity, AlertOctagon, Flame } from 'lucide-react';
import { WorkerEfficiencyHeatmap } from '../components/WorkerEfficiencyHeatmap';

interface SwarmViewProps {
  workers: WorkerFly[];
  queenSignal?: QueenSignal | null;
}

export const SwarmView: React.FC<SwarmViewProps> = ({ workers, queenSignal }) => {
  const activeCount = workers.filter((w) => w.status === 'ACTIVE').length;
  const weakCount = workers.filter((w) => w.status === 'WEAK').length;
  const deadCount = workers.filter((w) => w.status === 'DEAD').length;
  const avgHealth = workers.reduce((a, b) => a + b.health, 0) / workers.length || 0;
  const avgFitness = workers.reduce((a, b) => a + b.fitness, 0) / workers.length || 0;
  const totalRebirths = workers.reduce((a, b) => a + (b.replacementCount || 0), 0);

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span>20-WORKER GENETIC SWARM ARBITRATION MATRIX</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800">
                ACTIVE
              </span>
            </div>
            <div className="text-xs text-zinc-400">
              Evolutionary swarm intelligence: health decay, tournament selection, consensus contribution, and adaptive rebirth
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-zinc-500">Active:</span>{' '}
            <strong className="text-emerald-400">{activeCount}</strong>
          </div>
          <div>
            <span className="text-zinc-500">Weak:</span>{' '}
            <strong className="text-amber-400">{weakCount}</strong>
          </div>
          <div>
            <span className="text-zinc-500">Total Re-evolutions:</span>{' '}
            <strong className="text-rose-400">{totalRebirths}</strong>
          </div>
          <div>
            <span className="text-zinc-500">Avg Fitness:</span>{' '}
            <strong className="text-sky-400">{avgFitness.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Worker Efficiency Heatmap Section */}
      <WorkerEfficiencyHeatmap
        workers={workers}
        queenSignal={queenSignal}
      />

      {/* 20 Workers Complete Table */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Dna className="w-4 h-4 text-sky-400" />
            <span>Worker Gene Weights & Efficiency Dossier</span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Complete parameter matrix for all 20 agents
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800 text-[11px]">
                <th className="py-2.5">Fly ID</th>
                <th className="py-2.5">Archetype</th>
                <th className="py-2.5">Gen</th>
                <th className="py-2.5">Rebirths</th>
                <th className="py-2.5">Efficiency</th>
                <th className="py-2.5">Consensus %</th>
                <th className="py-2.5">Health</th>
                <th className="py-2.5">Fitness</th>
                <th className="py-2.5">Win Rate</th>
                <th className="py-2.5">Last Vote</th>
                <th className="py-2.5">Liquidity</th>
                <th className="py-2.5">OB</th>
                <th className="py-2.5">FVG</th>
                <th className="py-2.5">Structure</th>
                <th className="py-2.5">Min Conf</th>
                <th className="py-2.5">Regime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {workers.map((w) => {
                const dec = w.lastDecision?.decision || 'HOLD';
                const consensusPct = Math.round((w.consensusRate || 0.5) * 100);
                const replacements = w.replacementCount || 0;
                return (
                  <tr key={w.id} className="hover:bg-zinc-900/50">
                    <td className="py-2.5 font-bold text-zinc-200">
                      #{String(w.id).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 text-zinc-300 font-medium truncate max-w-[110px]">
                      {w.archetype || 'Specialist'}
                    </td>
                    <td className="py-2.5 text-zinc-400">Gen {w.generation}</td>
                    <td className="py-2.5">
                      <span
                        className={`font-semibold ${
                          replacements >= 2
                            ? 'text-rose-400'
                            : replacements === 1
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {replacements}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          (w.efficiencyScore || 50) >= 70
                            ? 'bg-emerald-950 text-emerald-400'
                            : (w.efficiencyScore || 50) >= 45
                            ? 'bg-sky-950 text-sky-400'
                            : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {w.efficiencyScore || 50}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold text-emerald-400">
                      {consensusPct}%
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`font-bold ${
                          w.health >= 70
                            ? 'text-emerald-400'
                            : w.health >= 35
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {Math.round(w.health)}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold text-amber-400">
                      {w.fitness.toFixed(3)}
                    </td>
                    <td className="py-2.5 text-sky-400 font-bold">
                      {Math.round(w.winRate * 100)}%
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          dec === 'UP'
                            ? 'bg-emerald-950 text-emerald-400'
                            : dec === 'DOWN'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {dec}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-400">{(w.dna.liquidityWeight * 100).toFixed(0)}%</td>
                    <td className="py-2.5 text-zinc-400">{(w.dna.orderBlockWeight * 100).toFixed(0)}%</td>
                    <td className="py-2.5 text-zinc-400">{(w.dna.fvgWeight * 100).toFixed(0)}%</td>
                    <td className="py-2.5 text-zinc-400">{(w.dna.structureWeight * 100).toFixed(0)}%</td>
                    <td className="py-2.5 text-zinc-400">{(w.dna.minConfluence * 100).toFixed(0)}%</td>
                    <td className="py-2.5 text-sky-400 font-medium">{w.dna.preferredRegime}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
