import React from 'react';
import { Eye, ScanLine, TrendingUp, TrendingDown, Minus, ShieldCheck, RefreshCw, ImageIcon } from 'lucide-react';
import { SMCFeatureVector, VisionScan } from '../types/market';
import { QueenSignal } from '../types/swarm';
import type { VisionAccuracySnapshot } from '../App';

interface VisionScanViewProps {
  visionScan: VisionScan | null;
  visionHistory: VisionScan[];
  visionAccuracy: VisionAccuracySnapshot;
  currentAsset: string;
  currentPrice: number;
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  onRequestVisionScan: () => void;
  visionScanQueued: boolean;
  featureVector: SMCFeatureVector | null;
  queenSignal: QueenSignal | null;
}

const dirColor = (signal?: string) =>
  signal === 'UP' ? 'text-emerald-400' : signal === 'DOWN' ? 'text-rose-400' : 'text-zinc-400';

const dirBadge = (signal?: string) => {
  if (signal === 'UP') return 'bg-emerald-950 border-emerald-700 text-emerald-300';
  if (signal === 'DOWN') return 'bg-rose-950 border-rose-700 text-rose-300';
  return 'bg-zinc-900 border-zinc-700 text-zinc-400';
};

const DirIcon: React.FC<{ signal?: string; className?: string }> = ({ signal, className }) =>
  signal === 'UP' ? <TrendingUp className={className} /> : signal === 'DOWN' ? <TrendingDown className={className} /> : <Minus className={className} />;

