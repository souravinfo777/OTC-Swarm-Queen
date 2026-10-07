import React from 'react';
import { AlertCircle, CheckCircle2, ShieldCheck, Terminal, Zap, Download } from 'lucide-react';

interface RealDataBannerProps {
  isFeedStreaming: boolean;
  currentAsset: string;
  currentPrice: number;
  lastTickTime: number;
  onOpenLogs?: () => void;
  onOpenExtensionModal?: () => void;
}

export const DemoBanner: React.FC<RealDataBannerProps> = ({
  isFeedStreaming,
  currentAsset,
  currentPrice,
  lastTickTime,
  onOpenLogs,
  onOpenExtensionModal
}) => {
  const secondsAgo = lastTickTime > 0 ? Math.round((Date.now() - lastTickTime) / 1000) : null;

  if (isFeedStreaming) {
    return (
      <aside
        aria-label="Real Market Feed Notice"
        className="bg-emerald-950/90 border-b border-emerald-800/80 px-4 py-1.5 text-xs font-mono text-emerald-200 flex flex-wrap items-center justify-between gap-2 shadow-sm select-none"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-bold tracking-wide text-emerald-300">
            100% REAL QUOTEX LIVE STREAM ACTIVE
          </span>
          <span className="hidden sm:inline text-emerald-400/80">
            — Zero simulation / zero mock ticks. Pure live OTC quotes directly from Quotex.
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-emerald-300 font-semibold">
          <div className="flex items-center gap-1.5 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>{currentAsset}</span>
            <span className="text-white font-bold">
              {currentPrice > 0 ? currentPrice.toFixed(currentAsset.includes('JPY') ? 3 : 5) : ''}
            </span>
          </div>
          <span className="text-emerald-400/70">{secondsAgo !== null ? `${secondsAgo}s ago` : ''}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Real Feed Waiting Notice"
      className="bg-rose-950/90 border-b border-rose-800/80 px-4 py-1.5 text-xs font-mono text-rose-200 flex flex-wrap items-center justify-between gap-2 shadow-sm select-none"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
        <span className="font-bold tracking-wide text-rose-300">
          REAL-TIME FEED AWAITING QUOTEX
        </span>
        <span className="hidden sm:inline text-rose-300/80">
          — Simulated ticks disabled. Queen signal paused until live Quotex stream is detected.
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <a
          href="/api/extension/download"
          download="otc-swarm-queen-extension.zip"
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold cursor-pointer transition-colors shadow-sm"
          title="Download Chrome Extension ZIP file"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Extension (.zip)</span>
        </a>

        {onOpenExtensionModal && (
          <button
            onClick={onOpenExtensionModal}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-700/80 font-semibold cursor-pointer"
          >
            <Zap className="w-3 h-3 text-sky-400" />
            <span>Install Guide</span>
          </button>
        )}

        {onOpenLogs && (
          <button
            onClick={onOpenLogs}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-700/80 font-semibold cursor-pointer"
          >
            <Terminal className="w-3 h-3 text-rose-300" />
            <span>View Logs</span>
          </button>
        )}
      </div>
    </aside>
  );
};
