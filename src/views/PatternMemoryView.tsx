import React from 'react';
import { PatternMemoryItem } from '../types/swarm';
import { Brain, Award, Star, CheckCircle, TrendingUp } from 'lucide-react';

interface PatternMemoryViewProps {
  patterns: PatternMemoryItem[];
}

export const PatternMemoryView: React.FC<PatternMemoryViewProps> = ({ patterns }) => {
  // Sort patterns by win rate descending
  const sorted = [...patterns].sort((a, b) => b.winRate - a.winRate);

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">
              PATTERN MEMORY — HIGH-CONFLUENCE SMC KNOWLEDGE BASE
            </div>
            <div className="text-xs text-zinc-400">
              Catalog of proven multi-factor SMC setup signatures and historical win rates across OTC assets
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500">Indexed Patterns:</span>{' '}
          <strong className="text-emerald-400 font-bold">{patterns.length}</strong>
        </div>
      </div>

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.length > 0 ? (
          sorted.map((p, idx) => {
            const signatureElements = p.signature.split('+');
            const isHighWin = p.winRate >= 0.65;
            return (
              <div
                key={idx}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-md hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>Signature #{idx + 1}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {p.preferredRegime}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Sample Size: {p.occurrences} Occurrences ({p.wins}W / {p.losses}L)
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-xl font-black ${
                        isHighWin ? 'text-emerald-400' : 'text-sky-400'
                      }`}
                    >
                      {Math.round(p.winRate * 100)}%
                    </div>
                    <div className="text-[10px] text-zinc-500">Win Rate</div>
                  </div>
                </div>

                {/* Evidence Confluence Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {signatureElements.map((elem, eIdx) => (
                    <span
                      key={eIdx}
                      className="px-2 py-0.5 rounded text-[10px] bg-zinc-900 border border-zinc-800 text-sky-300 font-medium"
                    >
                      {elem}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-2 py-10 text-center text-zinc-500 text-xs bg-zinc-950 border border-zinc-800 rounded-xl">
            Pattern memory is training. As paper trades settle, profitable confluence signatures will automatically be indexed here.
          </div>
        )}
      </div>
    </div>
  );
};