export const VisionScanView: React.FC<VisionScanViewProps> = ({
  visionScan,
  visionHistory,
  visionAccuracy,
  currentAsset,
  currentPrice,
  connectionStatus,
  onRequestVisionScan,
  visionScanQueued,
  featureVector,
  queenSignal
}) => {
  const accPct = Math.round(visionAccuracy.ewma * 100);
  const trustPct = Math.round(visionAccuracy.trust * 100);
  const winRate = visionAccuracy.total > 0 ? Math.round((visionAccuracy.correct / visionAccuracy.total) * 100) : 0;

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* Header / Scan control */}
      <div className="bg-gradient-to-r from-violet-950/60 via-zinc-950 to-sky-950/40 border border-violet-800/60 rounded-xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-950 border border-violet-700 text-violet-300 flex items-center justify-center">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 tracking-wide">MISTRAL VISION CHART SCANNER</h1>
            <p className="text-[11px] text-zinc-400">
              Visual chart analysis of <span className="text-sky-300 font-bold">{currentAsset}</span> — verdict is merged into all 20
              worker flies and the Queen's next-candle decision. Flies retrain their vision weight on every closed candle.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[11px] text-zinc-400 leading-tight">
            <div>
              Live price: <span className="text-zinc-100 font-bold">{currentPrice > 0 ? currentPrice : '—'}</span>
            </div>
            <div>
              Feed: <span className={connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400'}>{connectionStatus}</span>
            </div>
          </div>
          <button
            onClick={onRequestVisionScan}
            disabled={visionScanQueued}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-colors cursor-pointer shadow-lg"
          >
            {visionScanQueued ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {visionScanQueued ? 'SCAN QUEUED — CAPTURING…' : 'SCAN CHART NOW'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Latest Scan Card */}
        <div className="lg:col-span-2 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-100">LATEST SCAN</h2>
            {visionScan && (
              <span className="text-[10px] text-zinc-500">
                {new Date(visionScan.timestamp).toLocaleTimeString()} · {visionScan.model || 'mistral'} · {visionScan.source}
              </span>
            )}
          </div>

          {!visionScan ? (
            <div className="py-12 text-center space-y-3">
              <ImageIcon className="w-10 h-10 mx-auto text-zinc-700" />
              <p className="text-xs text-zinc-500">
                No vision scan yet. Press <span className="text-violet-300 font-bold">SCAN CHART NOW</span> (the Quotex tab must be
                open with the extension) — or wait for the automatic per-candle scan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verdict banner */}
              <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${dirBadge(visionScan.signal)}`}>
                <div className="flex items-center gap-3">
                  <DirIcon signal={visionScan.signal} className="w-6 h-6" />
                  <div>
                    <div className={`text-lg font-black tracking-wide ${dirColor(visionScan.signal)}`}>
                      NEXT CANDLE: {visionScan.signal === 'NONE' ? 'UNCLEAR' : visionScan.signal}
                    </div>
                    <div className="text-[11px] opacity-80">
                      {visionScan.trend} · {visionScan.momentum} momentum · {visionScan.volatility} volatility
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black">{Math.round(visionScan.confidence * 100)}%</div>
                  <div className="text-[10px] opacity-70">vision confidence</div>
                </div>
              </div>

              {/* Chart thumbnail */}
              {visionScan.thumbnail && (
                <div className="rounded-lg overflow-hidden border border-zinc-800">
                  <img src={visionScan.thumbnail} alt="Scanned chart" className="w-full max-h-64 object-contain bg-black" />
                </div>
              )}

              {/* Extracted data grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                {[
                  { label: 'Support', value: visionScan.support ?? '—' },
                  { label: 'Resistance', value: visionScan.resistance ?? '—' },
                  { label: 'Price @ scan', value: visionScan.priceAtScan ?? '—' },
                  { label: 'Patterns', value: visionScan.patterns.length > 0 ? visionScan.patterns.join(', ') : 'None detected' }
                ].map((item) => (
                  <div key={item.label} className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2">
                    <div className="text-zinc-500 text-[10px] uppercase tracking-wide">{item.label}</div>
                    <div className="text-zinc-200 font-bold mt-0.5 break-words">{String(item.value)}</div>
                  </div>
                ))}
              </div>

              {visionScan.structure && (
                <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-[11px]">
                  <span className="text-zinc-500 uppercase text-[10px] tracking-wide">Structure: </span>
                  <span className="text-zinc-300">{visionScan.structure}</span>
                </div>
              )}
              {visionScan.candleRead && (
                <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-[11px]">
                  <span className="text-zinc-500 uppercase text-[10px] tracking-wide">Last candles: </span>
                  <span className="text-zinc-300">{visionScan.candleRead}</span>
                </div>
              )}

              {/* Reasoning */}
              {visionScan.reasoning.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Mistral reasoning</div>
                  {visionScan.reasoning.map((r, i) => (
                    <div key={i} className="flex gap-2 text-[11px] text-zinc-300 bg-zinc-900/40 rounded-lg px-3 py-1.5">
                      <span className="text-violet-400 font-bold">{i + 1}.</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: accuracy + combined signal */}
        <div className="space-y-4">
          {/* Self-training accuracy */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-zinc-100">SELF-TRAINING ACCURACY</h2>
            </div>
            <div className="space-y-2 text-[11px]">
              <div>
                <div className="flex justify-between text-zinc-400">
                  <span>Rolling accuracy (EWMA)</span>
                  <span className="text-zinc-100 font-bold">{accPct}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full" style={{ width: `${accPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-zinc-400">
                  <span>Queen vision trust</span>
                  <span className="text-zinc-100 font-bold">{trustPct}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full" style={{ width: `${trustPct}%` }} />
                </div>
              </div>
              <div className="flex justify-between text-zinc-400 pt-1">
                <span>Settled predictions</span>
                <span className="text-zinc-100 font-bold">
                  {visionAccuracy.correct}/{visionAccuracy.total} ({winRate}%)
                </span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Every closed candle, the newest vision prediction is settled against the real close. Correct calls raise the Queen's
              trust and the flies' <span className="text-violet-300">visionWeight</span> DNA; wrong calls lower it — each fly trains
              individually.
            </p>
          </div>

          {/* Combined signal */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-bold text-zinc-100">COMBINED QUEEN SIGNAL</h2>
            {queenSignal ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Queen verdict</span>
                  <span className={`font-black flex items-center gap-1 ${dirColor(queenSignal.direction)}`}>
                    <DirIcon signal={queenSignal.direction} className="w-4 h-4" />
                    {queenSignal.direction}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Confidence / Consensus</span>
                  <span className="text-zinc-100 font-bold">
                    {Math.round(queenSignal.confidence * 100)}% / {Math.round(queenSignal.consensus * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Vision in feature vector</span>
                  <span className={`font-bold ${dirColor(featureVector?.visionSignal)}`}>
                    {featureVector?.visionSignal ? `${featureVector.visionSignal} (${Math.round((featureVector.visionConfidence || 0) * 100)}%)` : 'NONE'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Next candle</span>
                  <span className="text-zinc-100 font-bold">{queenSignal.nextCandleDirection || '—'}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">Awaiting Queen evaluation on live ticks.</p>
            )}
          </div>
        </div>
      </div>

      {/* Scan history */}
      {visionHistory.length > 0 && (
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4">
          <h2 className="text-sm font-bold text-zinc-100 mb-3">SCAN HISTORY ({currentAsset})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                  <th className="py-1.5 pr-3">Time</th>
                  <th className="py-1.5 pr-3">Signal</th>
                  <th className="py-1.5 pr-3">Conf</th>
                  <th className="py-1.5 pr-3">Trend</th>
                  <th className="py-1.5 pr-3">Momentum</th>
                  <th className="py-1.5 pr-3">Patterns</th>
                </tr>
              </thead>
              <tbody>
                {visionHistory.slice(0, 12).map((s) => (
                  <tr key={s.id} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-1.5 pr-3 text-zinc-500">{new Date(s.timestamp).toLocaleTimeString()}</td>
                    <td className={`py-1.5 pr-3 font-bold ${dirColor(s.signal)}`}>{s.signal}</td>
                    <td className="py-1.5 pr-3">{Math.round(s.confidence * 100)}%</td>
                    <td className="py-1.5 pr-3">{s.trend}</td>
                    <td className="py-1.5 pr-3">{s.momentum}</td>
                    <td className="py-1.5 pr-3 text-zinc-500">{s.patterns.slice(0, 2).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
