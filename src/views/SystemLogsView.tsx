import React, { useState } from 'react';
import {
  Terminal,
  Trash2,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Radio,
  Zap,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  source?: string;
  asset?: string;
  price?: number;
}

interface SystemLogsViewProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  currentAsset: string;
  currentPrice: number;
  lastTickTime: number;
  tickCount: number;
  queenStatus: string;
  candlesCount: number;
  onPingExtension?: () => void;
}

export const SystemLogsView: React.FC<SystemLogsViewProps> = ({
  logs,
  onClearLogs,
  connectionStatus,
  currentAsset,
  currentPrice,
  lastTickTime,
  tickCount,
  queenStatus,
  candlesCount,
  onPingExtension
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'FEED'>('ALL');
  const [copied, setCopied] = useState(false);

  const errorLogsCount = logs.filter((l) => l.level === 'ERROR').length;
  const warnLogsCount = logs.filter((l) => l.level === 'WARN').length;
  const timeSinceLastTick = lastTickTime > 0 ? Math.round((Date.now() - lastTickTime) / 1000) : null;
  const isFeedStalled = timeSinceLastTick === null || timeSinceLastTick > 6;

  const filtered = logs.filter((l) => {
    const matchesSearch =
      l.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.source && l.source.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'ERROR') return l.level === 'ERROR';
    if (selectedFilter === 'WARN') return l.level === 'WARN';
    if (selectedFilter === 'INFO') return l.level === 'INFO' || l.level === 'SUCCESS';
    if (selectedFilter === 'FEED') {
      return (
        l.type.includes('TICK') ||
        l.type.includes('QUOTEX') ||
        l.type.includes('FEED') ||
        l.source?.includes('QUOTEX')
      );
    }
    return true;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level}] [${l.source || 'SYS'}::${l.type}] ${l.message}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'SUCCESS':
        return 'text-emerald-400 bg-emerald-950/70 border-emerald-700/60';
      case 'WARN':
        return 'text-amber-400 bg-amber-950/70 border-amber-700/60';
      case 'ERROR':
        return 'text-rose-400 bg-rose-950/70 border-rose-700/60';
      default:
        return 'text-sky-400 bg-sky-950/70 border-sky-700/60';
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono select-none">
      {/* Top Telemetry & Health Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Real Data Stream Card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-bold">
              <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              QUOTEX FEED
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                !isFeedStalled
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-rose-950/80 text-rose-400 border-rose-800'
              }`}
            >
              {!isFeedStalled ? 'STREAMING REAL' : 'OFFLINE / WAITING'}
            </span>
          </div>
          <div className="mt-2 text-base font-bold text-zinc-100 flex items-center justify-between">
            <span>{currentAsset}</span>
            <span className="text-sm font-semibold text-emerald-400">
              {currentPrice > 0 ? currentPrice.toFixed(currentAsset.includes('JPY') ? 3 : 5) : '0.00000'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {timeSinceLastTick !== null
              ? `Last real tick: ${timeSinceLastTick}s ago (${tickCount} ticks)`
              : 'No live ticks detected yet'}
          </div>
        </div>

        {/* Real Candlestick Accumulation */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
              REAL CANDLE BUFFER
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                candlesCount >= 10
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950/80 text-amber-400 border-amber-800'
              }`}
            >
              {candlesCount >= 10 ? 'READY FOR SMC' : 'ACCUMULATING'}
            </span>
          </div>
          <div className="mt-2 text-base font-bold text-zinc-100">
            {candlesCount} <span className="text-xs text-zinc-400 font-normal">/ 10 minimum</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {candlesCount >= 10
              ? 'Institutional SMC structure valid'
              : 'Signal waiting for 10 live candles'}
          </div>
        </div>

        {/* Queen Signal Generation State */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              SIGNAL DISPATCH
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                queenStatus === 'VALIDATED_SIGNAL' ||
                queenStatus === 'PAPER_SIGNAL' ||
                queenStatus === 'QUICK_SIGNAL' ||
                queenStatus === 'LIVE_CONSENSUS_SIGNAL'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : queenStatus.includes('ERROR') || isFeedStalled
                  ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              {isFeedStalled ? 'SAFETY HOLD' : queenStatus}
            </span>
          </div>
          <div className="mt-2 text-xs font-semibold text-zinc-200 truncate">
            {isFeedStalled
              ? 'HOLD: Real feed stalled (>6s)'
              : queenStatus === 'VALIDATED_SIGNAL' ||
                queenStatus === 'PAPER_SIGNAL' ||
                queenStatus === 'QUICK_SIGNAL' ||
                queenStatus === 'LIVE_CONSENSUS_SIGNAL'
              ? 'Queen verdict live on real ticks'
              : candlesCount < 10
              ? 'HOLD: Insufficient real candles'
              : 'SMC Confluence active on real ticks'}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Zero simulation rule: No fake signals dispatched
          </div>
        </div>

        {/* Error Incident Counter */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              ERROR INCIDENTS
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                errorLogsCount > 0
                  ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                  : 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
              }`}
            >
              {errorLogsCount > 0 ? `${errorLogsCount} DETECTED` : '0 ERRORS'}
            </span>
          </div>
          <div className="mt-2 text-base font-bold text-zinc-100 flex items-center justify-between">
            <span className={errorLogsCount > 0 ? 'text-rose-400' : 'text-zinc-400'}>
              {errorLogsCount} Errors
            </span>
            <span className="text-xs text-amber-400 font-normal">{warnLogsCount} Warnings</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {errorLogsCount > 0 ? 'Review active incidents below' : 'Diagnostics operating nominal'}
          </div>
        </div>
      </div>

      {/* Prominent Error Banner when Feed is Stalled or Errors Detected */}
      {isFeedStalled && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-rose-200">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-rose-300">
                REAL-TIME DATA FEED IS WAITING / OFFLINE
              </div>
              <div className="text-xs text-rose-300/80 mt-1 max-w-3xl">
                Simulated mock data is strictly disabled by your policy. To stream real-time ticks:
                <br />
                1. Ensure the <strong>OTC Swarm Queen Chrome Extension</strong> is installed and active in your browser.
                <br />
                2. Open a Quotex trading tab (e.g., <code className="text-rose-100 font-bold">market-qx.info</code> or <code className="text-rose-100 font-bold">qxbroker.com</code>).
                <br />
                3. The extension content script will immediately sniff the live DOM & WebSocket ticks and bridge them here!
              </div>
            </div>
          </div>
          {onPingExtension && (
            <button
              onClick={onPingExtension}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 text-rose-100 border border-rose-700 text-xs font-bold transition-all shadow-sm"
            >
              <Zap className="w-4 h-4 text-rose-300" />
              <span>TEST EXTENSION PING</span>
            </button>
          )}
        </div>
      )}

      {/* Filter and Action Header */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-sm">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search error messages, types, or sources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
              selectedFilter === 'ALL'
                ? 'bg-zinc-800 text-sky-400 border-sky-800'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            ALL ({logs.length})
          </button>
          <button
            onClick={() => setSelectedFilter('ERROR')}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
              selectedFilter === 'ERROR'
                ? 'bg-rose-950 text-rose-400 border-rose-800'
                : 'bg-zinc-900 text-rose-400/70 border-zinc-800 hover:text-rose-300'
            }`}
          >
            ERRORS ({errorLogsCount})
          </button>
          <button
            onClick={() => setSelectedFilter('WARN')}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
              selectedFilter === 'WARN'
                ? 'bg-amber-950 text-amber-400 border-amber-800'
                : 'bg-zinc-900 text-amber-400/70 border-zinc-800 hover:text-amber-300'
            }`}
          >
            WARNINGS ({warnLogsCount})
          </button>
          <button
            onClick={() => setSelectedFilter('FEED')}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
              selectedFilter === 'FEED'
                ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                : 'bg-zinc-900 text-indigo-400/70 border-zinc-800 hover:text-indigo-300'
            }`}
          >
            REALTIME FEED
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
            title="Copy audit logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Logs'}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
            title="Clear current log entries"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Realtime Terminal Console */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2 max-h-[600px] overflow-y-auto">
        <div className="text-[11px] text-zinc-500 border-b border-zinc-900 pb-2 mb-2 flex items-center justify-between">
          <span>REAL-TIME AUDIT STREAM (LATEST EVENTS ON TOP)</span>
          <span>FILTERED: {filtered.length} EVENTS</span>
        </div>

        {filtered.length > 0 ? (
          filtered.slice(0, 100).map((l) => (
            <div
              key={l.id}
              className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2 transition-all ${
                l.level === 'ERROR'
                  ? 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                  : l.level === 'WARN'
                  ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                  : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-300'
              }`}
            >
              <div className="flex items-start gap-2.5 flex-1">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${getLevelBadge(
                    l.level
                  )}`}
                >
                  {l.level}
                </span>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100">{l.type}</span>
                    {l.source && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                        {l.source}
                      </span>
                    )}
                    {l.asset && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950/60 text-sky-400 border border-sky-800/50">
                        {l.asset}
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-300 leading-relaxed font-mono">{l.message}</div>
                </div>
              </div>

              <div className="text-[10px] text-zinc-500 sm:text-right flex-shrink-0 font-mono">
                {new Date(l.timestamp).toLocaleTimeString()}.
                {String(new Date(l.timestamp).getMilliseconds()).padStart(3, '0')}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-zinc-600 text-xs">
            No event logs match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
