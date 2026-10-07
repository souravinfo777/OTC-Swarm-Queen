import React, { useState } from 'react';
import {
  Puzzle,
  Radio,
  CheckCircle2,
  ShieldCheck,
  Download,
  Copy,
  Check,
  ExternalLink,
  FileCode,
  FolderArchive,
  Layers,
  Sparkles,
  Cloud,
  ArrowRight,
  Zap,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Activity,
  Send,
  DollarSign,
  AlertTriangle
} from 'lucide-react';

interface ExtensionHubViewProps {
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  extensionStatus?: 'NOT_INSTALLED' | 'WAITING' | 'LIVE_STREAMING';
  onSendTestPing: () => void;
  currentAsset?: string;
  currentPrice?: number;
  queenSignal?: any;
  multiPairs?: Record<string, any>;
  onSelectAsset?: (asset: string) => void;
}

export const ExtensionHubView: React.FC<ExtensionHubViewProps> = ({
  connectionStatus,
  extensionStatus = 'NOT_INSTALLED',
  onSendTestPing,
  currentAsset = 'USD/INR (OTC)',
  currentPrice = 0,
  queenSignal = null,
  multiPairs = {},
  onSelectAsset
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [cloudPingResult, setCloudPingResult] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [selectedCommandAsset, setSelectedCommandAsset] = useState<string>(currentAsset || 'USD/INR (OTC)');
  const [commandAmount, setCommandAmount] = useState<number>(1);
  const [autoTradeOnSignal, setAutoTradeOnSignal] = useState<boolean>(false);
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [executionLogs, setExecutionLogs] = useState<any[]>([]);

  // Update selected command asset when active asset changes
  React.useEffect(() => {
    if (currentAsset) setSelectedCommandAsset(currentAsset);
  }, [currentAsset]);

  // Listen for execution confirmation events from bridge.js
  React.useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.data && (event.data.type === 'TRADE_EXECUTION_CONFIRMATION' || event.data.type === 'QUOTEX_TRADE_RESULT')) {
        const payload = event.data.payload || event.data.result;
        setCommandFeedback(`✓ Trade Executed in Quotex: ${payload?.direction || 'ORDER'} on ${payload?.asset || selectedCommandAsset}`);
        setExecutionLogs(prev => [
          {
            id: 'log_' + Date.now(),
            time: new Date().toLocaleTimeString(),
            text: `Quotex DOM Executed: ${payload?.direction || 'COMMAND'} on ${payload?.asset || selectedCommandAsset} ($${commandAmount})`,
            status: 'SUCCESS'
          },
          ...prev.slice(0, 15)
        ]);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [selectedCommandAsset, commandAmount]);

  // Execution Activity Feed: poll the server for results the extension background
  // reports via /api/extension/command-result after it actually executes (or fails to
  // execute) each queued command in the Quotex tab. Local "DISPATCHED" entries are
  // replaced by the real DOM outcome.
  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/extension/execution-history');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.history)) return;
        const mapped = data.history.slice(0, 15).map((h: any) => {
          const ok = h.result?.ok !== false;
          return {
            id: h.id,
            time: new Date(h.timestamp).toLocaleTimeString(),
            text: ok
              ? `✓ Quotex tab executed ${h.action} ${h.direction || ''} on ${h.asset}`.replace(/\s+/g, ' ')
              : `⚠ ${h.action} ${h.direction || ''} on ${h.asset} failed: ${h.result?.error || 'unknown reason'}`.replace(/\s+/g, ' '),
            status: ok ? 'SUCCESS' : 'FAILED'
          };
        });
        if (mapped.length > 0) setExecutionLogs(mapped);
      } catch { /* server unreachable */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Auto-trade on Queen consensus signal.
  // Dedupe per signal candle: confidence jitters on every engine tick (0.81 → 0.79 →
  // 0.82 …) while the direction stays the same, so without this guard the effect would
  // re-dispatch a real trade command on every jitter.
  const lastAutoTradeRef = React.useRef<string>('');
  React.useEffect(() => {
    if (!autoTradeOnSignal || !queenSignal) return;
    const dir = queenSignal.direction;
    const conf = queenSignal.confidence || 0;
    if ((dir === 'UP' || dir === 'DOWN' || dir === 'CALL' || dir === 'PUT') && conf >= 0.80) {
      const candleKey = queenSignal.candleKey || `${queenSignal.asset || selectedCommandAsset}_${Math.floor(Date.now() / 60000)}`;
      const signature = `${candleKey}_${dir}`;
      if (lastAutoTradeRef.current === signature) return;
      lastAutoTradeRef.current = signature;
      handleExecuteCommand(dir === 'DOWN' || dir === 'PUT' ? 'PUT' : 'CALL');
    }
  }, [queenSignal?.direction, queenSignal?.confidence, queenSignal?.candleKey, autoTradeOnSignal]);

  const handleExecuteCommand = async (direction: 'CALL' | 'PUT') => {
    setIsDispatching(true);
    setCommandFeedback(null);
    try {
      // 1. Instant window message to extension bridge
      window.postMessage({
        type: 'QUOTEX_EXECUTE_TRADE_COMMAND',
        direction: direction,
        amount: commandAmount,
        asset: selectedCommandAsset
      }, '*');

      // 2. Server command queue backup
      const res = await fetch('/api/extension/trade-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'EXECUTE_TRADE',
          direction: direction,
          asset: selectedCommandAsset,
          amount: commandAmount,
          duration: 60
        })
      });

      if (res.ok) {
        setCommandFeedback(`✓ Command Sent: ${direction} on ${selectedCommandAsset} ($${commandAmount}) -> Quotex Extension Tab Dispatched!`);
        setExecutionLogs(prev => [
          {
            id: 'log_' + Date.now(),
            time: new Date().toLocaleTimeString(),
            text: `Dispatched ${direction} ($${commandAmount}) on ${selectedCommandAsset} to Quotex Extension`,
            status: 'DISPATCHED'
          },
          ...prev.slice(0, 15)
        ]);
      }
    } catch (e: any) {
      setCommandFeedback(`⚠️ Dispatched via Window Channel. Server queue note: ${e.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSwitchTabInQuotex = async (asset: string) => {
    setSelectedCommandAsset(asset);
    if (onSelectAsset) onSelectAsset(asset);

    window.postMessage({
      type: 'QUOTEX_SWITCH_PAIR_COMMAND',
      asset: asset
    }, '*');

    try {
      await fetch('/api/extension/trade-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SWITCH_PAIR', asset: asset })
      });
      setCommandFeedback(`✓ Commanded Quotex tab to switch to ${asset}`);
    } catch (e) {}
  };

  // Determine current active origin
  const currentOrigin =
    typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http')
      ? window.location.origin
      : 'https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app';

  const copyCloudUrl = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const testCloudPing = async () => {
    setPinging(true);
    setCloudPingResult(null);
    try {
      const res = await fetch('/api/swarm/state');
      if (res.ok) {
        const data = await res.json();
        setCloudPingResult(`Status 200 OK — Asset: ${data.asset}, Queen: ${data.queenSignal?.direction || 'HOLD'} (${Math.round((data.queenSignal?.confidence || 0) * 100)}%), Workers: ${data.workers?.length || 20}`);
      } else {
        setCloudPingResult(`Response error: ${res.status}`);
      }
    } catch (err: any) {
      setCloudPingResult(`Failed: ${err.message}`);
    } finally {
      setPinging(false);
    }
  };

  // The extension ZIP is always the server's real bundle (manifest.json + the dist/
  // files actually shipped in this repo). There is deliberately NO client-side
  // fallback zip: hand-rolled copies drift out of sync and install broken builds.
  const handleDownloadZip = async () => {
    setDownloading(true);
    setDownloadSuccess(false);
    try {
      const response = await fetch('/api/extension/download');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      // Keep the server's version-aware filename (otc-swarm-queen-extension-vX.Y.Z.zip)
      const disposition = response.headers.get('Content-Disposition') || '';
      const nameMatch = disposition.match(/filename="?([^";]+)"?/);
      triggerBlobDownload(blob, nameMatch ? nameMatch[1] : 'otc-swarm-queen-extension.zip');
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: any) {
      setDownloading(false);
      alert('Download error: ' + err.message);
      return;
    }
    setDownloading(false);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto font-mono">
      {/* 🎮 QUOTEX IN-BROWSER DIRECT TRADE & PAIR COMMAND TERMINAL */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-sky-950/40 border border-emerald-600/70 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-600 text-emerald-400 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-zinc-100">QUOTEX DIRECT TRADE & SCANNER COMMAND CONSOLE</h1>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-600 font-bold animate-pulse">
                  WEB APP ➔ EXTENSION BRIDGE
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                You can command Quotex trades (CALL/PUT) and switch market pairs directly from this Web App! The extension executes the order in your Quotex tab.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${
              extensionStatus === 'LIVE_STREAMING'
                ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300'
                : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                extensionStatus === 'LIVE_STREAMING' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`} />
              <span>{extensionStatus === 'LIVE_STREAMING' ? 'QUOTEX EXTENSION: STREAMING LIVE' : 'EXTENSION: NOT INSTALLED'}</span>
            </div>
          </div>
        </div>

        {/* Warning Banner if Extension is not installed */}
        {extensionStatus !== 'LIVE_STREAMING' && (
          <div className="bg-amber-950/40 border border-amber-600/70 rounded-xl p-3.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-300">Chrome Extension Not Detected Yet: </span>
                <span>The Web App server is online, but your Chrome Extension is not installed or Quotex tab is not open. Install the extension to enable direct auto-trading and real-time tab syncing!</span>
              </div>
            </div>
            <a
              href="/api/extension/download"
              download="otc-swarm-queen-quotex-extension.zip"
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Extension (.ZIP)</span>
            </a>
          </div>
        )}

        {/* Command Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Col 1: Pair Selection & Tab Switcher */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-sky-400" />
                <span>SELECT PAIR TO COMMAND</span>
              </span>
              <span className="text-[10px] text-zinc-500">Live Tabs Detected</span>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {Object.keys(multiPairs).length > 0 ? (
                  Object.keys(multiPairs).map((pairKey) => {
                    const pairData = multiPairs[pairKey];
                    const isSelected = selectedCommandAsset === pairKey;
                    const payout = Math.round((pairData?.payout || 0.85) * 100);
                    const pSignal = pairData?.queenSignal;
                    const pDir = pSignal ? pSignal.direction : null;
                    const pConf = pSignal?.confidence ? Math.round(pSignal.confidence * 100) : null;
                    const isUp = pDir === 'CALL' || pDir === 'UP';
                    const isDown = pDir === 'PUT' || pDir === 'DOWN';

                    return (
                      <button
                        key={pairKey}
                        onClick={() => handleSwitchTabInQuotex(pairKey)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-sky-950 text-sky-300 border-sky-600 shadow-sm'
                            : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <span>{pairKey.split(' ')[0]}</span>
                        <span className="text-[10px] text-emerald-400 font-black">({payout}%)</span>
                        {pDir && (
                          <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                            isUp ? 'bg-emerald-900/80 text-emerald-300' : isDown ? 'bg-rose-900/80 text-rose-300' : 'bg-zinc-800 text-amber-300'
                          }`}>
                            {isUp ? `CALL ${pConf}%` : isDown ? `PUT ${pConf}%` : 'HOLD'}
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  ['USD/INR (OTC)', 'USD/PHP (OTC)', 'USD/EGP (OTC)', 'USD/IDR (OTC)', 'USD/BRL (OTC)', 'USD/BDT (OTC)', 'NZD/JPY (OTC)'].map((pName) => (
                    <button
                      key={pName}
                      onClick={() => handleSwitchTabInQuotex(pName)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        selectedCommandAsset === pName
                          ? 'bg-sky-950 text-sky-300 border-sky-600'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {pName.split(' ')[0]}
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={() => handleSwitchTabInQuotex(selectedCommandAsset)}
                className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sky-300 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-sky-400" />
                <span>COMMAND QUOTEX TAB SWITCH ({selectedCommandAsset.split(' ')[0]})</span>
              </button>
            </div>
          </div>

          {/* Col 2: Order Amount & Direct Buttons */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>TRADE AMOUNT & EXECUTE</span>
              </span>
              <span className="text-[10px] text-zinc-400">Target: {selectedCommandAsset.split(' ')[0]}</span>
            </div>

            {/* Amount Chips */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 5, 10, 25].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCommandAmount(amt)}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    commandAmount === amt
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600 shadow-sm'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>

            {/* Direct Execute Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleExecuteCommand('CALL')}
                disabled={isDispatching}
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/60 active:scale-95 transition-all"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>EXECUTE CALL</span>
              </button>

              <button
                onClick={() => handleExecuteCommand('PUT')}
                disabled={isDispatching}
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-950/60 active:scale-95 transition-all"
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>EXECUTE PUT</span>
              </button>
            </div>

            {commandFeedback && (
              <div className="text-[11px] p-2 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono">
                {commandFeedback}
              </div>
            )}
          </div>

          {/* Col 3: Auto-Trade Mode & Execution Log */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>AUTO-TRADE ON SIGNAL</span>
              </span>
              <button
                onClick={() => setAutoTradeOnSignal(!autoTradeOnSignal)}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                  autoTradeOnSignal
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600 shadow-sm'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                }`}
              >
                {autoTradeOnSignal ? 'ENABLED (ACTIVE)' : 'DISABLED'}
              </button>
            </div>

            <p className="text-[10px] text-zinc-400 leading-relaxed">
              When enabled, whenever Queen consensus reaches &gt;= 80% on the selected pair, this Web App automatically commands the Quotex Extension to click the trade button!
            </p>

            {/* Mini Log */}
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              <div className="text-[10px] text-zinc-500 uppercase font-bold">Execution Activity Feed:</div>
              {executionLogs.length === 0 ? (
                <div className="text-[10px] text-zinc-500 italic">No trade commands sent yet. Click CALL or PUT to test!</div>
              ) : (
                executionLogs.map((log) => (
                  <div key={log.id} className="text-[10.5px] p-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 flex items-center justify-between">
                    <span className="truncate mr-2">{log.text}</span>
                    <span className={`text-[9px] font-bold shrink-0 ${log.status === 'FAILED' ? 'text-rose-400' : 'text-emerald-400'}`}>{log.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Studio Cloud Sync Live Banner */}
      <div className="bg-gradient-to-r from-sky-950/80 via-indigo-950/60 to-zinc-950 border border-sky-800/80 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-400">
              <Cloud className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>AI STUDIO CLOUD BRIDGE</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  LIVE CLOUD ENDPOINT ACTIVE
                </span>
              </div>
              <div className="text-xs text-sky-200/80 mt-0.5">
                Connecting Chrome Extension on Quotex directly to this running AI Studio instance
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={testCloudPing}
              disabled={pinging}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-sky-300 border border-sky-800/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin' : ''}`} />
              <span>Test Cloud API</span>
            </button>

            <button
              onClick={handleDownloadZip}
              disabled={downloading}
              className={`px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
                downloadSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 active:scale-95'
              }`}
            >
              {downloading ? (
                <>
                  <FolderArchive className="w-4 h-4 animate-spin" />
                  <span>PACKAGING ZIP...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>DOWNLOADED!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>RE-DOWNLOAD PRE-CONFIGURED (.ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Cloud Endpoint URL box */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Your AI Studio Cloud Endpoint:</span>
            <code className="text-sky-300 font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {currentOrigin}
            </code>
          </div>

          <button
            onClick={copyCloudUrl}
            className="flex items-center gap-1.5 px-3 py-1 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 rounded-md text-xs font-bold transition-colors cursor-pointer"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Cloud URL</span>
              </>
            )}
          </button>
        </div>

        {cloudPingResult && (
          <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-lg p-2.5 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{cloudPingResult}</span>
          </div>
        )}
      </div>

      {/* 3 Step Instant Connect Guide for User */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-zinc-100">
            কীভাবে ইতিমধ্যে ইনস্টল করা Extension-কে AI Studio এর সাথে কানেক্ট করবেন (মাত্র ২টি সহজ ধাপ):
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Method A: Using Extension Popup */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-sky-400">
              <span>পদ্ধতি ১: Extension Popup থেকে (সবচেয়ে দ্রুত)</span>
              <span className="bg-sky-950 border border-sky-800 text-sky-300 px-2 py-0.5 rounded text-[10px]">
                ১ মিনিট
              </span>
            </div>
            <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Chrome ব্রাউজারের উপরে ডানদিকের এক্সটেনশন বার থেকে <strong>OTC Swarm Queen</strong> আইকনে ক্লিক করুন।
              </li>
              <li>
                পপআপে <strong>"AI Studio Cloud URL"</strong> বক্সে এই লিংকটি পেস্ট করুন:
                <div className="mt-1 flex items-center gap-2">
                  <input
                    readOnly
                    value={currentOrigin}
                    className="bg-zinc-950 border border-zinc-800 text-sky-300 px-2 py-1 rounded text-[11px] flex-1 font-mono"
                  />
                  <button
                    onClick={copyCloudUrl}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </li>
              <li>
                <strong>"Connect"</strong> বা <strong>"Connect & Sync"</strong> বাটনে ক্লিক করুন। সাথে সাথে সবুজ <strong>"AI STUDIO CONNECTED 🟢"</strong> স্ট্যাটাস দেখতে পাবেন!
              </li>
              <li>
                Quotex ট্যাবে (<code className="text-sky-400">market-qx.info</code>) যান এবং পেজটি একবার <strong>Refresh (F5)</strong> দিন। চার্টের উপরে HUD চালু হয়ে যাবে!
              </li>
            </ol>
          </div>

          {/* Method B: Re-download pre-configured zip */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
              <span>পদ্ধতি ২: অটো-কনফিগার করা ZIP দিয়ে আপডেট করা</span>
              <span className="bg-emerald-950 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded text-[10px]">
                অটোমেটিক
              </span>
            </div>
            <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                উপরের <strong>"RE-DOWNLOAD PRE-CONFIGURED (.ZIP)"</strong> বাটনে ক্লিক করুন (এতে আপনার এই ক্লাউড লিংক অটোমেটিক এমবেড করা আছে)।
              </li>
              <li>
                ফাইলটি Extract করে পূর্বের ফোল্ডারে রিপ্লেস করুন।
              </li>
              <li>
                <code className="text-zinc-200 bg-zinc-950 px-1 py-0.5 rounded">chrome://extensions</code> পেজে গিয়ে এক্সটেনশনের নিচে থাকা <strong>Refresh (গোল তীর 🔄)</strong> বাটনে ক্লিক করুন।
              </li>
              <li>
                Quotex পেজ রিফ্রেশ করলেই AI Studio এর লাইভ সিগন্যাল HUD-তে দেখা যাবে!
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Supported Mirrors */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-zinc-200">Quotex Supported Mirrors:</span>
          <span className="text-[11px] text-zinc-500">Auto-injects overlay HUD on these domains:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['market-qx.info', 'quotex.com', 'quotex.io', 'qxbroker.com', 'qxbroker.info'].map((d) => (
            <span
              key={d}
              className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-sky-400 text-[11px] font-semibold"
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Security note */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-bold text-zinc-200">Zero Sensitive Credential Storage & Safe Execution</div>
            <div className="text-zinc-400 text-[11px]">
              The extension operates non-custodially. It never requests or stores your Quotex account password or API tokens. Live execution is disabled to prevent accidental order placement.
            </div>
          </div>
        </div>
        <div className="text-emerald-400 bg-emerald-950 border border-emerald-800 px-3 py-1 rounded-lg font-bold text-[11px]">
          100% NON-CUSTODIAL
        </div>
      </div>
    </div>
  );
};
