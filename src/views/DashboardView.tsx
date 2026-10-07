import React from 'react';
import { AlertTriangle, Download, Zap, Eye } from 'lucide-react';
import { Candle, SwingPoint, LiquidityZone, OrderBlock, FairValueGap, SMCFeatureVector, SMCRawDetails, VisionScan } from '../types/market';
import type { VisionAccuracySnapshot } from '../App';
import { WorkerFly, QueenSignal, PaperTrade, PaperStatistics } from '../types/swarm';
import { CandleChart } from '../components/CandleChart';
import { QueenPanel } from '../components/QueenPanel';
import { ConfluenceScoreCard } from '../components/ConfluenceScoreCard';
import { WorkerGrid } from '../components/WorkerGrid';
import { PaperTradesBanner } from '../components/PaperTradesBanner';

interface DashboardViewProps {
  candles: Candle[];
  swings: SwingPoint[];
  liquidityZones: LiquidityZone[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  featureVector: SMCFeatureVector | null;
  rawDetails: SMCRawDetails | null;
  workers: WorkerFly[];
  queenSignal: QueenSignal | null;
  activePaperTrades: PaperTrade[];
  recentPaperTrades: PaperTrade[];
  paperStats: PaperStatistics;
  currentPrice: number;
  onExplainWithAI: () => void;
  onOpenTradeHistory: () => void;
  onOpenExtensionModal?: () => void;
  onOpenLogs?: () => void;
  extensionStatus?: 'NOT_INSTALLED' | 'WAITING' | 'LIVE_STREAMING';
  visionScan?: VisionScan | null;
  visionAccuracy?: VisionAccuracySnapshot;
  onRequestVisionScan?: () => void;
  visionScanQueued?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  candles,
  swings,
  liquidityZones,
  orderBlocks,
  fvgs,
  featureVector,
  rawDetails,
  workers,
  queenSignal,
  activePaperTrades,
  recentPaperTrades,
  paperStats,
  currentPrice,
  onExplainWithAI,
  onOpenTradeHistory,
  onOpenExtensionModal,
  onOpenLogs,
  extensionStatus = 'NOT_INSTALLED',
  visionScan = null,
  visionAccuracy,
  onRequestVisionScan,
  visionScanQueued = false
}) => {
  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
      {/* Extension status. "Not installed" must only be claimed when it really is
          missing — a momentary tick gap (pair switch, hidden chart tab) is a WAITING
          state, not a reinstall prompt. */}
      {extensionStatus === 'WAITING' && (
        <div className="bg-gradient-to-r from-amber-950/50 via-zinc-950 to-zinc-950 border border-amber-700/60 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-700 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-bold text-amber-200">EXTENSION CONNECTED — WAITING FOR LIVE TICKS</div>
              <p className="text-[11px] text-zinc-400">
                The bridge is alive but no fresh quote is arriving right now: the focused pair is switching, or the
                Quotex chart tab is not the visible tab. Bring the Quotex chart to the front — ticks resume
                automatically, no reinstall needed.
              </p>
            </div>
          </div>
          {onOpenExtensionModal && (
            <button
              onClick={onOpenExtensionModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors cursor-pointer border border-zinc-700"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>BRIDGE STATUS</span>
            </button>
          )}
        </div>
      )}

      {extensionStatus === 'NOT_INSTALLED' && (
        <div className="bg-gradient-to-r from-amber-950/60 via-zinc-950 to-amber-950/40 border border-amber-600/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-950 border border-amber-600 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-200">QUOTEX EXTENSION NOT DETECTED (INSTALL REQUIRED)</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                  ZERO-SIMULATION MODE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                The web app server is online, but your Quotex Chrome Extension is not installed. Install the extension to stream live ticks and execute auto-trades.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/extension/download"
              download="otc-swarm-queen-quotex-extension.zip"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD EXTENSION (.ZIP)</span>
            </a>
            {onOpenExtensionModal && (
              <button
                onClick={onOpenExtensionModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors cursor-pointer border border-zinc-700"
              >
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>SETUP GUIDE</span>
              </button>
            )}
          </div>
        </div>
      )}



      {/* Top Split: Left Candlestick Chart, Right Queen & SMC Confluence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Candlestick Chart (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <CandleChart
            candles={candles}
            swings={swings}
            liquidityZones={liquidityZones}
            orderBlocks={orderBlocks}
            fvgs={fvgs}
            height={440}
            onOpenExtensionModal={onOpenExtensionModal}
            onOpenLogs={onOpenLogs}
          />
          {/* Paper Trading Banner */}
          <PaperTradesBanner
            activeTrades={activePaperTrades}
            recentTrades={recentPaperTrades}
            currentPrice={currentPrice}
            stats={paperStats}
            onOpenTradeHistory={onOpenTradeHistory}
          />
        </div>

        {/* Right Col: Queen Consensus Panel & SMC Confluence Gauge */}
        <div className="space-y-4">
          <QueenPanel
            signal={queenSignal}
            onExplainWithAI={onExplainWithAI}
          />
          {/* Mistral Vision mini-strip */}
          <div className="bg-zinc-950/80 border border-violet-900/60 rounded-xl p-4 space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-100">
                <Eye className="w-3.5 h-3.5 text-violet-400" />
                MISTRAL VISION
              </div>
              {onRequestVisionScan && (
                <button
                  onClick={onRequestVisionScan}
                  disabled={visionScanQueued}
                  className="px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-bold transition-colors cursor-pointer"
                >
                  {visionScanQueued ? 'SCANNING…' : 'SCAN NOW'}
                </button>
              )}
            </div>
            {visionScan ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">
                  {visionScan.trend} · {visionScan.momentum}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-black border ${
                    visionScan.signal === 'UP'
                      ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                      : visionScan.signal === 'DOWN'
                        ? 'bg-rose-950 border-rose-700 text-rose-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {visionScan.signal === 'NONE' ? 'UNCLEAR' : visionScan.signal} {Math.round(visionScan.confidence * 100)}%
                </span>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500">No scan yet — verdict will flow into every fly's vote.</p>
            )}
            {visionAccuracy && visionAccuracy.total > 0 && (
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                <span>
                  Trained accuracy: <span className="text-emerald-400 font-bold">{Math.round(visionAccuracy.ewma * 100)}%</span>
                </span>
                <span>
                  Queen trust: <span className="text-sky-400 font-bold">{Math.round(visionAccuracy.trust * 100)}%</span> · {visionAccuracy.total} settled
                </span>
              </div>
            )}
          </div>
          <ConfluenceScoreCard
            featureVector={featureVector}
            rawDetails={rawDetails}
          />
        </div>
      </div>

      {/* Bottom: 20 Worker Flies Swarm Matrix */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between font-mono">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 tracking-wide">
              20 WORKER FLIES — ADAPTIVE SWARM STATUS
            </h2>
            <p className="text-xs text-zinc-500">
              Individual genetic agents evaluating real-time SMC features with Bayesian fitness & health survival
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Healthy (&gt;70)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Weak (30-70)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Critical / Rebirth (&lt;30)
            </span>
          </div>
        </div>

        <WorkerGrid workers={workers} />
      </div>
    </div>
  );
};
