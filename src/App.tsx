import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Header } from './components/Header';
import { DemoBanner } from './components/DemoBanner';
import { SignalToast, SignalToastItem } from './components/SignalToast';
import { Navigation, TabId } from './components/Navigation';
import { ExtensionConnectModal } from './components/ExtensionConnectModal';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[App Error Boundary Caught Error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-6 font-mono select-none">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto text-xl font-black">
              ⚠️
            </div>
            <h1 className="text-base font-bold text-zinc-100">OTC Swarm Queen Runtime Guard</h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              A temporary rendering glitch was safely captured. Click below to restore full dashboard view.
            </p>
            <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 text-left text-[11px] text-rose-300/80 overflow-x-auto">
              <code>{this.state.error?.message || 'Unknown runtime state'}</code>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              🔄 RESTORE DASHBOARD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Types
import {
  Candle,
  MarketTick,
  VisionScan,
  SwingPoint,
  LiquidityZone,
  OrderBlock,
  FairValueGap,
  SMCFeatureVector,
  SMCRawDetails
} from './types/market';
import {
  WorkerFly,
  QueenSignal,
  PaperTrade,
  GraveyardRecord,
  PatternMemoryItem,
  PaperStatistics
} from './types/swarm';

// Engines & Services
import { SMCEngine } from './services/engine/smcEngine';
import { SwarmEngine } from './services/engine/swarmEngine';
import { PaperTradingEngine } from './services/engine/paperTrader';
import { VisionEngine } from './services/engine/visionEngine';
import { SwarmSocketClient } from './services/socket/socketClient';
import { findAsset, SUPPORTED_ASSETS } from './constants/assets';

// Views
import { DashboardView } from './views/DashboardView';
import { MarketView } from './views/MarketView';
import { SMCEngineView } from './views/SMCEngineView';
import { SwarmView } from './views/SwarmView';
import { QueenView } from './views/QueenView';
import { PaperTradingView } from './views/PaperTradingView';
import { GraveyardView } from './views/GraveyardView';
import { PatternMemoryView } from './views/PatternMemoryView';
import { PerformanceView } from './views/PerformanceView';
import { VisionScanView } from './views/VisionScanView';
import { ExtensionHubView } from './views/ExtensionHubView';
import { SettingsView } from './views/SettingsView';
import { SystemLogsView, LogEntry } from './views/SystemLogsView';

const SWARM_STATE_KEY = 'otc_queen_swarm_state_v1';

export interface VisionAccuracySnapshot {
  ewma: number;
  trust: number;
  total: number;
  correct: number;
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Market State
  const [currentAsset, setCurrentAsset] = useState<string>(SUPPORTED_ASSETS[0].name);
  const [timeframe, setTimeframe] = useState<number>(60);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTED');
  const [extensionStatus, setExtensionStatus] = useState<'NOT_INSTALLED' | 'WAITING' | 'LIVE_STREAMING'>('NOT_INSTALLED');
  // Zero-simulation: no price exists until a real Quotex tick arrives.
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [dataAgeMs, setDataAgeMs] = useState<number>(80);
  const [recentTicks, setRecentTicks] = useState<MarketTick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [lastLiveIngestAt, setLastLiveIngestAt] = useState<number>(0);

  // SMC & Swarm State
  const [featureVector, setFeatureVector] = useState<SMCFeatureVector | null>(null);
  const [rawDetails, setRawDetails] = useState<SMCRawDetails | null>(null);
  const [workers, setWorkers] = useState<WorkerFly[]>([]);
  const [queenSignal, setQueenSignal] = useState<QueenSignal | null>(null);
  const [graveyard, setGraveyard] = useState<GraveyardRecord[]>([]);
  const [patterns, setPatterns] = useState<PatternMemoryItem[]>([]);

  // Paper Trading State
  const [activePaperTrades, setActivePaperTrades] = useState<PaperTrade[]>([]);
  const [recentPaperTrades, setRecentPaperTrades] = useState<PaperTrade[]>([]);
  const [paperStats, setPaperStats] = useState<PaperStatistics>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    netPnl: 0,
    rolling50: 0,
    rolling100: 0,
    rolling200: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
    currentStreak: 0
  });

  // Vision Scan State (Mistral)
  const [visionScan, setVisionScan] = useState<VisionScan | null>(null);
  const [visionHistory, setVisionHistory] = useState<VisionScan[]>([]);
  const [visionAccuracy, setVisionAccuracy] = useState<VisionAccuracySnapshot>({ ewma: 0.5, trust: 0.5, total: 0, correct: 0 });
  const [visionScanQueued, setVisionScanQueued] = useState(false);

  const [multiPairs, setMultiPairs] = useState<Record<string, any>>({});

  // New-signal popups: raised the instant a pair produces a fresh UP/DOWN verdict and
  // removed again after ~4.5s (see SIGNAL_TOAST_LIFE_MS + the .sq-toast animation).
  const [signalToasts, setSignalToasts] = useState<SignalToastItem[]>([]);
  const announcedSignalRef = useRef<Record<string, string>>({});
  const toastTimersRef = useRef<Record<string, number>>({});

  // Settings State
  const [consensusThreshold, setConsensusThreshold] = useState(0.60);
  const [minConfidence, setMinConfidence] = useState(0.70);
  const [cooldownSeconds, setCooldownSeconds] = useState(45);
  const [minTradesForValidation, setMinTradesForValidation] = useState(200);

  // Logs State
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: `log_init_${Date.now()}`,
      timestamp: Date.now(),
      type: 'ENGINE_INIT',
      message: 'OTC Swarm Queen initialized in Zero-Simulation Mode. Awaiting live Quotex tick stream.',
      level: 'INFO',
      source: 'CORE_ENGINE'
    }
  ]);

  const lastFeedErrorLogAtRef = useRef<number>(0);
  const realCandleBuildingRef = useRef<Candle | null>(null);

  // The long-lived init effect (deps: [timeframe]) captures handlers that must always
  // see the CURRENT pair, not the pair selected when the effect first ran.
  const currentAssetRef = useRef<string>(currentAsset);
  useEffect(() => {
    currentAssetRef.current = currentAsset;
  }, [currentAsset]);
  const [totalTickCount, setTotalTickCount] = useState(0);

  // Extension presence tracking. The header used to flip straight to "NOT CONNECTED" the
  // moment a single tick was late (pair switch, chart tab in the background, capture
  // pause), and then "auto-fix" again seconds later. Presence is now derived from three
  // independent signals (fresh ticks, any in-tab bridge message, the server-side
  // heartbeat that the extension's 4s scan-queue poll produces) and needs consecutive
  // misses before the badge is allowed to report the extension as missing.
  const extensionPresenceRef = useRef({
    lastTabMessageAt: 0,   // any message from the extension bridge on this tab
    serverHeartbeatAt: 0,  // last time the server confirmed the extension contacted it
    serverAlive: false,
    misses: 0
  });

  // Live per-pair signals straight from the Quotex extension. The dashboard must always
  // display the signal that belongs to the pair it is showing (never another pair's).
  const livePairSignalsRef = useRef<Record<string, any>>({});
  const multiPairsRef = useRef<Record<string, any>>({});

  // Mirror the multi-pair map into a ref so the 1s tick loop can read the newest pairs
  // without restarting / re-subscribing.
  useEffect(() => {
    multiPairsRef.current = multiPairs;
  }, [multiPairs]);

  // Singleton Engine References
  const smcRef = useRef<SMCEngine | null>(null);
  const swarmRef = useRef<SwarmEngine | null>(null);
  const paperRef = useRef<PaperTradingEngine | null>(null);
  const visionRef = useRef<VisionEngine | null>(null);
  const socketRef = useRef<SwarmSocketClient | null>(null);

  // Persist trained swarm state (throttled) so flies keep their learned DNA across reloads.
  const lastSwarmPersistRef = useRef<number>(0);
  const lastCombinedPublishRef = useRef<number>(0);
  const persistSwarm = () => {
    const now = Date.now();
    if (now - lastSwarmPersistRef.current < 5000) return;
    lastSwarmPersistRef.current = now;
    try {
      if (swarmRef.current) localStorage.setItem(SWARM_STATE_KEY, swarmRef.current.exportState());
    } catch { /* storage unavailable */ }
  };

  // Map an extension/Quotex per-pair signal into the dashboard's QueenSignal shape.
  // This keeps the displayed signal bound to the pair it belongs to.
  const mapLiveSignal = (q: any, asset?: string) => {
    const rawDir = q?.direction || 'HOLD';
    const dir = rawDir === 'CALL' || rawDir === 'UP' ? 'UP' : rawDir === 'PUT' || rawDir === 'DOWN' ? 'DOWN' : 'HOLD';
    return {
      timestamp: q?.timestamp || Date.now(),
      asset: q?.asset || asset || 'UNKNOWN',
      direction: dir as 'UP' | 'DOWN' | 'HOLD',
      nextCandleDirection: q?.nextCandleDirection || (dir === 'UP' ? 'CALL (UP)' : dir === 'DOWN' ? 'PUT (DOWN)' : 'HOLD'),
      candleExpirySeconds: q?.candleExpirySeconds ?? (60 - (Math.floor(Date.now() / 1000) % 60)),
      candleExpiryTimer: q?.candleExpiryTimer ?? `00:${String(60 - (Math.floor(Date.now() / 1000) % 60)).padStart(2, '0')}s`,
      candleCloseAt: q?.candleCloseAt,
      optimalRoundNumber: q?.optimalRoundNumber,
      roundLevels: q?.roundLevels,
      confidence: q?.confidence ?? 0,
      consensus: q?.consensus ?? 0,
      status: q?.status || 'LIVE_CONSENSUS_SIGNAL',
      evidence: Array.isArray(q?.evidence) ? q.evidence : ['Awaiting live Quotex evidence'],
      upVotes: q?.upVotes ?? 0,
      downVotes: q?.downVotes ?? 0,
      holdVotes: q?.holdVotes ?? 20,
      totalWorkers: 20,
      cooldownRemaining: q?.cooldownRemaining ?? 0,
      reasons: Array.isArray(q?.reasons) ? q.reasons : ['Live Quotex per-pair consensus'],
      // Signal POWER / warm-up telemetry straight from the Quotex engine. Without these
      // the dashboard could not tell a real verdict apart from a "still warming up" stub
      // and would happily render a 0%-confidence HOLD over a live directional read.
      power: typeof q?.power === 'number' ? q.power : 0,
      warmingUp: Boolean(q?.warmingUp || q?.status === 'WARMING_UP'),
      dataPoints: typeof q?.dataPoints === 'number' ? q.dataPoints : 0,
      candleKey: q?.candleKey
    };
  };

  // ── New-signal popups ────────────────────────────────────────────────────────
  // Every fresh directional verdict (UP/DOWN) for any pair pops a card with the pair
  // name and the side, then disappears on its own after ~4.5s. HOLDs, warming-up stubs
  // and 0%-confidence readings never pop up, and the same verdict cannot pop twice for
  // the same pair+side+candle.
  const SIGNAL_TOAST_LIFE_MS = 4500;
  const SIGNAL_TOAST_MAX = 3;

  const dismissSignalToast = (id: string) => {
    const timer = toastTimersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
    setSignalToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const pushSignalToast = (asset: string, rawSignal: any, source: 'QUOTEX_LIVE' | 'SWARM_QUEEN' = 'QUOTEX_LIVE') => {
    if (!asset || !rawSignal) return;
    const rawDir = String(rawSignal.direction || 'HOLD').toUpperCase();
    const side: 'UP' | 'DOWN' | null =
      rawDir === 'CALL' || rawDir === 'UP' ? 'UP' : rawDir === 'PUT' || rawDir === 'DOWN' ? 'DOWN' : null;
    if (!side) return; // HOLD / warming up → nothing worth popping up
    const confidence = Number(rawSignal.confidence || 0);
    if (!(confidence > 0)) return; // never pop a fabricated 0% signal

    // The extensions re-publish the same locked verdict on every tick — dedupe per
    // pair + side + candle so one signal equals exactly one popup.
    const candleKey = rawSignal.candleKey || Math.floor(Date.now() / 60000);
    const signature = `${side}|${candleKey}`;
    if (announcedSignalRef.current[asset] === signature) return;
    announcedSignalRef.current[asset] = signature;

    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item: SignalToastItem = {
      id,
      asset,
      side,
      label: side === 'UP' ? 'CALL (UP)' : 'PUT (DOWN)',
      confidence,
      power: Number(rawSignal.power || 0),
      votes: Math.max(Number(rawSignal.upVotes || 0), Number(rawSignal.downVotes || 0)),
      totalWorkers: Number(rawSignal.totalWorkers || 20) || 20,
      source,
      expiryTimer: rawSignal.candleExpiryTimer,
      createdAt: Date.now()
    };

    setSignalToasts((prev) => [...prev, item].slice(-SIGNAL_TOAST_MAX));
    toastTimersRef.current[id] = window.setTimeout(() => dismissSignalToast(id), SIGNAL_TOAST_LIFE_MS);
  };

  const addLog = (
    type: string,
    message: string,
    level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO',
    source: string = 'SWARM_ENGINE',
    asset?: string,
    price?: number
  ) => {
    setLogs((prev) => [
      {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
        type,
        message,
        level,
        source,
        asset,
        price
      },
      ...prev.slice(0, 150)
    ]);
  };

  // Initialize all engines once
  useEffect(() => {
    const smc = new SMCEngine();
    const swarm = new SwarmEngine(20);
    const paper = new PaperTradingEngine();
    const vision = new VisionEngine();
    const socket = new SwarmSocketClient();

    smcRef.current = smc;
    swarmRef.current = swarm;
    paperRef.current = paper;
    visionRef.current = vision;
    socketRef.current = socket;

    // Restore trained swarm (DNA weights incl. visionWeight, health, fitness)
    try {
      const savedSwarm = localStorage.getItem(SWARM_STATE_KEY);
      if (savedSwarm && swarm.importState(savedSwarm)) {
        addLog('INIT', 'Trained swarm state restored from local memory. Flies kept their evolved DNA.', 'SUCCESS', 'CORE_INIT');
      }
    } catch { /* ignore */ }

    // ZERO-SIMULATION POLICY: Do NOT load fake simulated candles into the chart!
    setCandles([]);
    setCurrentPrice(0);
    setWorkers([...swarm.workers]);

    setFeatureVector(null);
    setRawDetails(null);
    setQueenSignal({
      timestamp: Date.now(),
      asset: SUPPORTED_ASSETS[0].name,
      direction: 'HOLD',
      confidence: 0,
      consensus: 0,
      status: 'FEED_OFFLINE_HOLD',
      evidence: ['Zero simulation mode active: Waiting for real Quotex stream via Chrome extension'],
      upVotes: 0,
      downVotes: 0,
      holdVotes: 20,
      totalWorkers: 20,
      cooldownRemaining: 0,
      reasons: ['No simulated data or chart displayed until real extension connects']
    });

    addLog('INIT', 'OTC Swarm Queen initialized in Zero-Simulation Mode. Chart is blank awaiting real Quotex ticks.', 'INFO', 'CORE_INIT');

    // Setup Localhost WebSocket integration
    socket.connect();
    socket.on('STATUS_CHANGE', (payload: any) => {
      setConnectionStatus(payload.status);
      addLog('WEBSOCKET', `Backend connection status: ${payload.status}`, payload.status === 'CONNECTED' ? 'SUCCESS' : 'WARN', 'WEBSOCKET');
    });

    socket.on('TICK', (tick: any) => {
      if (tick && tick.price) {
        setCurrentPrice(tick.price);
        setDataAgeMs(Math.max(10, Date.now() - (tick.timestamp || Date.now())));
      }
    });

    socket.on('DIAGNOSTIC_LOG', (entry: any) => {
      // socketClient already unwraps the { type, payload } envelope, so `entry` IS the
      // log entry itself ({ id, timestamp, level, type, source, message, ... }).
      if (entry && (entry.message || entry.type)) {
        setLogs((prev) => [
          {
            id: entry.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            timestamp: entry.timestamp || Date.now(),
            type: entry.type || 'DIAGNOSTIC',
            message: entry.message || '',
            level: entry.level || 'INFO',
            source: entry.source || 'CHROME_EXTENSION',
            asset: entry.asset,
            price: entry.price
          },
          ...prev.slice(0, 150)
        ]);
      }
    });

    // Ingest real Quotex ticks and build genuine candles
    const ingestRealTick = (asset: string, price: number, extraFeed?: any) => {
      if (!price || isNaN(price) || price <= 0) return;

      const now = Date.now();
      setConnectionStatus('CONNECTED');
      setLastLiveIngestAt(now);
      setCurrentPrice(price);

      if (asset) {
        const standardPair = asset.replace(/\s+/g, ' ').trim();
        setCurrentAsset((prev) => {
          if (prev !== standardPair) {
            addLog('PAIR_SYNC', `Active Quotex pair synchronized: ${standardPair}`, 'SUCCESS', 'QUOTEX_INTERCEPTOR', standardPair, price);
          }
          return standardPair;
        });
      }

      setRecentTicks((prev) => [
        { asset: asset || currentAssetRef.current, price, timestamp: now },
        ...prev.slice(0, 25)
      ]);
      setTotalTickCount((c) => c + 1);

      // Adopt the extension's raw Quotex candle history immediately so the SMC engine
      // starts with real structure (60–120 closed candles) instead of waiting for the
      // tick aggregator to accumulate them one by one.
      if (Array.isArray(extraFeed?.candles) && extraFeed.candles.length >= 5) {
        const formatted: Candle[] = extraFeed.candles.map((c: any, idx: number) => ({
          id: `c_ws_${c.time || idx}`,
          asset: asset || currentAssetRef.current,
          timeframe: timeframe,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 100),
          timestamp: Number(c.time || Date.now()),
          closed: idx < extraFeed.candles.length - 1
        }));
        // Keep only the most recent window the engines can work with.
        const window = formatted.slice(-120);
        setCandles(window);
        // Hand the feed's still-open candle to the tick aggregator so it is CONTINUED
        // rather than duplicated: without this, the aggregator would start a second
        // candle for the same period and the engines would see both.
        const feedOpenCandle = window[window.length - 1];
        if (feedOpenCandle && !feedOpenCandle.closed) {
          realCandleBuildingRef.current = { ...feedOpenCandle };
        }
      }

      // Aggregate running live ticks into true real candles
      let cur = realCandleBuildingRef.current;
      if (!cur || now - cur.timestamp >= timeframe * 1000) {
        if (cur) {
          cur.closed = true;
          // Once enough REAL candles exist, drop the bootstrap seed candles —
          // they are synthetic and pollute SMC structure detection.
          setCandles((prev) => {
            const next = [...prev.slice(-120), cur!];
            const realCandles = next.filter((c) => !String(c.id).startsWith('seed_'));
            return realCandles.length >= 15 ? realCandles : next;
          });
          addLog(
            'CANDLE_CLOSED',
            `Closed real ${timeframe}s candle on ${asset || currentAssetRef.current}: O=${cur.open.toFixed(5)} H=${cur.high.toFixed(5)} L=${cur.low.toFixed(5)} C=${cur.close.toFixed(5)}`,
            'INFO',
            'REAL_CANDLE_BUILDER',
            asset || currentAssetRef.current,
            price
          );

          // Self-training loop: settle the newest vision prediction made during this
          // candle against the real close, then retrain every fly that followed it.
          const closedAsset = asset || currentAssetRef.current;
          const actualDir: 'UP' | 'DOWN' | 'DRAW' = cur.close > cur.open ? 'UP' : cur.close < cur.open ? 'DOWN' : 'DRAW';
          const candleKey = `ck_${closedAsset}_${Math.floor(cur.timestamp / Math.max(1, timeframe * 1000))}`;
          const settled = visionRef.current?.settleOutcome(closedAsset, candleKey, actualDir, now);
          if (settled) {
            const visionDir = settled.scan.signal === 'NONE' ? null : settled.scan.signal;
            const trained = swarmRef.current?.adaptVisionWeights(visionDir, actualDir) ?? 0;
            addLog(
              'VISION_LEARNING',
              `Mistral vision settled on ${closedAsset}: predicted ${settled.scan.signal}, actual ${actualDir} → ${settled.correct ? 'CORRECT ✓' : 'WRONG ✗'}. ${trained} flies retrained their visionWeight.`,
              settled.correct ? 'SUCCESS' : 'WARN',
              'MISTRAL_VISION',
              closedAsset,
              price
            );
            fetch('/api/vision/outcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ asset: closedAsset, scanId: settled.scan.id, actual: actualDir })
            }).catch(() => {});
            const acc = visionRef.current!.accuracySnapshot(closedAsset);
            setVisionAccuracy(acc);
            setVisionHistory(visionRef.current!.scanHistory(closedAsset));
            persistSwarm();
          }
        }
        cur = {
          id: `c_${now}`,
          asset: asset || currentAssetRef.current,
          timeframe: timeframe,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1,
          closed: false,
          timestamp: now
        };
        realCandleBuildingRef.current = cur;
      } else {
        cur.close = price;
        cur.high = Math.max(cur.high, price);
        cur.low = Math.min(cur.low, price);
        cur.volume = (cur.volume || 0) + 1;
      }

      if (extraFeed?.queenSignal) {
        const q = extraFeed.queenSignal;
        const mapped = mapLiveSignal(q, asset || currentAssetRef.current);
        livePairSignalsRef.current[mapped.asset] = mapped;
        // Only the FOCUSED pair's signal may drive the dashboard display.
        if (!asset || mapped.asset === asset) {
          setQueenSignal(mapped);
        }
      }
      if (extraFeed?.pairSignals && typeof extraFeed.pairSignals === 'object') {
        // Keep every pair's own signal so switching pairs shows the right one instantly.
        Object.entries(extraFeed.pairSignals).forEach(([pair, sig]) => {
          livePairSignalsRef.current[pair] = mapLiveSignal(sig, pair);
        });
      }
      if (extraFeed?.smc) {
        setFeatureVector(extraFeed.smc);
      }
      if (extraFeed?.workers && extraFeed.workers.length > 0) {
        const fullWorkers: WorkerFly[] = extraFeed.workers.map((w: any, i: number) => {
          const rawVote = w.vote || w.lastDecision?.decision || 'HOLD';
          const voteDec = rawVote === 'CALL' || rawVote === 'UP' ? 'UP' : rawVote === 'PUT' || rawVote === 'DOWN' ? 'DOWN' : 'HOLD';
          // Unknown history stays unknown: zero counters instead of fabricated stats.
          const rawEff = typeof w.efficiencyScore === 'number' ? w.efficiencyScore : 0;
          const eff100 = Math.round(rawEff <= 1 ? rawEff * 100 : rawEff);
          return {
            id: w.id || i + 1,
            generation: w.generation || 1,
            health: w.health ?? 0,
            fitness: w.fitness ?? 0,
            status: (w.status as any) || 'ACTIVE',
            totalSignals: w.totalSignals ?? 0,
            wins: w.wins ?? 0,
            losses: w.losses ?? 0,
            holds: w.holds ?? 0,
            consecutiveLosses: w.consecutiveLosses ?? 0,
            consecutiveHolds: 0,
            winRate: w.winRate ?? 0,
            dna: w.dna || {
              version: 1,
              liquidityWeight: 0.85,
              orderBlockWeight: 0.90,
              fvgWeight: 0.75,
              structureWeight: 0.80,
              candleWeight: 0.70,
              trendWeight: 0.85,
              displacementWeight: 0.78,
              minConfluence: 0.65,
              preferredRegime: 'TRENDING',
              maxRiskScore: 0.35,
              confirmationRequired: true
            },
            lastDecision: {
              workerId: w.id || i + 1,
              decision: voteDec,
              confidence: w.confidence ?? 0,
              evidence: ['Real Quotex sub-second tick analysis'],
              dnaVersion: 1,
              reason: `${w.name || 'Worker Fly'} vote on live quote`
            },
            recentOutcomes: Array.isArray(w.recentOutcomes) ? w.recentOutcomes : [],
            failurePatterns: [],
            consensusVotes: w.consensusVotes ?? 0,
            totalVotes: w.totalVotes ?? 0,
            consensusRate: w.consensusRate ?? 0,
            replacementCount: w.replacementCount ?? 0,
            efficiencyScore: eff100,
            archetype: w.name
          };
        });
        setWorkers(fullWorkers);
      }
    };

    socket.on('LIVE_QUOTEX_INGEST', (feed: any) => {
      if (!feed) return;
      if (feed.lastError) {
        addLog('PAIR_DETECTION', feed.lastError, 'ERROR', 'QUOTEX_EXTENSION');
      }
      if (feed.asset && feed.currentPrice) {
        ingestRealTick(feed.asset, feed.currentPrice, feed);
      }
      if (feed.activePairs) {
        setMultiPairs(feed.activePairs);
      }
    });

    socket.on('MULTI_PAIR_UPDATE', (pairs: any) => {
      if (pairs && typeof pairs === 'object') {
        setMultiPairs(pairs);
      }
    });

    // Mistral vision scan broadcast from the server (extension capture or manual upload)
    socket.on('VISION_UPDATE', (scan: any) => {
      if (!scan || !scan.asset) return;
      const normalized: VisionScan = {
        id: scan.id || `vis_${scan.timestamp || Date.now()}`,
        asset: scan.asset,
        timestamp: scan.timestamp || Date.now(),
        source: scan.source || 'EXTENSION_CAPTURE',
        thumbnail: scan.thumbnail,
        priceAtScan: scan.priceAtScan,
        model: scan.model,
        trend: scan.trend || 'UNKNOWN',
        momentum: scan.momentum || 'NEUTRAL',
        volatility: scan.volatility || 'MEDIUM',
        structure: scan.structure || '',
        patterns: Array.isArray(scan.patterns) ? scan.patterns : [],
        support: scan.support ?? null,
        resistance: scan.resistance ?? null,
        candleRead: scan.candleRead || scan.candle_read || '',
        signal: scan.signal === 'UP' ? 'UP' : scan.signal === 'DOWN' ? 'DOWN' : 'NONE',
        confidence: typeof scan.confidence === 'number' ? scan.confidence : 0.5,
        reasoning: Array.isArray(scan.reasoning) ? scan.reasoning : []
      };
      visionRef.current?.recordScan(normalized);
      setVisionScan(normalized);
      setVisionHistory(visionRef.current?.scanHistory(normalized.asset) || [normalized]);
      // The scan landed — release the "SCANNING…" button immediately instead of leaving
      // it stuck until the request timeout expires.
      setVisionScanQueued(false);
      addLog(
        'VISION_SCAN',
        `Mistral vision scan ${normalized.signal} (${Math.round(normalized.confidence * 100)}%) on ${normalized.asset} — ${normalized.trend}, ${normalized.momentum}. Verdict merged into all 20 flies.`,
        normalized.signal === 'NONE' ? 'INFO' : 'SUCCESS',
        'MISTRAL_VISION',
        normalized.asset
      );
    });

    socket.on('VISION_ACCURACY', (payload: any) => {
      if (!payload || !payload.asset) return;
      const snap = visionRef.current?.accuracySnapshot(payload.asset);
      if (snap && snap.total > 0) setVisionAccuracy(snap);
    });

    // In-tab bridge event listener directly from Chrome Extension content script
    const handleInTabQuotexFeed = (event: any) => {
      const feed = event.detail || event.data?.payload;
      if (!feed) return;
      // ANY bridge message proves the extension is alive — even one that carries no
      // price yet (pair switching, pre-detection ping, feed error).
      extensionPresenceRef.current.lastTabMessageAt = Date.now();
      if (feed.lastError) {
        addLog('PAIR_DETECTION', feed.lastError, 'ERROR', 'QUOTEX_EXTENSION');
      }
      if (feed.asset && feed.currentPrice) {
        ingestRealTick(feed.asset, feed.currentPrice, feed);
      }
      // Pop a new-signal card for the focused pair and for every other open pair that
      // just produced a directional verdict (HOLDs / warm-up stubs are ignored inside).
      if (feed.asset && feed.queenSignal) {
        pushSignalToast(feed.asset, feed.queenSignal, 'QUOTEX_LIVE');
      }
      if (feed.pairSignals && typeof feed.pairSignals === 'object') {
        Object.entries(feed.pairSignals).forEach(([pair, sig]) => {
          pushSignalToast(pair, sig as any, 'QUOTEX_LIVE');
        });
      }
      if (feed.activePairs) {
        setMultiPairs(feed.activePairs);
      }
    };

    const handleDiagnosticLog = (event: any) => {
      const entry = event.detail || event.data?.payload;
      if (!entry) return;
      extensionPresenceRef.current.lastTabMessageAt = Date.now();
      setLogs((prev) => [
        {
          id: entry.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          timestamp: entry.timestamp || Date.now(),
          type: entry.type || 'DIAGNOSTIC',
          message: entry.message || '',
          level: entry.level || 'INFO',
          source: entry.source || 'CHROME_EXTENSION',
          asset: entry.asset,
          price: entry.price
        },
        ...prev.slice(0, 150)
      ]);
    };

    window.addEventListener('OTC_QUOTEX_LIVE_FEED', handleInTabQuotexFeed);
    window.addEventListener('OTC_DIAGNOSTIC_LOG', handleDiagnosticLog);
    const handleWindowMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'OTC_QUOTEX_LIVE_FEED') {
        handleInTabQuotexFeed(ev);
      }
      if (ev.data && ev.data.type === 'OTC_DIAGNOSTIC_LOG') {
        handleDiagnosticLog(ev);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    // Periodic check on server's latest state
    const pollServerState = async () => {
      try {
        const res = await fetch('/api/swarm/state');
        if (res.ok) {
          const s = await res.json();
          if (s.activePairs && typeof s.activePairs === 'object') {
            setMultiPairs(s.activePairs);
          }

          // Extension heartbeat reported by the server: the extension background worker
          // polls the scan queue every ~4s whenever Chrome is running (even with no
          // Quotex tab open), so this only proves the EXTENSION PROCESS is alive — it is
          // deliberately NOT treated as fresh ticks. It is what separates WAITING from
          // NOT_INSTALLED without ever faking a live stream.
          const ext = s.extension;
          if (ext && typeof ext.ageMs === 'number') {
            const presence = extensionPresenceRef.current;
            presence.serverAlive = Boolean(ext.alive);
            if (ext.alive) presence.serverHeartbeatAt = Date.now();
          }

          // All freshness math below uses the SERVER's own clock (serverTime vs the
          // timestamps the server stamped) so clock skew between this browser and a
          // remote server can never make a dead feed look live or vice versa.
          const serverNow = typeof s.serverTime === 'number' ? s.serverTime : Date.now();

          // NEVER replay the last known price of a dead feed as if it were a live tick.
          // A frozen price keeps every candle dead-flat, so the swarm reads a flat market
          // and wedges on HOLD forever ("no signal") while the banner still claims a live
          // stream. Only genuinely fresh server ticks may drive the engine.
          const serverTickAgeMs = s.lastTickTime ? serverNow - s.lastTickTime : -1;
          const serverTickFresh = serverTickAgeMs >= 0 && serverTickAgeMs < 8000;
          if (s.dataSource === 'QUOTEX_LIVE' && s.asset && s.currentPrice > 0 && serverTickFresh) {
            ingestRealTick(s.asset, s.currentPrice, s);
          } else if (serverTickAgeMs >= 0) {
            setDataAgeMs(serverTickAgeMs);
          }

          // Fallback new-signal detection: when the extension cannot push into this tab
          // (different origin, page not yet loaded) the server still knows every pair's
          // verdict, so the popups keep working from the polled state.
          if (s.activePairs && typeof s.activePairs === 'object') {
            Object.entries(s.activePairs).forEach(([pair, info]: any) => {
              const sig = info && info.queenSignal;
              if (!sig) return;
              if (sig.timestamp && Date.now() - sig.timestamp > 12000) return; // stale
              pushSignalToast(pair, sig, 'QUOTEX_LIVE');
            });
          }
          if (s.pairSignals && typeof s.pairSignals === 'object') {
            Object.entries(s.pairSignals).forEach(([pair, sig]: any) => {
              if (!sig) return;
              if (sig.timestamp && Date.now() - sig.timestamp > 12000) return;
              pushSignalToast(pair, sig, 'QUOTEX_LIVE');
            });
          }
          if (Array.isArray(s.systemErrorLogs) && s.systemErrorLogs.length > 0) {
            setLogs((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newItems = s.systemErrorLogs.filter((l: any) => !existingIds.has(l.id));
              if (newItems.length === 0) return prev;
              return [...newItems, ...prev].slice(0, 150);
            });
          }
          // Vision fallback sync (in case a VISION_UPDATE broadcast was missed)
          const latestRemote = s.vision?.latest;
          if (latestRemote && s.vision.configured) {
            const localScan = visionRef.current?.latestScan(latestRemote.asset);
            if (!localScan || latestRemote.timestamp > localScan.timestamp) {
              const normalized: VisionScan = {
                id: latestRemote.id || `vis_${latestRemote.timestamp}`,
                asset: latestRemote.asset,
                timestamp: latestRemote.timestamp || Date.now(),
                source: latestRemote.source || 'EXTENSION_CAPTURE',
                thumbnail: latestRemote.thumbnail,
                priceAtScan: latestRemote.priceAtScan,
                model: latestRemote.model,
                trend: latestRemote.trend || 'UNKNOWN',
                momentum: latestRemote.momentum || 'NEUTRAL',
                volatility: latestRemote.volatility || 'MEDIUM',
                structure: latestRemote.structure || '',
                patterns: Array.isArray(latestRemote.patterns) ? latestRemote.patterns : [],
                support: latestRemote.support ?? null,
                resistance: latestRemote.resistance ?? null,
                candleRead: latestRemote.candleRead || '',
                signal: latestRemote.signal === 'UP' ? 'UP' : latestRemote.signal === 'DOWN' ? 'DOWN' : 'NONE',
                confidence: typeof latestRemote.confidence === 'number' ? latestRemote.confidence : 0.5,
                reasoning: Array.isArray(latestRemote.reasoning) ? latestRemote.reasoning : []
              };
              visionRef.current?.recordScan(normalized);
              setVisionScan(normalized);
              // Same as the VISION_UPDATE path: the verdict arrived, so the queued state
              // must clear now (not 30s later).
              setVisionScanQueued(false);
            }
          }
          // Extension presence: the Quotex tab streams feeds even while a pair's price
          // is still 0 (pre-first-tick), so ANY fresh active pair proves the bridge is up.
          // This only refreshes PRESENCE — it must not fake a live tick (that is what kept
          // the header green over a dead feed, see the freshness gate above).
          const pairs = Object.values(s.activePairs || {}) as any[];
          const anyFreshPair = pairs.some((p) => p.lastTickTime && serverNow - p.lastTickTime < 12000);
          if (anyFreshPair) {
            extensionPresenceRef.current.lastTabMessageAt = Date.now();
            setConnectionStatus('CONNECTED');
          }
        }
      } catch (e) {}
    };

    const pollInterval = setInterval(pollServerState, 1500);

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
      window.removeEventListener('OTC_QUOTEX_LIVE_FEED', handleInTabQuotexFeed);
      window.removeEventListener('OTC_DIAGNOSTIC_LOG', handleDiagnosticLog);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [timeframe]);

  // Live Extension Connection Heartbeat Monitor
  useEffect(() => {
    const checkExtLive = () => {
      const now = Date.now();
      const presence = extensionPresenceRef.current;

      // 1. Real ticks (in-tab push OR any bridge message) — the strongest signal.
      const feedFresh =
        (lastLiveIngestAt > 0 && now - lastLiveIngestAt < 6500) ||
        now - presence.lastTabMessageAt < 6500;
      if (feedFresh) {
        presence.misses = 0;
        setExtensionStatus('LIVE_STREAMING');
        return;
      }

      // 2. Extension is alive but quiet (pair switch, chart tab in the background,
      //    capture pause). That is NOT "not installed" — report it as WAITING.
      const serverHeartbeatFresh = presence.serverAlive && now - presence.serverHeartbeatAt < 15000;
      const recentlySeen =
        serverHeartbeatFresh ||
        now - presence.lastTabMessageAt < 30000 ||
        (lastLiveIngestAt > 0 && now - lastLiveIngestAt < 30000);
      if (recentlySeen) {
        presence.misses = 0;
        setExtensionStatus('WAITING');
        return;
      }

      // 3. Only after several consecutive dead checks (~4.5s) do we admit the extension
      //    is really missing. This hysteresis is what removes the flapping.
      presence.misses += 1;
      if (presence.misses >= 3) setExtensionStatus('NOT_INSTALLED');
    };
    checkExtLive();
    const interval = setInterval(checkExtLive, 1500);
    return () => clearInterval(interval);
  }, [lastLiveIngestAt]);

  // Main Live Tick Loop (ZERO-SIMULATION: Strictly real market ticks or hold)
  useEffect(() => {
    const interval = setInterval(() => {
      const smc = smcRef.current;
      const swarm = swarmRef.current;
      const paper = paperRef.current;
      const vision = visionRef.current;

      if (!smc || !swarm || !paper || !vision) return;

      // ZERO SIMULATION POLICY: Verify live Quotex stream presence
      const isLiveFeedActive = lastLiveIngestAt > 0 && (Date.now() - lastLiveIngestAt < 15000);

      // Before the very first real tick there is no price and no candle — hold instead
      // of letting the engine evaluate an empty/fabricated market. Do NOT touch
      // connectionStatus here: it reports the SERVER WebSocket, not the Quotex feed
      // (the DemoBanner already communicates the feed-waiting state).
      if (!isLiveFeedActive && lastLiveIngestAt === 0) {
        return;
      }

      // connectionStatus is owned by the socket STATUS_CHANGE handler / poll loop —
      // the Header badge reads it as "SERVER: ONLINE/OFFLINE", so the feed's freshness
      // state must never overwrite it here.

      // Build active candles array from committed candles plus open candle
      let activeCandles = [...candles];
      if (realCandleBuildingRef.current) {
        activeCandles = [...candles, { ...realCandleBuildingRef.current }];
      }

      setDataAgeMs(Math.max(15, lastLiveIngestAt > 0 ? Date.now() - lastLiveIngestAt : 50));

      // SMC Confluence Analysis on Real Market Context, then merge the freshest
      // Mistral vision verdict so EVERY fly evaluates the same combined evidence.
      const { fv, raw } = smc.process(activeCandles, currentAsset, timeframe);
      const fvCombined = vision.mergeIntoFeatureVector(currentAsset, fv);
      setFeatureVector(fvCombined);
      setRawDetails(raw);

      // Swarm & Queen Evaluation
      swarm.minConsensus = consensusThreshold;
      swarm.minQueenConfidence = minConfidence;
      swarm.cooldownSeconds = cooldownSeconds;
      swarm.minPaperTradesValidation = minTradesForValidation;

      const stats = paper.getStatistics();
      const swarmRes = swarm.evaluateSwarm(fvCombined, raw, stats);
      setQueenSignal(swarmRes.queen);
      setWorkers([...swarm.workers]);

      // Prefer the extension's LIVE verdict for the focused pair, but never let a
      // warming-up / zero-confidence stub mask a genuine directional verdict from the
      // local Queen engine — that combination is what left the panel stuck on
      // "GATHERING DATA..." (0% confidence) while the engine actually had a real read.
      // A genuine HOLD coming from the extension is still honoured.
      const liveSignal = livePairSignalsRef.current[currentAsset] ||
        (multiPairsRef.current[currentAsset] && multiPairsRef.current[currentAsset].queenSignal);
      const liveSignalFresh = Boolean(liveSignal && Date.now() - (liveSignal.timestamp || 0) < 8000);
      const liveMapped = liveSignalFresh ? mapLiveSignal(liveSignal, currentAsset) : null;
      const liveWarmingUp = Boolean(liveSignal && (liveSignal.warmingUp || liveSignal.status === 'WARMING_UP'));
      const liveIsUsable = Boolean(liveMapped && !liveWarmingUp && (liveMapped.confidence || 0) > 0);
      const localIsDirectional = swarmRes.queen.direction !== 'HOLD' && (swarmRes.queen.confidence || 0) > 0;

      // Higher-timeframe confirmation: an M1 signal running AGAINST the M5 trend (or
      // M5 against M15, etc.) is far more often a countertrend trap than a reversal.
      // NEUTRAL = not enough data → the filter stays silent.
      const htfTrend = smc.higherTimeframeTrend(activeCandles, timeframe === 60 ? 5 : timeframe === 300 ? 3 : 2);
      const htfLabel = timeframe === 60 ? 'M5' : timeframe === 300 ? 'M15' : 'M30';
      const applyMtfFilter = (sig: QueenSignal | null): QueenSignal | null => {
        if (!sig || (sig.direction !== 'UP' && sig.direction !== 'DOWN')) return sig;
        if (htfTrend === 'NEUTRAL' || (sig.direction === 'UP' ? htfTrend === 'BULLISH' : htfTrend === 'BEARISH')) return sig;
        return {
          ...sig,
          direction: 'HOLD',
          status: 'MTF_CONFLICT_HOLD',
          confidence: 0,
          evidence: [
            ...(sig.evidence || []).slice(0, 3),
            `MTF_FILTER: ${sig.direction} conflicts with ${htfLabel} trend ${htfTrend}`
          ],
          reasons: [`Higher-timeframe (${htfLabel}) trend is ${htfTrend}, opposing the ${sig.direction} signal — countertrend entry suppressed.`]
        };
      };

      if (liveIsUsable) {
        setQueenSignal(applyMtfFilter(liveMapped!));
      } else if (localIsDirectional) {
        setQueenSignal(applyMtfFilter(swarmRes.queen));
      } else if (liveMapped) {
        setQueenSignal(applyMtfFilter(liveMapped));
      }

      // Paper trades follow the local Queen verdict, passed through the same
      // higher-timeframe filter so a countertrend signal can never open a contract.
      const paperQueen = applyMtfFilter(swarmRes.queen) || swarmRes.queen;

      // Publish the combined Queen verdict so the extension HUD/popup can display the
      // same next-candle signal (SMC + vision + swarm consensus + MTF filter).
      if (Date.now() - lastCombinedPublishRef.current > 2000 && currentPrice > 0) {
        lastCombinedPublishRef.current = Date.now();
        fetch('/api/swarm/queen-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queenSignal: paperQueen, asset: currentAsset })
        }).catch(() => {});
      }

      // Paper Trade Settlements on Real Price
      const settled = paper.checkExpiries(currentPrice);
      if (settled.length > 0) {
        settled.forEach((st) => {
          // QUICK_SIGNAL trades carry no directional worker votes — attribute the
          // outcome to each fly's DNA against the dispatch-time feature vector.
          const attributionFv = st.signalStatus === 'QUICK_SIGNAL' ? swarm.getLastDispatchFv() : null;
          swarm.settleTradeOutcomes(st.direction, st.status as any, st.regime, st.asset, st.smcEvidence, attributionFv);
          addLog(
            'PAPER_TRADE',
            `Contract ${st.direction} on ${st.asset} expired: ${st.status} (Entry: ${st.entryPrice.toFixed(5)}, Exit: ${st.exitPrice?.toFixed(5)}, PnL: ${st.pnl > 0 ? '+' : ''}$${st.pnl.toFixed(2)})`,
            st.status === 'WIN' ? 'SUCCESS' : 'ERROR',
            'PAPER_TRADER',
            st.asset,
            currentPrice
          );
        });
        setActivePaperTrades([...paper.activeTrades]);
        setRecentPaperTrades([...paper.closedTrades]);
        setPaperStats(paper.getStatistics());
        setGraveyard([...swarm.graveyard]);
        setPatterns(Array.from(swarm.patterns.values()));
      }

      // If Queen emits VALIDATED_SIGNAL, automatically enter paper contract
      // (never on a stale/unknown price — zero-simulation policy, and only when the
      // higher-timeframe filter has not suppressed the signal).
      if (currentPrice > 0 && (paperQueen.status === 'VALIDATED_SIGNAL' || paperQueen.status === 'PAPER_SIGNAL' || paperQueen.status === 'QUICK_SIGNAL')) {
        const opened = paper.openTrade(paperQueen, currentPrice, fvCombined.regime);
        if (opened) {
          swarm.recordSignalDispatched(fvCombined);
          setActivePaperTrades([...paper.activeTrades]);
          persistSwarm();
          addLog(
            'QUEEN_UPDATE',
            `Queen Fly emitted ${opened.direction} signal (${Math.round(paperQueen.confidence * 100)}% conf, ${Math.round(paperQueen.consensus * 100)}% consensus). 60s paper trade executed on real quote.`,
            'SUCCESS',
            'SWARM_QUEEN',
            currentAsset,
            currentPrice
          );
          // Pop the same new-signal card the extension signals get, so a locally
          // dispatched Queen verdict is announced just as loudly.
          pushSignalToast(
            opened.asset || currentAsset,
            {
              direction: opened.direction,
              confidence: opened.queenConfidence ?? paperQueen.confidence,
              power: paperQueen.power,
              upVotes: paperQueen.upVotes,
              downVotes: paperQueen.downVotes,
              totalWorkers: paperQueen.totalWorkers,
              candleKey: Math.floor(Date.now() / 60000),
              candleExpiryTimer: paperQueen.candleExpiryTimer
            },
            'SWARM_QUEEN'
          );
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [candles, consensusThreshold, minConfidence, cooldownSeconds, minTradesForValidation, lastLiveIngestAt, currentAsset, currentPrice, timeframe]);

  // Asset Switch Handler
  const handleAssetChange = (assetId: string) => {
    const assetObj = findAsset(assetId);
    // Store the canonical display name ('USD/INR (OTC)') — per-pair live-signal caches
    // and the extension bridge are keyed by name, not by asset id.
    setCurrentAsset(assetObj.name);

    // ZERO SIMULATION: Clear chart and wait for real Quotex stream for new asset
    setCandles([]);
    realCandleBuildingRef.current = null;
    setFeatureVector(null);
    setRawDetails(null);
    // Zero-simulation: no price exists for the new pair until a real tick arrives.
    setCurrentPrice(0);

    // Show this pair's cached vision scan (if any) so the vision panel follows the pair.
    const cachedVision = visionRef.current?.latestScan(assetObj.name) || null;
    setVisionScan(cachedVision);
    setVisionHistory(visionRef.current?.scanHistory(assetObj.name) || []);
    setVisionAccuracy(visionRef.current?.accuracySnapshot(assetObj.name) || { ewma: 0.5, trust: 0.5, total: 0, correct: 0 });

    addLog('ASSET_SWITCH', `Switched target pair to ${assetObj.name}. Chart cleared, awaiting live Quotex ticks.`, 'INFO', 'ASSET_MANAGER', assetObj.name);

    // Ask the extension bridge to switch the Quotex tab (the single source of truth for
    // pairs), so this dashboard, the extension popup and the Quotex chart stay identical.
    window.dispatchEvent(new CustomEvent('OTC_SWITCH_PAIR', { detail: { asset: assetObj.name } }));
    window.postMessage({ type: 'QUOTEX_SWITCH_PAIR_COMMAND', asset: assetObj.name }, '*');

    // Show this pair's own cached live signal immediately, if we already have one.
    const cachedLiveSignal = livePairSignalsRef.current[assetObj.name];
    if (cachedLiveSignal) {
      setQueenSignal(cachedLiveSignal);
    }

    // Report the pair-change request WITHOUT any signal or price payload: injecting a
    // HOLD stub or the asset's static basePrice here used to fabricate a live tick for
    // a pair that has not streamed yet.
    fetch('/api/swarm/quotex-feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: assetObj.name,
        currentPrice: 0,
        feedStatus: 'WAITING_FOR_TICKS',
        pairChangeRequested: true,
        requestedAt: Date.now()
      })
    }).catch(() => {});
  };

  // Timeframe Switch Handler
  const handleTimeframeChange = (tfSec: number) => {
    setTimeframe(tfSec);
    // ZERO SIMULATION: Reset candle aggregator to aggregate real candles at new timeframe
    setCandles([]);
    realCandleBuildingRef.current = null;
    setFeatureVector(null);
    setRawDetails(null);
    addLog('TIMEFRAME', `Timeframe switched to ${tfSec}s. Real candle aggregator reset.`, 'INFO', 'TIMEFRAME_SWITCH');
  };

  // Request a fresh Mistral vision scan of the focused Quotex chart via the extension.
  const handleRequestVisionScan = () => {
    setVisionScanQueued(true);
    addLog('VISION_SCAN', `Vision scan queued for ${currentAsset}. Extension will capture & scan the chart.`, 'INFO', 'MISTRAL_VISION', currentAsset, currentPrice);
    // The capture only succeeds while a Quotex chart tab is the visible tab —
    // release the button with a clear hint if no capture arrives in time.
    // The capture only succeeds while a Quotex chart tab is the visible tab. The
    // extension now reports its own failures immediately (tab_hidden / capture_failed),
    // so this timer is only a last-resort release for a totally silent dispatch.
    window.setTimeout(() => {
      setVisionScanQueued((queued) => {
        if (queued) {
          addLog('VISION_SCAN', 'No scan verdict arrived. Check Logs & Errors — the extension reports the exact reason (hidden chart tab, unreachable content script, ...) when a capture fails.', 'WARN', 'MISTRAL_VISION');
        }
        return false;
      });
    }, 20000);
    fetch('/api/extension/scan-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: currentAsset })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'QUEUED') {
          addLog(
            'VISION_SCAN',
            data.deduplicated
              ? `Scan command ${data.command?.id} already in flight for ${currentAsset}. Waiting for that capture...`
              : `Scan command ${data.command?.id} queued on server. Waiting for extension capture...`,
            'INFO',
            'MISTRAL_VISION'
          );
        } else {
          addLog('VISION_SCAN', `Scan queue rejected: ${data.error || 'unknown error'}`, 'ERROR', 'MISTRAL_VISION');
          setVisionScanQueued(false);
        }
      })
      .catch((err) => {
        addLog('VISION_SCAN', `Failed to queue scan: ${err.message}`, 'ERROR', 'MISTRAL_VISION');
        setVisionScanQueued(false);
      });
  };

  // Ask Mistral for a narrative explanation of the current Queen decision.
  const handleExplainWithAI = () => {
    if (!queenSignal) return;
    addLog('AI_EXPLAIN', 'Requesting Mistral explanation of the Queen decision...', 'INFO', 'MISTRAL_AI');
    fetch('/api/mistral/explain-queen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queenSignal: { ...queenSignal, asset: currentAsset },
        featureVector,
        workers: workers.slice(0, 5),
        regime: featureVector?.regime || 'RANGE'
      })
    })
      .then((r) => r.json())
      .then((data) => {
        addLog('AI_EXPLAIN', data.explanation || data.error || 'No explanation returned', data.error ? 'ERROR' : 'SUCCESS', 'MISTRAL_AI');
      })
      .catch((err) => {
        addLog('AI_EXPLAIN', `Explanation failed: ${err.message}`, 'ERROR', 'MISTRAL_AI');
      });
    setActiveTab('vision');
  };

  // Test Ping for Localhost Extension & Browser Bridge
  const handleSendTestPing = () => {
    addLog('TEST_PING', 'Sending diagnostic ping to extension and background worker...', 'INFO', 'PING_TEST');
    window.dispatchEvent(new CustomEvent('OTC_REQUEST_EXTENSION_STATE'));
    window.postMessage({ type: 'OTC_REQUEST_EXTENSION_STATE' }, '*');
    if (socketRef.current) {
      socketRef.current.send('PING', { client: 'WEB_DASHBOARD', timestamp: Date.now() });
    }
    fetch('/api/swarm/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'INFO',
        type: 'MANUAL_PING',
        source: 'WEB_APP_USER',
        message: `Diagnostic ping dispatched. Current asset=${currentAsset}, Price=${currentPrice}`
      })
    })
      .then(() => {
        addLog('TEST_PING_SUCCESS', 'Ping recorded on server. Waiting for Quotex tab response.', 'SUCCESS', 'PING_TEST');
      })
      .catch((err) => {
        addLog('TEST_PING_ERROR', `Ping to server failed: ${err.message}`, 'ERROR', 'PING_TEST');
      });
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-sky-500 selection:text-white">
        {/* Real-time Data Stream Status Banner */}
        <DemoBanner
          isFeedStreaming={connectionStatus === 'CONNECTED' && Date.now() - lastLiveIngestAt < 6000}
          currentAsset={currentAsset}
          currentPrice={currentPrice}
          lastTickTime={lastLiveIngestAt}
          onOpenLogs={() => setActiveTab('logs')}
          onOpenExtensionModal={() => setShowExtensionModal(true)}
        />

        {/* Main Top Header */}
        <Header
          currentAsset={currentAsset}
          onAssetChange={handleAssetChange}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          connectionStatus={connectionStatus}
          extensionStatus={extensionStatus}
          currentPrice={currentPrice}
          dataAgeMs={dataAgeMs}
          onOpenExtensionModal={() => setShowExtensionModal(true)}
          multiPairs={multiPairs}
        />

        {/* High-Density Navigation Tabs */}
        <Navigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          activePaperTradesCount={activePaperTrades.length}
          graveyardCount={graveyard.length}
          queenStatus={queenSignal?.status || 'NO_SIGNAL'}
          errorCount={logs.filter((l) => l.level === 'ERROR').length}
        />

        {/* Active Tab View Rendering */}
        <main className="flex-1 pb-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              candles={candles}
              swings={rawDetails?.structure.swings || []}
              liquidityZones={rawDetails?.liquidity.activeZones || []}
              orderBlocks={rawDetails?.orderBlocks.allOBs || []}
              fvgs={rawDetails?.fvg.allFVGs || []}
              featureVector={featureVector}
              rawDetails={rawDetails}
              workers={workers}
              queenSignal={queenSignal}
              activePaperTrades={activePaperTrades}
              recentPaperTrades={recentPaperTrades}
              paperStats={paperStats}
              currentPrice={currentPrice}
              onExplainWithAI={handleExplainWithAI}
              onOpenTradeHistory={() => setActiveTab('paper')}
              onOpenExtensionModal={() => setShowExtensionModal(true)}
              onOpenLogs={() => setActiveTab('logs')}
              extensionStatus={extensionStatus}
              visionScan={visionScan}
              visionAccuracy={visionAccuracy}
              onRequestVisionScan={handleRequestVisionScan}
              visionScanQueued={visionScanQueued}
            />
          )}

          {activeTab === 'market' && (
            <MarketView
              currentAsset={currentAsset}
              currentPrice={currentPrice}
              candles={candles}
              featureVector={featureVector}
              recentTicks={recentTicks}
            />
          )}

          {activeTab === 'smc' && (
            <SMCEngineView
              swings={rawDetails?.structure.swings || []}
              liquidityZones={rawDetails?.liquidity.activeZones || []}
              orderBlocks={rawDetails?.orderBlocks.allOBs || []}
              fvgs={rawDetails?.fvg.allFVGs || []}
              featureVector={featureVector}
              rawDetails={rawDetails}
            />
          )}

          {activeTab === 'swarm' && <SwarmView workers={workers} queenSignal={queenSignal} />}

          {activeTab === 'queen' && (
            <QueenView
              queenSignal={queenSignal}
              workers={workers}
              paperStats={paperStats}
              minTradesForValidation={minTradesForValidation}
            />
          )}

          {activeTab === 'paper' && (
            <PaperTradingView
              trades={recentPaperTrades}
              stats={paperStats}
              currentPrice={currentPrice}
            />
          )}

          {activeTab === 'graveyard' && <GraveyardView graveyard={graveyard} />}

          {activeTab === 'patterns' && <PatternMemoryView patterns={patterns} />}

          {activeTab === 'performance' && (
            <PerformanceView
              stats={paperStats}
              trades={recentPaperTrades}
              minTradesForValidation={minTradesForValidation}
            />
          )}

          {activeTab === 'vision' && (
            <VisionScanView
              visionScan={visionScan}
              visionHistory={visionHistory}
              visionAccuracy={visionAccuracy}
              currentAsset={currentAsset}
              currentPrice={currentPrice}
              connectionStatus={connectionStatus}
              onRequestVisionScan={handleRequestVisionScan}
              visionScanQueued={visionScanQueued}
              featureVector={featureVector}
              queenSignal={queenSignal}
            />
          )}

          {activeTab === 'extension' && (
            <ExtensionHubView
              connectionStatus={connectionStatus}
              extensionStatus={extensionStatus}
              onSendTestPing={handleSendTestPing}
              currentAsset={currentAsset}
              currentPrice={currentPrice}
              queenSignal={queenSignal}
              multiPairs={multiPairs}
              onSelectAsset={handleAssetChange}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              consensusThreshold={consensusThreshold}
              onConsensusChange={setConsensusThreshold}
              minConfidence={minConfidence}
              onMinConfidenceChange={setMinConfidence}
              cooldownSeconds={cooldownSeconds}
              onCooldownChange={setCooldownSeconds}
              minTradesForValidation={minTradesForValidation}
              onMinTradesChange={setMinTradesForValidation}
            />
          )}

          {activeTab === 'logs' && (
            <SystemLogsView
              logs={logs}
              onClearLogs={() => setLogs([])}
              connectionStatus={connectionStatus}
              currentAsset={currentAsset}
              currentPrice={currentPrice}
              lastTickTime={lastLiveIngestAt}
              tickCount={totalTickCount}
              queenStatus={queenSignal?.status || 'AWAITING_REAL_TICKS'}
              candlesCount={candles.length}
              onPingExtension={handleSendTestPing}
            />
          )}
        </main>

        {/* Extension Live Connection & Bridge Modal */}
        <ExtensionConnectModal
          isOpen={showExtensionModal}
          onClose={() => setShowExtensionModal(false)}
          currentAsset={currentAsset}
          onSelectAsset={handleAssetChange}
          currentPrice={currentPrice}
          connectionStatus={connectionStatus}
          lastIngestTime={lastLiveIngestAt}
        />

        {/* New-signal popups: pair name + UP/DOWN side, self-dismissing after ~4.5s */}
        <SignalToast toasts={signalToasts} onDismiss={dismissSignalToast} />
      </div>
    </ErrorBoundary>
  );
}
