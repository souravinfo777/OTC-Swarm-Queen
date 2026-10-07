import React from 'react';
import {
  Cpu,
  Radio,
  ShieldAlert,
  Clock,
  Zap,
  Download,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';

interface HeaderProps {
  currentAsset: string;
  onAssetChange: (asset: string) => void;
  timeframe: number;
  onTimeframeChange: (tf: number) => void;
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  extensionStatus?: 'NOT_INSTALLED' | 'WAITING' | 'LIVE_STREAMING';
  currentPrice: number;
  dataAgeMs: number;
  onOpenExtensionModal?: () => void;
  multiPairs?: Record<string, any>;
}

export const Header: React.FC<HeaderProps> = ({
  currentAsset,
  onAssetChange,
  timeframe,
  onTimeframeChange,
  connectionStatus,
  extensionStatus = 'NOT_INSTALLED',
  currentPrice,
  dataAgeMs,
  onOpenExtensionModal,
  multiPairs = {}
}) => {
  // Zero-simulation: this header only ever shows the real streamed price. No asset
  // object fabrication — the short label comes straight from the focused pair string.
  const assetShortName = (currentAsset || 'OTC').split(' ')[0];
  const detectedPairKeys = Object.keys(multiPairs || {});

  return (
    <header className="bg-zinc-950 border-b border-zinc-800/80 px-4 py-2 flex flex-col gap-2 text-xs select-none">
      {/* Top Main Navigation Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-sky-500/20">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold tracking-wider text-xs text-zinc-100 font-mono">
                <span>OTC SWARM QUEEN</span>
                <span className="text-[9px] px-1.5 py-0.2 bg-sky-950 text-sky-400 border border-sky-800/60 rounded font-normal">
                  v1.0.4-MULTI
                </span>
              </div>
              <div className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                <span>AUTONOMOUS MULTI-TAB SCANNER</span>
              </div>
            </div>
          </div>

          {/* Live Data Badge (display only — zero-simulation policy means LIVE is the only mode) */}
          <span
            title="Zero-simulation mode: only real Quotex extension ticks are used"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold border text-[10px] bg-emerald-950/80 text-emerald-400 border-emerald-700/60"
          >
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            <span>DATA: LIVE</span>
          </span>

          {/* Direct Download Extension Button */}
          <a
            href="/api/extension/download"
            download="otc-swarm-queen-extension.zip"
            title="Download Chrome Extension ZIP file"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900/90 transition-all cursor-pointer shadow-sm shadow-emerald-950/50"
          >
            <Download className="w-2.5 h-2.5 text-emerald-400" />
            <span>DOWNLOAD EXTENSION</span>
          </a>

          {/* Extension Bridge Link Button */}
          <button
            onClick={onOpenExtensionModal}
            title="Configure Quotex Chrome Extension live bridge"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold bg-sky-950/80 text-sky-300 border border-sky-700/60 hover:bg-sky-900/80 transition-all cursor-pointer shadow-sm shadow-sky-950/40"
          >
            <Zap className="w-2.5 h-2.5 text-sky-400" />
            <span>EXTENSION BRIDGE 🔗</span>
          </button>

          {/* Quotex Extension Connection Status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] border font-bold ${
              extensionStatus === 'LIVE_STREAMING'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80 shadow-sm shadow-emerald-950/50'
                : extensionStatus === 'WAITING'
                ? 'bg-amber-950/80 text-amber-400 border-amber-700/80'
                : 'bg-rose-950/60 text-rose-300 border-rose-800/80'
            }`}
            title={
              extensionStatus === 'LIVE_STREAMING'
                ? 'Quotex Chrome Extension is active & streaming live ticks'
                : extensionStatus === 'WAITING'
                ? 'Extension is connected but no fresh tick right now (pair switching / Quotex tab not visible)'
                : 'Quotex Extension is not installed or Quotex tab is not open'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                extensionStatus === 'LIVE_STREAMING'
                  ? 'bg-emerald-400 animate-ping'
                  : extensionStatus === 'WAITING'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span>
              {extensionStatus === 'LIVE_STREAMING'
                ? 'QUOTEX: STREAMING'
                : extensionStatus === 'WAITING'
                ? 'EXTENSION: WAITING'
                : 'EXTENSION: NOT INSTALLED'}
            </span>
          </div>

          {/* Internal Server WebSocket Indicator */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] text-zinc-400 bg-zinc-900/60 border border-zinc-800"
            title="Internal React-Node.js WebSocket connection"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === 'CONNECTED' ? 'bg-sky-400' : 'bg-rose-500'
              }`}
            />
            <span>SERVER: {connectionStatus === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Center Controls: Timeframe & Replay */}
        <div className="flex items-center gap-2">
          {/* Timeframe Buttons */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 font-mono text-[10px]">
            {[
              { label: '1M', sec: 60 },
              { label: '5M', sec: 300 },
              { label: '15M', sec: 900 }
            ].map((tf) => (
              <button
                key={tf.sec}
                onClick={() => onTimeframeChange(tf.sec)}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  timeframe === tf.sec
                    ? 'bg-zinc-800 text-sky-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Replay Mode Toggle */}
        </div>

        {/* Right Ticker, Latency, Execution Safety Status */}
        <div className="flex items-center gap-2.5 font-mono">
          {/* Focused Price Ticker */}
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg px-2.5 py-0.5 flex items-center gap-1.5">
            <span className="text-zinc-500 text-[10px]">{assetShortName}:</span>
            <span className="text-sm font-bold text-zinc-100 tracking-wider">
              {currentPrice > 0 ? currentPrice.toFixed(currentAsset.includes('JPY') || currentAsset.includes('PKR') || currentAsset.includes('BDT') ? 3 : currentAsset.includes('BTC') ? 1 : 5) : '0.00000'}
            </span>
          </div>

          {/* Data Latency / Age */}
          <div className="hidden lg:flex items-center gap-1 text-zinc-500 text-[10px]" title="Data Age / Feed Latency">
            <Clock className="w-3 h-3" />
            <span>{dataAgeMs}ms</span>
          </div>

          {/* Safety Lock Badge */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-900/50 text-rose-400 text-[9px] font-semibold"
            title="Safety Rule: Live trade execution is strictly disabled. Operating in DATA / PAPER / ANALYSIS mode only."
          >
            <ShieldAlert className="w-3 h-3" />
            <span>EXECUTION DISABLED</span>
          </div>
        </div>
      </div>

      {/* Multi-Tab Live Radar Strip (Shows all open Quotex tabs with instant signals) */}
      <div className="flex items-center gap-1.5 bg-zinc-900/70 border border-zinc-800/80 rounded-lg px-2.5 py-1 overflow-x-auto">
        <div className="flex items-center gap-1 text-zinc-400 font-mono text-[10px] font-bold mr-1 shrink-0">
          <Layers className="w-3 h-3 text-sky-400" />
          <span>OPEN QUOTEX TABS ({detectedPairKeys.length > 0 ? detectedPairKeys.length : 'SCANNING'}):</span>
        </div>

        {detectedPairKeys.length === 0 ? (
          <div className="text-[10px] text-zinc-500 font-mono italic">
            Scanning browser tabs... Open Quotex tabs (e.g. USD/PKR, CAD/CHF, USD/BRL) to monitor all pairs simultaneously!
          </div>
        ) : (
          detectedPairKeys.map((pairKey) => {
            const pairData = multiPairs[pairKey];
            const isSelected = currentAsset === pairKey || currentAsset === pairData?.asset;
            const price = pairData?.currentPrice || 0;
            const payoutPct = pairData?.payout ? Math.round(pairData.payout * 100) : null;
            const pSig = pairData?.queenSignal;
            const dir = pSig?.direction || 'HOLD';
            const isUp = dir === 'CALL' || dir === 'UP';
            const isDown = dir === 'PUT' || dir === 'DOWN';
            // Real confidence only — never fabricate a 70% default.
            const conf = pSig ? Math.round((pSig.confidence || 0) * 100) : null;

            return (
              <button
                key={pairKey}
                onClick={() => onAssetChange(pairKey)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-[10.5px] transition-all cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-zinc-800 text-sky-300 border-sky-500/80 shadow-sm'
                    : 'bg-zinc-950/90 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-sky-400' : 'bg-emerald-500'}`} />
                <span className="font-bold">{pairKey.split(' ')[0]}</span>
                {payoutPct !== null && payoutPct > 0 && (
                  <span className="px-1 py-0.1 rounded text-[8.5px] bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
                    {payoutPct}%
                  </span>
                )}
                <span className="text-zinc-400 text-[9.5px]">
                  {price > 0 ? (price > 10 ? price.toFixed(2) : price.toFixed(4)) : '--'}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-black flex items-center gap-0.5 ${
                    isUp
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : isDown
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-zinc-900 text-amber-400 border border-zinc-700'
                  }`}
                >
                  {isUp && <ArrowUpRight className="w-2.5 h-2.5" />}
                  {isDown && <ArrowDownRight className="w-2.5 h-2.5" />}
                  {dir === 'HOLD' && <Minus className="w-2.5 h-2.5" />}
                  <span>
                    {isUp ? `CALL ${conf ?? 0}%` : isDown ? `PUT ${conf ?? 0}%` : 'HOLD'}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </header>
  );
};
