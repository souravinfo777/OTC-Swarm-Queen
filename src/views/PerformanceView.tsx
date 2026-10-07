import React from 'react';
import { PaperStatistics, PaperTrade } from '../types/swarm';
import { BarChart3, TrendingUp, ShieldAlert, Award, Activity } from 'lucide-react';

interface PerformanceViewProps {
  stats: PaperStatistics;
  trades: PaperTrade[];
  minTradesForValidation: number;
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({
  stats,
  trades,
  minTradesForValidation
}) => {
  // Regime breakdown — include every regime classifyRegime can produce, otherwise
  // LOW_VOLATILITY / UNCERTAIN trades vanish from the table while still counting
  // toward the headline stats.
  const regimes = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNCERTAIN'];
  const regimeStats = regimes.map((r) => {
    const subset = trades.filter((t) => t.regime === r);
    const wins = subset.filter((t) => t.status === 'WIN').length;
    const losses = subset.filter((t) => t.status === 'LOSS').length;
    const rate = wins + losses > 0 ? wins / (wins + losses) : 0;
    return { regime: r, total: subset.length, wins, losses, winRate: rate };
  });

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">
              QUANTITATIVE PERFORMANCE & VALIDATION BENCHMARK
            </div>
            <div className="text-xs text-zinc-400">
              Rigorous out-of-sample Bayesian evaluation, rolling win rates, and regime breakdown
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500">Validation Progress:</span>{' '}
          <strong className="text-sky-400 font-bold">{stats.totalTrades}</strong>{' '}
          <span className="text-zinc-500">/ {minTradesForValidation} Trades</span>
        </div>
      </div>

      {/* 4 Cards: Win Rate, Net PnL, Rolling Windows, Streaks */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <div className="text-[10px] text-zinc-500 uppercase">Cumulative Win Rate</div>
          <div className="text-3xl font-black text-emerald-400 mt-1">
            {Math.round(stats.winRate * 100)}%
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Sample: {stats.wins} Wins, {stats.losses} Losses
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <div className="text-[10px] text-zinc-500 uppercase">Simulated Equity PnL</div>
          <div
            className={`text-3xl font-black mt-1 ${
              stats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stats.netPnl >= 0 ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Fixed $100 contracts (85% payout)</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <div className="text-[10px] text-zinc-500 uppercase">Rolling Windows (50 / 100 / 200)</div>
          <div className="text-lg font-bold text-sky-400 mt-1">
            {Math.round(stats.rolling50 * 100)}% / {Math.round(stats.rolling100 * 100)}% / {Math.round(stats.rolling200 * 100)}%
          </div>
          <div className="text-xs text-zinc-400 mt-1">Recency-weighted stability</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <div className="text-[10px] text-zinc-500 uppercase">Streak Distribution</div>
          <div className="text-lg font-bold text-zinc-200 mt-1">
            <span className="text-emerald-400">Max Win: {stats.longestWinStreak}</span> |{' '}
            <span className="text-rose-400">Max Loss: {stats.longestLossStreak}</span>
          </div>
          <div className="text-xs text-zinc-400 mt-1">Current: {stats.currentStreak}</div>
        </div>
      </div>

      {/* Regime Performance Breakdown Table */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
          Market Regime Breakdown
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800 text-[11px]">
                <th className="py-2.5">Regime</th>
                <th className="py-2.5">Trades</th>
                <th className="py-2.5">Wins</th>
                <th className="py-2.5">Losses</th>
                <th className="py-2.5">Win Rate</th>
                <th className="py-2.5">Performance Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {regimeStats.map((rs, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40">
                  <td className="py-2.5 font-bold text-zinc-200">{rs.regime}</td>
                  <td className="py-2.5 text-zinc-400">{rs.total}</td>
                  <td className="py-2.5 text-emerald-400 font-semibold">{rs.wins}</td>
                  <td className="py-2.5 text-rose-400 font-semibold">{rs.losses}</td>
                  <td className="py-2.5 text-sky-400 font-bold">
                    {Math.round(rs.winRate * 100)}%
                  </td>
                  <td className="py-2.5 w-48">
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${rs.winRate * 100}%` }}
                        className={`h-full ${
                          rs.winRate >= 0.60
                            ? 'bg-emerald-500'
                            : rs.winRate >= 0.50
                            ? 'bg-sky-500'
                            : 'bg-rose-500'
                        }`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
