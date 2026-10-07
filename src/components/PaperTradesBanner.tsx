import React from 'react';
import { PaperTrade, PaperStatistics } from '../types/swarm';
import { Clock, TrendingUp, TrendingDown, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface PaperTradesBannerProps {
  activeTrades: PaperTrade[];
  recentTrades: PaperTrade[];
  currentPrice: number;
  stats: PaperStatistics;
  onOpenTradeHistory?: () => void;
}

export const PaperTradesBanner: React.FC<PaperTradesBannerProps> = ({
  activeTrades,
  recentTrades,
  currentPrice,
  stats,
  onOpenTradeHistory
}) => {
  const now = Date.now();

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 font-mono space-y-3">
      {/* Top Metric Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-xs font-bold text-zinc-200">PAPER TRADING CONTRACTS</span>
          <span className="text-[10px] text-zinc-500">(Fixed 60s Simulated Binary Expiries)</span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-zinc-500">Win Rate:</span>{' '}
            <strong className="text-emerald-400 font-bold">{Math.round(stats.winRate * 100)}%</strong>{' '}
            <span className="text-[10px] text-zinc-500">({stats.wins}W / {stats.losses}L)</span>
          </div>
          <div>
            <span className="text-zinc-500">Net Simulated PnL:</span>{' '}
            <strong className={stats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {stats.netPnl >= 0 ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
            </strong>
          </div>
          <div>
            <span className="text-zinc-500">Streak:</span>{' '}
            <strong className={stats.currentStreak >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {stats.currentStreak > 0 ? `+${stats.currentStreak}W` : `${stats.currentStreak}L`}
            </strong>
          </div>
        </div>
      </div>

      {/* Active Trades Countdown Cards */}
      {activeTrades.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
            Active Open Contracts ({activeTrades.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeTrades.map((t) => {
              const remainingMs = Math.max(0, t.expiryTimestamp - now);
              const remainingSec = Math.ceil(remainingMs / 1000);
              const isCall = t.direction === 'UP';
              const isITM = isCall ? currentPrice > t.entryPrice : currentPrice < t.entryPrice;
              const diff = currentPrice - t.entryPrice;

              return (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                    isITM
                      ? 'bg-emerald-950/30 border-emerald-800/60 text-zinc-200'
                      : 'bg-rose-950/30 border-rose-800/60 text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg font-black text-sm flex items-center gap-1 ${
                        isCall ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                      }`}
                    >
                      {isCall ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span>{t.direction}</span>
                    </div>
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>{t.asset}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                            isITM ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'
                          }`}
                        >
                          {isITM ? 'IN THE MONEY' : 'OUT OF THE MONEY'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Strike: <strong>{t.entryPrice.toFixed(5)}</strong> • Live: <strong>{currentPrice.toFixed(5)}</strong> ({diff >= 0 ? '+' : ''}{diff.toFixed(5)})
                      </div>
                    </div>
                  </div>

                  {/* Countdown Timer */}
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-amber-400 font-bold">
                      <Clock className="w-3.5 h-3.5 animate-spin" />
                      <span>{remainingSec}s left</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      Conf: {Math.round(t.queenConfidence * 100)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-3 px-4 bg-zinc-900/40 rounded-xl border border-zinc-800 text-xs text-zinc-500 text-center">
          No open paper trades currently. Queen is monitoring for high-confluence SMC setups.
        </div>
      )}

      {/* Recent Settled Contracts Pill Strip */}
      {recentTrades.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
            <span className="text-[10px] text-zinc-500 uppercase flex-shrink-0">Recent Results:</span>
            {recentTrades.slice(-8).reverse().map((r) => (
              <span
                key={r.id}
                className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 flex items-center gap-1 border ${
                  r.status === 'WIN'
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                    : r.status === 'LOSS'
                    ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {r.status === 'WIN' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {r.direction} ({r.status})
              </span>
            ))}
          </div>

          {onOpenTradeHistory && (
            <button
              onClick={onOpenTradeHistory}
              className="text-sky-400 hover:text-sky-300 text-xs font-semibold flex-shrink-0 ml-2"
            >
              View Full History →
            </button>
          )}
        </div>
      )}
    </div>
  );
};
