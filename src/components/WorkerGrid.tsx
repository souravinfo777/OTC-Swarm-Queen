import React, { useState } from 'react';
import { WorkerFly } from '../types/swarm';
import { WorkerCard } from './WorkerCard';
import { Dna, X, Shield, Zap, AlertTriangle, Layers, Target } from 'lucide-react';

interface WorkerGridProps {
  workers: WorkerFly[];
}

export const WorkerGrid: React.FC<WorkerGridProps> = ({ workers }) => {
  const [selectedWorker, setSelectedWorker] = useState<WorkerFly | null>(null);

  const safeDna = selectedWorker?.dna || {
    version: 1,
    liquidityWeight: 0.85,
    orderBlockWeight: 0.90,
    fvgWeight: 0.75,
    structureWeight: 0.80,
    candleWeight: 0.70,
    trendWeight: 0.85,
    displacementWeight: 0.78,
    minConfluence: 0.65,
    preferredRegime: 'TRENDING',
    maxRiskScore: 0.35,
    confirmationRequired: true
  };

  return (
    <div className="space-y-3 font-mono">
      {/* 20 Workers Grid (4x5 or 5x4) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {(workers || []).map((w, idx) => (
          <WorkerCard
            key={w.id || idx + 1}
            worker={w}
            onSelectWorker={(worker) => setSelectedWorker(worker)}
          />
        ))}
      </div>

      {/* Deep Worker DNA Modal */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-zinc-900 px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
                  <Dna className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base text-zinc-100">
                    Worker Fly #{String(selectedWorker.id || 1).padStart(2, '0')} — DNA Dossier
                  </div>
                  <div className="text-xs text-zinc-400">
                    Generation {selectedWorker.generation || 1} • DNA v{safeDna.version} • Status: {selectedWorker.status || 'ACTIVE'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Health Rating</div>
                  <div className="text-xl font-black text-rose-400 mt-0.5">
                    {Math.round(selectedWorker.health ?? 0)} <span className="text-xs text-zinc-500">/ 100</span>
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Bayesian Fitness</div>
                  <div className="text-xl font-black text-amber-400 mt-0.5">
                    {(selectedWorker.fitness ?? 0).toFixed(3)}
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Win Ratio</div>
                  <div className="text-xl font-black text-sky-400 mt-0.5">
                    {Math.round((selectedWorker.winRate ?? 0) * 100)}%
                  </div>
                </div>
              </div>

              {/* DNA Gene Weight Sliders / Meters */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Genetic SMC Feature Weights
                </div>
                <div className="space-y-1.5 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/80">
                  {[
                    { label: 'Liquidity Hunter Weight', val: safeDna.liquidityWeight, color: 'bg-amber-500' },
                    { label: 'Order Block Bias', val: safeDna.orderBlockWeight, color: 'bg-emerald-500' },
                    { label: 'Fair Value Gap (FVG)', val: safeDna.fvgWeight, color: 'bg-sky-500' },
                    { label: 'Market Structure / BOS', val: safeDna.structureWeight, color: 'bg-indigo-500' },
                    { label: 'Candle Pattern Rejection', val: safeDna.candleWeight, color: 'bg-purple-500' },
                    { label: 'Macro Trend Alignment', val: safeDna.trendWeight, color: 'bg-blue-500' },
                    { label: 'Displacement Impulse Ratio', val: safeDna.displacementWeight, color: 'bg-pink-500' },
                    { label: 'Min Confluence Floor', val: safeDna.minConfluence, color: 'bg-teal-500' }
                  ].map((gene, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between text-zinc-400 mb-0.5">
                        <span>{gene.label}:</span>
                        <strong className="text-zinc-200">{((gene.val ?? 0) * 100).toFixed(0)}%</strong>
                      </div>
                      <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${(gene.val ?? 0) * 100}%` }}
                          className={`h-full ${gene.color}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archetype Description */}
              <div className="bg-sky-950/20 border border-sky-900/40 p-3 rounded-xl text-xs text-sky-300">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-sky-400" />
                  <span>Agent Role: {selectedWorker.archetype || (selectedWorker as any).name || `Worker Fly #${selectedWorker.id}`}</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Autonomous genetic worker fly dynamically weighting Order Blocks, Liquidity Sweeps, and Supertrend Momentum with Bayesian survival.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
