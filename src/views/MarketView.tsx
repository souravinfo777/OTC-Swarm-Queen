import React from 'react';
import { Candle, MarketTick, SMCFeatureVector } from '../types/market';
import { Activity, Gauge, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';

interface MarketViewProps {
  currentAsset: string;
  currentPrice: number;
  candles: Candle[];
  featureVector: SMCFeatureVector | null;
  recentTicks: MarketTick[];
}

export const MarketView: React.FC<MarketViewProps> = ({
  currentAsset,
  currentPrice,
  candles,
  featureVector,
  recentTicks
}) => {
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const high24h = candles.length > 0 ? candles.reduce((m, c) => (c.high > m ? c.high : m), -Infinity) : currentPrice;
  const low24h = candles.length > 0 ? candles.reduce((m, c) => (c.low < m ? c.low : m), Infinity) : currentPrice;

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Header Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Active OTC Asset</div>
          <div className="text-xl font-bold text-sky-400 mt-0.5">{currentAsset}</div>
          <div className="text-xs text-zinc-400 mt-1">Quotex Isolated OTC Stream</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Live Spot Rate</div>
          <div className="text-xl font-black text-zinc-100 mt-0.5">{currentPrice.toFixed(5)}</div>
          <div className="text-xs text-emerald-400 mt-1">Spread: Zero OTC commission</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Regime Classification</div>
          <div className="text-xl font-bold text-amber-400 mt-0.5">{featureVector?.regime || 'RANGE'}</div>
          <div className="text-xs text-zinc-400 mt-1">Volatility: {featureVector?.volatility || 0}%</div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="text-[10px] text-zinc-500 uppercase">Range (High / Low)</div>
          <div className="text-base font-bold text-zinc-200 mt-0.5">
            {high24h.toFixed(5)} / {low24h.toFixed(5)}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Spread: {(high24h - low24h).toFixed(5)}</div>
        </div>
      </div>

      {/* Main Grid: Left Tick Tape, Right Multi-Timeframe and Candle Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real-Time Tick Tape */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-zinc-200">REAL-TIME TICK TAPE</span>
            </div>
            <span className="text-[10px] text-zinc-500">Live Ticks</span>
          </div>

          <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
            {recentTicks.map((t, idx) => {
              const isUp = idx === 0 || t.price >= (recentTicks[idx - 1]?.price || t.price);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400">{new Date(t.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.price.toFixed(5)}
                    </span>
                    <span className="text-zinc-500 text-[10px]">Vol: {t.volume || 1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Timeframe and Candle Log */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-zinc-200">
                RECENT NORMALIZED CANDLE FORMATIONS ({currentAsset})
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">{candles.length} Candles in Memory</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 text-[11px]">
                  <th className="py-2">Time</th>
                  <th className="py-2">Open</th>
                  <th className="py-2">High</th>
                  <th className="py-2">Low</th>
                  <th className="py-2">Close</th>
                  <th className="py-2">Range</th>
                  <th className="py-2">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {candles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 text-xs">
                      Awaiting real-time Quotex ticks to build live candlesticks. Simulated data is disabled.
                    </td>
                  </tr>
                ) : (
                  candles.slice(-12).reverse().map((c) => {
                    const isBull = c.close >= c.open;
                    const range = c.high - c.low;
                    return (
                      <tr key={c.id} className="hover:bg-zinc-900/40">
                        <td className="py-2 text-zinc-400">{new Date(c.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2 text-zinc-300">{c.open.toFixed(5)}</td>
                        <td className="py-2 text-emerald-400">{c.high.toFixed(5)}</td>
                        <td className="py-2 text-rose-400">{c.low.toFixed(5)}</td>
                        <td className="py-2 font-bold text-zinc-100">{c.close.toFixed(5)}</td>
                        <td className="py-2 text-zinc-400">{range.toFixed(5)}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isBull ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {isBull ? 'BULLISH' : 'BEARISH'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
