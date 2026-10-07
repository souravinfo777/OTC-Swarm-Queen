import React from 'react';
import { GraveyardRecord } from '../types/swarm';
import { Skull, Dna, History, AlertTriangle, Flame } from 'lucide-react';

interface GraveyardViewProps {
  graveyard: GraveyardRecord[];
}

export const GraveyardView: React.FC<GraveyardViewProps> = ({ graveyard }) => {
  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rose-950 border border-rose-800 text-rose-400">
            <Skull className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">THE GRAVEYARD — FAILURE PATTERN MEMORY</div>
            <div className="text-xs text-zinc-400">
              Preserves extinct worker DNA and failure contexts to prevent repeating fatal trade decisions
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500">Deceased Records:</span>{' '}
          <strong className="text-rose-400 font-bold">{graveyard.length}</strong>{' '}
          <span className="text-zinc-500">/ 500 Max</span>
        </div>
      </div>

      {/* Graveyard Records List */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <span className="text-xs font-bold text-zinc-200">DECEASED STRATEGIES ARCHIVE</span>
          <span className="text-[10px] text-zinc-500">Sorted by most recent death</span>
        </div>

        {graveyard.length > 0 ? (
          <div className="space-y-2.5">
            {graveyard.map((g) => (
              <div
                key={g.recordId}
                className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 text-rose-400" />
                    <span className="font-bold text-zinc-200 text-sm">
                      Fly #{String(g.workerId).padStart(2, '0')} (Generation {g.generation})
                    </span>
                    <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.2 rounded">
                      {new Date(g.deathTimestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-zinc-400 text-[11px] flex flex-wrap items-center gap-3">
                    <span>
                      Final Fitness: <strong className="text-amber-400">{g.fitness.toFixed(3)}</strong>
                    </span>
                    <span>
                      Win Rate: <strong className="text-sky-400">{Math.round(g.winRate * 100)}%</strong> ({g.totalTrades} Trades)
                    </span>
                    <span>
                      Preferred: <strong className="text-zinc-300">{g.dna.preferredRegime}</strong>
                    </span>
                  </div>

                  {/* Failure Patterns */}
                  {g.failurePatterns.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-rose-400 font-semibold">Fatal Patterns:</span>
                      {g.failurePatterns.slice(0, 3).map((fp, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.2 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-900/60"
                        >
                          {fp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* DNA Snapshot */}
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 text-[11px] space-y-1 md:w-64">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                    DNA Weights at Death:
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-zinc-400">
                    <div>Liq: {(g.dna.liquidityWeight * 100).toFixed(0)}%</div>
                    <div>OB: {(g.dna.orderBlockWeight * 100).toFixed(0)}%</div>
                    <div>FVG: {(g.dna.fvgWeight * 100).toFixed(0)}%</div>
                    <div>BOS: {(g.dna.structureWeight * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-zinc-500 text-xs">
            The Graveyard is empty. All 20 Worker Flies are currently alive and active.
          </div>
        )}
      </div>
    </div>
  );
};
