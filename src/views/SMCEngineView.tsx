import React from 'react';
import { SwingPoint, LiquidityZone, OrderBlock, FairValueGap, SMCFeatureVector, SMCRawDetails } from '../types/market';
import { Target, Layers, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SMCEngineViewProps {
  swings: SwingPoint[];
  liquidityZones: LiquidityZone[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  featureVector: SMCFeatureVector | null;
  rawDetails: SMCRawDetails | null;
}

export const SMCEngineView: React.FC<SMCEngineViewProps> = ({
  swings,
  liquidityZones,
  orderBlocks,
  fvgs,
  featureVector,
  rawDetails
}) => {
  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Top Banner: SMC Engine Status */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100">SMART MONEY CONCEPTS (SMC) ENGINE</div>
            <div className="text-xs text-zinc-400">
              Institutional order flow recognition, zero look-ahead bias, automated liquidity & imbalance tracking
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500">Confluence:</span>{' '}
            <strong className="text-sky-400 font-bold">{featureVector?.confluenceScore || 0} / 100</strong>
          </div>
          <div className="bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
            <span className="text-zinc-500">Trend:</span>{' '}
            <strong className="text-emerald-400 font-bold">{featureVector?.trend || 'UNCERTAIN'}</strong>
          </div>
        </div>
      </div>

      {/* 4 Quadrants: Market Structure, Liquidity Pools, Order Blocks, FVGs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quadrant 1: Market Structure */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200">1. MARKET STRUCTURE & SWINGS</span>
            <span className="text-[10px] text-zinc-500">{swings.length} Identified Swings</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 text-[10px]">Last Swing High:</span>
              <div className="font-bold text-rose-400 mt-0.5">
                {rawDetails?.structure.lastSwingHigh?.toFixed(5) || '--'}
              </div>
            </div>
            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 text-[10px]">Last Swing Low:</span>
              <div className="font-bold text-emerald-400 mt-0.5">
                {rawDetails?.structure.lastSwingLow?.toFixed(5) || '--'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
            {swings.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs">
                Awaiting real Quotex ticks to identify swings. Simulated data is disabled.
              </div>
            ) : (
              swings.slice(-6).reverse().map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-zinc-900/40 border border-zinc-800/60 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.type === 'HIGH' ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span className="font-semibold text-zinc-300">
                      {s.classification || s.type}
                    </span>
                  </div>
                  <div className="text-zinc-400 font-bold">{s.price.toFixed(5)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quadrant 2: Liquidity Zones */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200">2. LIQUIDITY POOLS (EQH / EQL / SWEEPS)</span>
            <span className="text-[10px] text-zinc-500">{liquidityZones.length} Tracked Pools</span>
          </div>

          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {liquidityZones.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs">
                Awaiting real Quotex ticks to detect liquidity pools.
              </div>
            ) : (
              liquidityZones.map((z, idx) => (
                <div
                  key={`${z.id}_${idx}`}
                  className={`flex items-center justify-between p-2 rounded border text-xs ${
                    z.swept
                      ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                      : 'bg-zinc-900/80 border-zinc-700 text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        z.type.includes('HIGH') || z.type === 'BUY_SIDE'
                          ? 'bg-sky-950 text-sky-400'
                          : 'bg-amber-950 text-amber-400'
                      }`}
                    >
                      {z.type}
                    </span>
                    <span className="text-zinc-400">{z.price.toFixed(5)}</span>
                  </div>

                  <span
                    className={`text-[10px] font-bold ${
                      z.swept ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {z.swept ? 'SWEPT' : 'UNSWEPT POOL'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quadrant 3: Order Blocks (OB) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200">3. INSTITUTIONAL ORDER BLOCKS (OB)</span>
            <span className="text-[10px] text-zinc-500">{orderBlocks.length} Detected OBs</span>
          </div>

          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {orderBlocks.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs">
                Awaiting real Quotex ticks to identify order blocks.
              </div>
            ) : (
              orderBlocks.map((ob, idx) => (
                <div
                  key={`${ob.id}_${idx}`}
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                    ob.type === 'BULLISH'
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                  }`}
                >
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      <span>{ob.type} OB</span>
                      <span className="text-[10px] px-1 bg-zinc-900 rounded text-zinc-400">
                        {ob.displacementScore}x displacement
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Range: {ob.low.toFixed(5)} — {ob.high.toFixed(5)}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        ob.mitigated
                          ? 'bg-zinc-800 text-zinc-500'
                          : ob.fresh
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400'
                      }`}
                    >
                      {ob.mitigated ? 'MITIGATED' : ob.fresh ? 'FRESH ZONE' : 'TOUCHED'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quadrant 4: Fair Value Gaps (FVG) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200">4. FAIR VALUE GAPS (FVG / IMBALANCES)</span>
            <span className="text-[10px] text-zinc-500">{fvgs.length} Imbalances</span>
          </div>

          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {fvgs.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs">
                Awaiting real Quotex ticks to detect fair value gaps.
              </div>
            ) : (
              fvgs.map((f, idx) => (
              <div
                key={`${f.id}_${idx}`}
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                  f.type === 'BULLISH'
                    ? 'bg-sky-950/20 border-sky-800/40 text-sky-300'
                    : 'bg-orange-950/20 border-orange-800/40 text-orange-300'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>{f.type} FVG</span>
                    <span className="text-[10px] px-1 bg-zinc-900 rounded text-zinc-400">
                      Gap: {(f.size).toFixed(5)}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Bounds: {f.lower.toFixed(5)} — {f.upper.toFixed(5)}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      f.mitigated
                        ? 'bg-zinc-800 text-zinc-500'
                        : f.fresh
                        ? 'bg-sky-950 text-sky-400 border border-sky-800'
                        : 'bg-amber-950 text-amber-400'
                    }`}
                  >
                    {f.mitigated ? 'FILLED' : f.fresh ? 'OPEN GAP' : 'TOUCHED'}
                  </span>
                </div>
              </div>
            ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
