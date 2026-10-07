import React, { useState, useMemo } from 'react';
import { WorkerFly, QueenSignal } from '../types/swarm';
import {
  Flame,
  Award,
  RefreshCcw,
  Zap,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Dna,
  ArrowUpDown,
  Filter
} from 'lucide-react';

interface WorkerEfficiencyHeatmapProps {
  workers: WorkerFly[];
  queenSignal?: QueenSignal | null;
  onSelectWorker?: (worker: WorkerFly) => void;
}

type HeatmapMetricMode = 'COMPOSITE' | 'CONSENSUS' | 'REPLACEMENTS' | 'HEALTH';
type SortMode = 'ID' | 'EFFICIENCY' | 'CONSENSUS' | 'REPLACEMENTS';
type FilterMode = 'ALL' | 'TOP_CONTRIBUTORS' | 'HIGH_CHURN';

export const WorkerEfficiencyHeatmap: React.FC<WorkerEfficiencyHeatmapProps> = ({
  workers,
  queenSignal,
  onSelectWorker
}) => {
  const [metricMode, setMetricMode] = useState<HeatmapMetricMode>('COMPOSITE');
  const [sortMode, setSortMode] = useState<SortMode>('ID');
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [inspectWorker, setInspectWorker] = useState<WorkerFly | null>(null);

  // Summary Metrics
  const summary = useMemo(() => {
    if (!workers.length) return null;
    const avgConsensus =
      workers.reduce((acc, w) => acc + (w.consensusRate || 0.5), 0) / workers.length;
    const avgEfficiency =
      workers.reduce((acc, w) => acc + (w.efficiencyScore || 50), 0) / workers.length;
    const totalReplacements = workers.reduce((acc, w) => acc + (w.replacementCount || 0), 0);
    const veteranCount = workers.filter((w) => (w.replacementCount || 0) === 0).length;
    const highChurnCount = workers.filter((w) => (w.replacementCount || 0) >= 2).length;

    // Top 3 Consensus Contributors
    const topContributors = [...workers]
      .sort((a, b) => (b.consensusRate || 0) - (a.consensusRate || 0))
      .slice(0, 3);

    // High Churn Watchlist (Highest replacement count)
    const highChurn = [...workers]
      .filter((w) => (w.replacementCount || 0) > 0)
      .sort((a, b) => (b.replacementCount || 0) - (a.replacementCount || 0))
      .slice(0, 3);

    return {
      avgConsensus,
      avgEfficiency,
      totalReplacements,
      veteranCount,
      highChurnCount,
      topContributors,
      highChurn
    };
  }, [workers]);

  // Filtered and Sorted Workers
  const processedWorkers = useMemo(() => {
    let list = [...workers];

    // Filter
    if (filterMode === 'TOP_CONTRIBUTORS') {
      list = list.filter((w) => (w.consensusRate || 0) >= 0.65);
    } else if (filterMode === 'HIGH_CHURN') {
      list = list.filter((w) => (w.replacementCount || 0) >= 1 || w.health < 40);
    }

    // Sort
    if (sortMode === 'EFFICIENCY') {
      list.sort((a, b) => (b.efficiencyScore || 0) - (a.efficiencyScore || 0));
    } else if (sortMode === 'CONSENSUS') {
      list.sort((a, b) => (b.consensusRate || 0) - (a.consensusRate || 0));
    } else if (sortMode === 'REPLACEMENTS') {
      list.sort((a, b) => (b.replacementCount || 0) - (a.replacementCount || 0));
    } else {
      list.sort((a, b) => a.id - b.id);
    }

    return list;
  }, [workers, filterMode, sortMode]);

  // Heat styling calculation based on chosen metric
  const getHeatDetails = (w: WorkerFly) => {
    const consensusPct = Math.round((w.consensusRate || 0.5) * 100);
    const replacements = w.replacementCount || 0;
    const eff = w.efficiencyScore || 50;
    const hp = Math.round(w.health);

    if (metricMode === 'CONSENSUS') {
      // High consensus = emerald, low = rose
      if (consensusPct >= 75) {
        return {
          bg: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/70',
          glow: 'from-emerald-500/20 to-emerald-500/5',
          text: 'text-emerald-400',
          barColor: 'bg-emerald-400',
          valDisplay: `${consensusPct}%`,
          valLabel: 'Consensus Rate',
          barPct: consensusPct,
          tier: 'CONSENSUS PILLAR'
        };
      }
      if (consensusPct >= 60) {
        return {
          bg: 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-500/60',
          glow: 'from-sky-500/20 to-sky-500/5',
          text: 'text-sky-400',
          barColor: 'bg-sky-400',
          valDisplay: `${consensusPct}%`,
          valLabel: 'Consensus Rate',
          barPct: consensusPct,
          tier: 'STABLE ALIGNED'
        };
      }
      if (consensusPct >= 45) {
        return {
          bg: 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/60',
          glow: 'from-amber-500/20 to-amber-500/5',
          text: 'text-amber-400',
          barColor: 'bg-amber-400',
          valDisplay: `${consensusPct}%`,
          valLabel: 'Consensus Rate',
          barPct: consensusPct,
          tier: 'DIVERGENT'
        };
      }
      return {
        bg: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-500/70',
        glow: 'from-rose-500/20 to-rose-500/5',
        text: 'text-rose-400',
        barColor: 'bg-rose-400',
        valDisplay: `${consensusPct}%`,
        valLabel: 'Consensus Rate',
        barPct: consensusPct,
        tier: 'CONTRARIAN DISSENT'
      };
    }

    if (metricMode === 'REPLACEMENTS') {
      // High replacements (churn) = glowing crimson/rose, 0 replacements = emerald veteran
      if (replacements === 0) {
        return {
          bg: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/70',
          glow: 'from-emerald-500/20 to-emerald-500/5',
          text: 'text-emerald-400',
          barColor: 'bg-emerald-400',
          valDisplay: '0 Rebirths',
          valLabel: 'Gen 1 Veteran Survivor',
          barPct: 100,
          tier: 'ZERO REPLACEMENTS'
        };
      }
      if (replacements === 1) {
        return {
          bg: 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-500/60',
          glow: 'from-sky-500/20 to-sky-500/5',
          text: 'text-sky-400',
          barColor: 'bg-sky-400',
          valDisplay: '1 Rebirth',
          valLabel: 'Gen 2 Re-evolved',
          barPct: 70,
          tier: 'LOW CHURN'
        };
      }
      if (replacements === 2) {
        return {
          bg: 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/60',
          glow: 'from-amber-500/20 to-amber-500/5',
          text: 'text-amber-400',
          barColor: 'bg-amber-400',
          valDisplay: `${replacements} Rebirths`,
          valLabel: `Gen ${w.generation} Replaced`,
          barPct: 40,
          tier: 'MODERATE CHURN'
        };
      }
      return {
        bg: 'bg-rose-950/50 hover:bg-rose-900/60 border-rose-500/80 animate-pulse',
        glow: 'from-rose-500/30 to-rose-500/10',
        text: 'text-rose-400',
        barColor: 'bg-rose-500',
        valDisplay: `${replacements} Rebirths`,
        valLabel: `Gen ${w.generation} High Churn`,
        barPct: 20,
        tier: 'FREQUENT TURNOVER'
      };
    }

    if (metricMode === 'HEALTH') {
      if (hp >= 70) {
        return {
          bg: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/70',
          glow: 'from-emerald-500/20 to-emerald-500/5',
          text: 'text-emerald-400',
          barColor: 'bg-emerald-400',
          valDisplay: `${hp}/100`,
          valLabel: 'Health Capacity',
          barPct: hp,
          tier: 'ROBUST HEALTH'
        };
      }
      if (hp >= 40) {
        return {
          bg: 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/60',
          glow: 'from-amber-500/20 to-amber-500/5',
          text: 'text-amber-400',
          barColor: 'bg-amber-400',
          valDisplay: `${hp}/100`,
          valLabel: 'Health Capacity',
          barPct: hp,
          tier: 'VULNERABLE'
        };
      }
      return {
        bg: 'bg-rose-950/50 hover:bg-rose-900/60 border-rose-500/80 animate-pulse',
        glow: 'from-rose-500/30 to-rose-500/10',
        text: 'text-rose-400',
        barColor: 'bg-rose-500',
        valDisplay: `${hp}/100`,
        valLabel: 'Critical Health',
        barPct: hp,
        tier: 'REBIRTH THREAT'
      };
    }

    // Default COMPOSITE Efficiency
    if (eff >= 75) {
      return {
        bg: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/70',
        glow: 'from-emerald-500/20 to-emerald-500/5',
        text: 'text-emerald-400',
        barColor: 'bg-emerald-400',
        valDisplay: `${eff}`,
        valLabel: 'Efficiency Index',
        barPct: eff,
        tier: 'ELITE PILLAR'
      };
    }
    if (eff >= 55) {
      return {
        bg: 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-500/60',
        glow: 'from-sky-500/20 to-sky-500/5',
        text: 'text-sky-400',
        barColor: 'bg-sky-400',
        valDisplay: `${eff}`,
        valLabel: 'Efficiency Index',
        barPct: eff,
        tier: 'STEADY PERFORMER'
      };
    }
    if (eff >= 38) {
      return {
        bg: 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/60',
        glow: 'from-amber-500/20 to-amber-500/5',
        text: 'text-amber-400',
        barColor: 'bg-amber-400',
        valDisplay: `${eff}`,
        valLabel: 'Efficiency Index',
        barPct: eff,
        tier: 'MARGINAL'
      };
    }
    return {
      bg: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-500/70',
      glow: 'from-rose-500/20 to-rose-500/5',
      text: 'text-rose-400',
      barColor: 'bg-rose-500',
      valDisplay: `${eff}`,
      valLabel: 'Efficiency Index',
      barPct: eff,
      tier: 'HIGH CHURN / AT RISK'
    };
  };

  const currentQueenDir = queenSignal?.direction || 'HOLD';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono space-y-4 shadow-xl">
      {/* Heatmap Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span>WORKER EFFICIENCY HEATMAP</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                20-AGENT POPULATION
              </span>
            </div>
            <div className="text-xs text-zinc-400">
              Visualizes which workers consistently anchor Queen consensus vs. those suffering high replacement churn
            </div>
          </div>
        </div>

        {/* View Controls: Metric Mode, Sort, Filter */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Metric Selector */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            {(
              [
                { id: 'COMPOSITE', label: 'Composite' },
                { id: 'CONSENSUS', label: 'Consensus Rate' },
                { id: 'REPLACEMENTS', label: 'Re-evolutions' },
                { id: 'HEALTH', label: 'Health' }
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMetricMode(m.id)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  metricMode === m.id
                    ? 'bg-zinc-800 text-sky-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="ID">Sort: ID (1-20)</option>
              <option value="EFFICIENCY">Sort: Highest Efficiency</option>
              <option value="CONSENSUS">Sort: Top Consensus</option>
              <option value="REPLACEMENTS">Sort: Most Re-evolved</option>
            </select>
          </div>

          {/* Filter Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-400">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Show: All 20</option>
              <option value="TOP_CONTRIBUTORS">Top Consensus (&gt;=65%)</option>
              <option value="HIGH_CHURN">High Churn / At-Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>Consensus Alignment</span>
            </div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {Math.round(summary.avgConsensus * 100)}%
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Swarm average agreement with Queen
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              <span>Swarm Efficiency Index</span>
            </div>
            <div className="text-base font-bold text-sky-400 mt-0.5">
              {Math.round(summary.avgEfficiency)} / 100
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Composite Bayesian performance
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Veterans (Gen 1)</span>
            </div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              {summary.veteranCount} / 20
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Zero deaths since genesis
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <RefreshCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Total Re-evolutions</span>
            </div>
            <div className="text-base font-bold text-rose-400 mt-0.5">
              {summary.totalReplacements} Rebirths
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              {summary.highChurnCount} workers with &gt;=2 replacements
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/40 px-3 py-1.5 rounded-lg border border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-300">Heatmap Intensity:</span>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-500" />
            <span>High Consensus / Core Pillar</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <span className="w-3 h-3 rounded bg-sky-500" />
            <span>Steady Alignment</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <span className="w-3 h-3 rounded bg-amber-500" />
            <span>Moderate / Divergent</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <span className="w-3 h-3 rounded bg-rose-500" />
            <span>High Churn / Frequently Re-evolved</span>
          </div>
        </div>

        <div className="text-[10px] text-zinc-500">
          Showing {processedWorkers.length} of {workers.length} Workers • Click card for DNA dossier
        </div>
      </div>

      {/* 20-Cell Heatmap Grid (4x5 or 5x4) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {processedWorkers.map((w) => {
          const heat = getHeatDetails(w);
          const lastDec = w.lastDecision?.decision || 'HOLD';
          const agreedWithQueen =
            currentQueenDir !== 'HOLD' && lastDec === currentQueenDir;
          const dissentedFromQueen =
            currentQueenDir !== 'HOLD' && lastDec !== 'HOLD' && lastDec !== currentQueenDir;

          return (
            <div
              key={w.id}
              onClick={() => {
                setInspectWorker(w);
                if (onSelectWorker) onSelectWorker(w);
              }}
              className={`p-3 rounded-xl border relative overflow-hidden cursor-pointer transition-all duration-200 group shadow-md ${heat.bg}`}
            >
              {/* Subtle Ambient Radial Glow */}
              <div
                className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${heat.glow} blur-xl pointer-events-none`}
              />

              <div className="relative z-10 space-y-2">
                {/* Header: ID, Gen, and Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-zinc-100 text-xs tracking-tight">
                      Fly #{String(w.id).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-[9px] px-1 rounded border font-semibold ${
                        (w.replacementCount || 0) === 0
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : (w.replacementCount || 0) === 1
                          ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      Gen {w.generation}
                    </span>
                  </div>

                  <span className="text-[9px] text-zinc-400 bg-zinc-900/80 px-1 py-0.5 rounded border border-zinc-800 truncate max-w-[70px]">
                    {w.archetype || 'Specialist'}
                  </span>
                </div>

                {/* Primary Heat Metric Display */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-xl font-black tracking-tight ${heat.text}`}>
                      {heat.valDisplay}
                    </span>
                    <span className="text-[9px] text-zinc-500 uppercase">{heat.valLabel}</span>
                  </div>

                  {/* Gradient Heat Bar */}
                  <div className="w-full bg-zinc-900/80 h-1.5 rounded-full overflow-hidden mt-1 border border-zinc-800/80">
                    <div
                      style={{ width: `${Math.max(5, Math.min(100, heat.barPct))}%` }}
                      className={`h-full transition-all duration-300 ${heat.barColor}`}
                    />
                  </div>
                </div>

                {/* Consensus & Churn Stats Pill Strip */}
                <div className="grid grid-cols-2 gap-1 text-[10px] pt-1 border-t border-zinc-800/60">
                  <div className="text-zinc-400">
                    <span className="text-zinc-500">Agreed:</span>{' '}
                    <strong className="text-zinc-200">
                      {Math.round((w.consensusRate || 0.5) * 100)}%
                    </strong>
                  </div>
                  <div className="text-zinc-400 text-right">
                    <span className="text-zinc-500">Rebirths:</span>{' '}
                    <strong
                      className={
                        (w.replacementCount || 0) >= 2
                          ? 'text-rose-400 font-bold'
                          : (w.replacementCount || 0) === 1
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }
                    >
                      {w.replacementCount || 0}
                    </strong>
                  </div>
                </div>

                {/* Recent Consensus Alignment Indicator */}
                <div className="flex items-center justify-between text-[10px] pt-1">
                  <span className="text-zinc-500">Vote: {lastDec}</span>
                  {currentQueenDir !== 'HOLD' && (
                    <span
                      className={`flex items-center gap-0.5 text-[9px] font-bold ${
                        agreedWithQueen
                          ? 'text-emerald-400'
                          : dissentedFromQueen
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {agreedWithQueen && <CheckCircle2 className="w-3 h-3" />}
                      {dissentedFromQueen && <XCircle className="w-3 h-3" />}
                      <span>{agreedWithQueen ? 'IN CONSENSUS' : dissentedFromQueen ? 'DISSENT' : 'NEUTRAL'}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deep Inspection Drawer / Modal */}
      {inspectWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-mono">
            {/* Modal Header */}
            <div className="bg-zinc-900 px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
                  <Dna className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base text-zinc-100 flex items-center gap-2">
                    <span>Fly #{String(inspectWorker.id).padStart(2, '0')}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-sky-400 border border-zinc-700">
                      {inspectWorker.archetype || 'Specialist'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Generation {inspectWorker.generation} • {inspectWorker.replacementCount || 0} Re-evolutions
                  </div>
                </div>
              </div>

              <button
                onClick={() => setInspectWorker(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Efficiency & Consensus Metrics */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Efficiency Score</div>
                  <div className="text-xl font-black text-sky-400 mt-0.5">
                    {inspectWorker.efficiencyScore || 50}
                  </div>
                </div>

                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Consensus Alignment</div>
                  <div className="text-xl font-black text-emerald-400 mt-0.5">
                    {Math.round((inspectWorker.consensusRate || 0.5) * 100)}%
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {inspectWorker.consensusVotes || 0} / {inspectWorker.totalVotes || 0}
                  </div>
                </div>

                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Re-evolutions</div>
                  <div
                    className={`text-xl font-black mt-0.5 ${
                      (inspectWorker.replacementCount || 0) >= 2
                        ? 'text-rose-400'
                        : 'text-zinc-200'
                    }`}
                  >
                    {inspectWorker.replacementCount || 0}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Gen {inspectWorker.generation}
                  </div>
                </div>
              </div>

              {/* Archetype Breakdown */}
              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                <div className="font-bold text-zinc-200 flex items-center justify-between">
                  <span>Archetype: {inspectWorker.archetype || 'Custom'}</span>
                  <span className="text-[10px] text-zinc-400">
                    Pref: {inspectWorker.dna.preferredRegime}
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  {(inspectWorker.replacementCount || 0) === 0
                    ? 'Veteran Survivor: This worker has sustained positive health and has never died or triggered re-evolution since genesis. Consistently aligns with the Queen Fly consensus.'
                    : `Replaced ${(inspectWorker.replacementCount || 0)} time(s): This fly suffered consecutive loss penalties, died, and was re-evolved via tournament selection and Gaussian mutation to adapt to the OTC regime.`}
                </p>
              </div>

              {/* SMC Gene Weights */}
              <div className="space-y-2">
                <div className="font-bold text-zinc-300 text-xs uppercase tracking-wider">
                  Genetic SMC Gene Weights
                </div>
                <div className="space-y-1 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 text-[11px]">
                  {[
                    { label: 'Liquidity Weight', val: inspectWorker.dna.liquidityWeight },
                    { label: 'Order Block Weight', val: inspectWorker.dna.orderBlockWeight },
                    { label: 'FVG Weight', val: inspectWorker.dna.fvgWeight },
                    { label: 'Structure / BOS Weight', val: inspectWorker.dna.structureWeight },
                    { label: 'Trend Alignment Weight', val: inspectWorker.dna.trendWeight },
                    { label: 'Min Confluence Threshold', val: inspectWorker.dna.minConfluence }
                  ].map((gene, idx) => (
                    <div key={idx} className="flex justify-between items-center py-0.5">
                      <span className="text-zinc-400">{gene.label}:</span>
                      <strong className="text-zinc-200">
                        {Math.round(gene.val * 100)}%
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
