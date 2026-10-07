import React, { useState } from 'react';
import {
  Link2,
  Copy,
  Check,
  Radio,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  X,
  Zap,
  Globe,
  Sliders,
  Download
} from 'lucide-react';
import { SUPPORTED_ASSETS } from '../constants/assets';

interface ExtensionConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAsset: string;
  onSelectAsset: (assetId: string) => void;
  currentPrice: number;
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  lastIngestTime?: number;
}

export const ExtensionConnectModal: React.FC<ExtensionConnectModalProps> = ({
  isOpen,
  onClose,
  currentAsset,
  onSelectAsset,
  currentPrice,
  connectionStatus,
  lastIngestTime
}) => {
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' && window.location.origin && window.location.origin.includes('http')
      ? window.location.origin
      : 'https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app';

  const copyUrl = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/swarm/state');
      if (res.ok) {
        const data = await res.json();
        setTestResult(`✓ Synced: Pair is ${data.asset}, Price: ${data.currentPrice}, Queen: ${data.queenSignal?.direction || 'HOLD'}`);
      } else {
        setTestResult(`Failed: HTTP ${res.status}`);
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 font-mono">
                CHROME EXTENSION LIVE BRIDGE
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  {connectionStatus === 'CONNECTED' ? 'ACTIVE 🟢' : 'CONNECTING 🟡'}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Direct WebSocket & HTTP Ingest from Quotex to Swarm Queen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs text-zinc-300">
          {/* Web App Cloud URL Card */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5 font-mono">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                Web App Cloud Server URL:
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Ready for Ingest</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentOrigin}
                className="flex-1 bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-200 font-mono text-[11px] select-all focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={copyUrl}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg transition-colors font-mono"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              Paste this URL into your Chrome Extension popup under <strong>"Web App Cloud Bridge"</strong> and click <strong>"Connect"</strong>.
            </p>

            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Need the extension package?</span>
              <a
                href="/api/extension/download"
                download="otc-swarm-queen-extension.zip"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors font-mono text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Extension (.zip)</span>
              </a>
            </div>
          </div>

          {/* Quick Troubleshooting Note */}
          <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-[11px] text-amber-200/90 leading-relaxed font-mono">
            <strong>💡 Connect বাটনে ক্লিক করার পর করণীয়:</strong>
            <p className="mt-1 text-zinc-300">
              এক্সটেনশন পপআপে <strong>"Connect"</strong> চাপার পর <strong>"Web App Cloud Bridge"</strong> ব্যাজটি সবুজ <strong>CONNECTED 🟢</strong> দেখাবে। ওপরের <strong>OFFLINE 🔴 / STANDBY 🟡</strong> ব্যাজটি সবুজ হতে আপনার <strong>Quotex ট্রেডিং ট্যাবটি (market-qx.info বা qxbroker.com)</strong> ওপেন রেখে একবার রিফ্রেশ করুন।
            </p>
          </div>

          {/* Quick Active Pair Matcher */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5 font-mono">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Synchronize Active Market Pair:
              </span>
              <span className="text-[11px] font-mono text-sky-400 font-bold">{currentAsset}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">
              Select or confirm the exact pair open in your Quotex window:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_ASSETS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelectAsset(a.name)}
                  className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-colors border ${
                    currentAsset === a.name
                      ? 'bg-sky-950 text-sky-300 border-sky-700 font-bold'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Test & Live Feed Status */}
          <div className="flex items-center justify-between pt-2">
            <div className="font-mono text-[11px] text-zinc-400">
              Live Price: <span className="font-bold text-zinc-100">{currentPrice.toFixed(currentAsset.includes('JPY') ? 3 : 5)}</span>
            </div>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs rounded-lg transition-colors border border-zinc-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Checking...' : '🔄 Test Handshake Ping'}</span>
            </button>
          </div>

          {testResult && (
            <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] font-mono text-emerald-400">
              {testResult}
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-zinc-900/60 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-xs transition-colors font-mono"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
