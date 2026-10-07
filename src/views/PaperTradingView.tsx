import React, { useState } from 'react';
import { PaperTrade, PaperStatistics } from '../types/swarm';
import { ScrollText, TrendingUp, TrendingDown, Download, CheckCircle2, XCircle, Minus } from 'lucide-react';

interface PaperTradingViewProps {
  trades: PaperTrade[];
  stats: PaperStatistics;
  currentPrice: number;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({
  trades,
  stats,
  currentPrice
}) => {
  const [filter, setFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');

  const filtered = trades.filter((t) => {
    if (filter === 'ALL') return true;
    return t.status === filter;
  });

  const exportCSV = () => {
    if (trades.length === 0) return;
    const headers = 'ID,Asset,Direction,EntryPrice,ExitPrice,Status,PnL,Timestamp\n';
    const rows = trades
      .map(
        (t) =>
          `${t.id},${t.asset},${t.direction},${t.entryPrice},${t.exitPrice || ''},${t.status},${t.pnl},${t.timestamp}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otc_swarm_paper_trades_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Total Settled</div>
          <div className="text-xl font-black text-zinc-100 mt-0.5">{stats.totalTrades}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{stats.wins}W / {stats.losses}L</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Global Win Rate</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">
            {Math.round(stats.winRate * 100)}%
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">Fixed 85% payout</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Simulated Net PnL</div>
          <div
            className={`text-xl font-black mt-0.5 ${
              stats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stats.netPnl >= 0 ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">$100 base stake</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Rolling 50 / 100</div>
          <div className="text-base font-bold text-sky-400 mt-1">
            {Math.round(stats.rolling50 * 100)}% / {Math.round(stats.rolling100 * 100)}%
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">Rolling window win rates</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Streak Highs</div>
          <div className="text-base font-bold text-zinc-200 mt-1">
            <span className="text-emerald-400">{stats.longestWinStreak}W</span> /{' '}
            <span className="text-rose-400">{stats.longestLossStreak}L</span>
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">Current: {stats.currentStreak}</div>
        </div>
      </div>

      {/* Trade Ledger */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-zinc-200">PAPER CONTRACT SETTLEMENT LEDGER</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              {(['ALL', 'WIN', 'LOSS'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded font-medium ${
                    filter === f ? 'bg-zinc-800 text-sky-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Export CSV Button */}
            <button
              onClick={exportCSV}
              className="flex items-center gap-1 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-lg text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 text-[11px]">
                  <th className="py-2.5">Time</th>
                  <th className="py-2.5">Asset</th>
                  <th className="py-2.5">Direction</th>
                  <th className="py-2.5">Strike Price</th>
                  <th className="py-2.5">Exit Price</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5">PnL</th>
                  <th className="py-2.5">Queen Conf</th>
                  <th className="py-2.5">Regime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filtered.slice().reverse().map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-900/40">
                    <td className="py-2.5 text-zinc-400">
                      {new Date(t.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 font-bold text-zinc-200">{t.asset}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          t.direction === 'UP'
                            ? 'bg-emerald-950 text-emerald-400'
                            : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-300">{t.entryPrice.toFixed(5)}</td>
                    <td className="py-2.5 text-zinc-300">
                      {t.exitPrice ? t.exitPrice.toFixed(5) : '--'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`flex items-center gap-1 font-bold ${
                          t.status === 'WIN'
                            ? 'text-emerald-400'
                            : t.status === 'LOSS'
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {t.status === 'WIN' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {t.status === 'LOSS' && <XCircle className="w-3.5 h-3.5" />}
                        {t.status === 'DRAW' && <Minus className="w-3.5 h-3.5" />}
                        <span>{t.status}</span>
                      </span>
                    </td>
                    <td className="py-2.5 font-bold">
                      <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}
                      </span>
                    </td>
                    <td className="py-2.5 text-sky-400">{Math.round(t.queenConfidence * 100)}%</td>
                    <td className="py-2.5 text-zinc-400">{t.regime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500 text-xs">
            No paper trade history matches the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
