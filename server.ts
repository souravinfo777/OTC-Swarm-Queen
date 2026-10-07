import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import JSZip from 'jszip';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Mistral AI (vision chart scanning + Queen explanations)
// Multi-key pool: MISTRAL_API_KEYS (comma separated) wins over the single MISTRAL_API_KEY.
// When one key hits its rate limit (429) or is rejected (401/403), callMistral rotates
// to the next key automatically and cools the rejected one down for 60s.
const MISTRAL_KEYS: string[] = Array.from(new Set([
  ...(process.env.MISTRAL_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean),
  (process.env.MISTRAL_API_KEY || '').trim()
].filter(Boolean)));
const MISTRAL_KEY_COOLDOWN_MS = 60_000;
const mistralKeyCooldownUntil = new Map<string, number>();
const MISTRAL_VISION_MODEL = process.env.MISTRAL_VISION_MODEL || 'ministral-8b-latest';
const MISTRAL_TEXT_MODEL = process.env.MISTRAL_TEXT_MODEL || 'open-mistral-nemo';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

function pickMistralKey(): string | null {
  const now = Date.now();
  for (const key of MISTRAL_KEYS) {
    if ((mistralKeyCooldownUntil.get(key) || 0) <= now) return key;
  }
  return null;
}

// Enable CORS for Chrome Extension and external origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// In-Memory Swarm State Store & Diagnostic Logs
let systemErrorLogs: any[] = [
  {
    id: `log_init_${Date.now()}`,
    timestamp: Date.now(),
    level: 'INFO',
    type: 'SERVER_BOOT',
    source: 'EXPRESS_SERVER',
    message: 'OTC Swarm Queen Server running in Zero-Simulation Mode. Awaiting Quotex live ticks.'
  }
];

let latestSwarmState: any = {
  connected: false,
  dataSource: 'QUOTEX_REAL_FEED',
  asset: null as string | null,
  // Zero-simulation: no price exists until a real extension tick arrives.
  currentPrice: 0,
  feedStatus: 'INITIALIZING',
  lastTickTime: 0,
  tickCount: 0,
  lastError: null,
  activePairs: {} as Record<string, any>,
  queenSignal: {
    direction: 'HOLD',
    confidence: 0,
    consensus: 0,
    status: 'AWAITING_REAL_TICKS',
    evidence: ['Awaiting real tick stream from Quotex Extension. Zero simulation mode active.'],
    upVotes: 0,
    downVotes: 0,
    holdVotes: 20
  },
  smc: {
    confluenceScore: 0,
    trend: 'WAITING_DATA',
    bos: false,
    choch: false,
    liquiditySweep: false
  },
  workers: [],
  paperTradesCount: 0,
  lastUpdated: Date.now()
};

// Push diagnostic log helper
function recordSystemLog(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', type: string, message: string, source = 'SERVER') {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: Date.now(),
    level,
    type,
    source,
    message
  };
  systemErrorLogs.unshift(entry);
  if (systemErrorLogs.length > 200) systemErrorLogs.pop();
  broadcastSwarmState({ type: 'DIAGNOSTIC_LOG', payload: entry, timestamp: Date.now() });
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mistral Vision Chart-Scan Store & Helpers
// ─────────────────────────────────────────────────────────────────────────────
interface VisionScanRecord {
  id: string;
  asset: string;
  timestamp: number;
  source: 'EXTENSION_CAPTURE' | 'MANUAL_UPLOAD';
  thumbnail?: string;
  priceAtScan?: number;
  model?: string;
  trend: string;
  momentum: string;
  volatility: string;
  structure: string;
  patterns: string[];
  support: number | null;
  resistance: number | null;
  candleRead: string;
  signal: 'UP' | 'DOWN' | 'NONE';
  confidence: number;
  reasoning: string[];
}

const visionScansByAsset: Record<string, VisionScanRecord[]> = {};
const visionStatsByAsset: Record<string, {
  correct: number;
  total: number;
  ewma: number;
  trust: number;
  recent: Array<{ scanId: string; predicted: string; actual: string; correct: boolean; at: number }>;
}> = {};
const lastVisionScanAt: Record<string, number> = {};
const VISION_SCAN_COOLDOWN_MS = 12_000;
const MAX_VISION_SCANS_PER_ASSET = 10;
const MAX_IMAGE_CHARS = 5 * 1024 * 1024; // ~5MB base64

function latestVisionScan(asset?: string): VisionScanRecord | null {
  if (asset) return visionScansByAsset[asset]?.[0] || null;
  let newest: VisionScanRecord | null = null;
  for (const list of Object.values(visionScansByAsset)) {
    if (list[0] && (!newest || list[0].timestamp > newest.timestamp)) newest = list[0];
  }
  return newest;
}

function visionSummary() {
  return {
    configured: MISTRAL_KEYS.length > 0,
    keys: MISTRAL_KEYS.length,
    model: MISTRAL_VISION_MODEL,
    latest: latestVisionScan(),
    assets: Object.fromEntries(Object.keys(visionScansByAsset).map((a) => {
      const st = visionStatsByAsset[a];
      const scan = visionScansByAsset[a][0];
      return [a, {
        signal: scan?.signal || 'NONE',
        confidence: scan?.confidence ?? 0,
        timestamp: scan?.timestamp || 0,
        accuracyEwma: Number((st?.ewma ?? 0.5).toFixed(3)),
        trust: Number((st?.trust ?? 0.5).toFixed(3)),
        settledTrades: st?.total ?? 0
      }];
    }))
  };
}

function recordVisionOutcome(asset: string, scanId: string, actual: 'UP' | 'DOWN' | 'DRAW') {
  const scans = visionScansByAsset[asset] || [];
  const scan = scans.find((s) => s.id === scanId) || scans[0];
  if (!scan || scan.signal === 'NONE') return null;
  const correct = actual !== 'DRAW' && scan.signal === actual;

  if (!visionStatsByAsset[asset]) {
    visionStatsByAsset[asset] = { correct: 0, total: 0, ewma: 0.5, trust: 0.5, recent: [] };
  }
  const st = visionStatsByAsset[asset];
  st.total += 1;
  if (correct) st.correct += 1;
  if (actual !== 'DRAW') {
    st.ewma = st.ewma * 0.75 + (correct ? 1 : 0) * 0.25;
    st.trust = Math.max(0.30, Math.min(0.90, 0.30 + (st.ewma - 0.5) * 1.2));
  }
  st.recent.unshift({ scanId, predicted: scan.signal, actual, correct, at: Date.now() });
  if (st.recent.length > 40) st.recent.pop();
  return { correct, stats: st };
}

async function callMistral(messages: any[], model: string, maxTokens = 900): Promise<string> {
  if (!MISTRAL_KEYS.length) {
    throw new Error('MISTRAL_API_KEY(S) are not configured on the server');
  }
  let lastErr: any = null;
  for (let attempt = 0; attempt < MISTRAL_KEYS.length; attempt++) {
    const key = pickMistralKey();
    if (!key) {
      throw new Error(`All ${MISTRAL_KEYS.length} Mistral API keys are rate-limited right now — retry in ~${Math.round(MISTRAL_KEY_COOLDOWN_MS / 1000)}s`);
    }
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens })
    });
    if (res.ok) {
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.map((c: any) => c?.text || '').join('');
      return '';
    }
    const body = await res.text().catch(() => '');
    lastErr = new Error(`Mistral API ${res.status}: ${body.slice(0, 300)}`);
    // Rate-limited / rejected key → cool it down and rotate to the next key in the pool
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      mistralKeyCooldownUntil.set(key, Date.now() + MISTRAL_KEY_COOLDOWN_MS);
      const keyIndex = MISTRAL_KEYS.indexOf(key) + 1;
      recordSystemLog('WARN', 'MISTRAL_KEY_ROTATE', `Mistral key #${keyIndex}/${MISTRAL_KEYS.length} rate-limited (${res.status}) — rotating to the next key`, 'MISTRAL_POOL');
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

function extractJsonBlock(raw: string): any | null {
  if (!raw) return null;
  let text = String(raw).trim().replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const VISION_SYSTEM_PROMPT = `You are an institutional chart analyst examining a screenshot of a live Quotex OTC candlestick chart.
Read ONLY what is visible in the image: candle colors and bodies, wicks, swing highs/lows, visible support/resistance, trend of the most recent candles, and price/countdown labels if legible.
Respond with a SINGLE JSON object and nothing else, using exactly these keys:
{"trend":"UPTREND|DOWNTREND|RANGING","momentum":"BULLISH|BEARISH|NEUTRAL","volatility":"LOW|MEDIUM|HIGH","structure":"one short sentence about swings/breaks","patterns":["visible candlestick or chart patterns"],"support":number_or_null,"resistance":number_or_null,"candle_read":"description of the last 1-3 candles","signal":"UP|DOWN|NONE","confidence":0.0_to_1.0,"reasoning":["2-4 short bullet strings"]}
"signal" is your bias for the NEXT 1-minute candle: UP for a bullish close above the current price, DOWN for a bearish close below it, NONE when the chart is genuinely unclear. Be conservative with confidence (0.5-0.9 typical). Never invent numbers you cannot see.`;

// WebSocket Server for Chrome Extension & clients
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    payload: {
      ...latestSwarmState,
      systemErrorLogs: systemErrorLogs.slice(0, 30)
    },
    timestamp: Date.now()
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'SYNC_STATE' && msg.payload) {
        latestSwarmState = { ...latestSwarmState, ...msg.payload, lastUpdated: Date.now() };
        broadcastSwarmState(msg);
      }
      if (msg.type === 'DIAGNOSTIC_LOG' && msg.payload) {
        systemErrorLogs.unshift(msg.payload);
        if (systemErrorLogs.length > 200) systemErrorLogs.pop();
        broadcastSwarmState(msg);
      }
    } catch (e) {}
  });
});

function broadcastSwarmState(msg: any) {
  const json = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

// Diagnostic Log Ingest Endpoint
app.post('/api/swarm/log', (req, res) => {  try {
    const { level, type, message, source } = req.body;
    const entry = recordSystemLog(level || 'INFO', type || 'CLIENT_LOG', message || 'No details', source || 'CLIENT');
    res.json({ status: 'LOG_RECORDED', entry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST Sync Endpoint (Web App pushes latest state to server)
app.post('/api/swarm/sync', (req, res) => {  try {
    const data = req.body;
    latestSwarmState = {
      ...latestSwarmState,
      ...data,
      connected: true,
      lastUpdated: Date.now()
    };
    broadcastSwarmState({ type: 'QUEEN_UPDATE', payload: latestSwarmState.queenSignal, timestamp: Date.now() });
    broadcastSwarmState({ type: 'TICK', payload: { price: latestSwarmState.currentPrice, asset: latestSwarmState.asset }, timestamp: Date.now() });
    broadcastSwarmState({ type: 'SMC_UPDATE', payload: latestSwarmState.smc, timestamp: Date.now() });
    res.json({ status: 'OK', timestamp: latestSwarmState.lastUpdated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Direct Quotex Extension Ingest Endpoint
app.post('/api/swarm/quotex-feed', (req, res) => {
  try {
    const feed = req.body;
    markExtensionContact('QUOTEX_FEED');
    if (!feed || !feed.asset) {
      // Asset-less pings are normal before pair detection (non-Quotex pages, first
      // seconds of a tab). They used to spam 400/MALFORMED errors and bury real logs.
      // Still harvest anything useful (scanned tabs, logs) and answer 200 quietly.
      let lastNoAssetLogAt = (latestSwarmState as any).__lastNoAssetLogAt || 0;
      if (Date.now() - lastNoAssetLogAt > 60000) {
        (latestSwarmState as any).__lastNoAssetLogAt = Date.now();
        recordSystemLog('INFO', 'FEED_PRE_DETECTION', 'Feed received without an active pair yet (pre-detection ping). Waiting for Quotex pair detection.', 'INGEST_API');
      }
      if (feed && Array.isArray(feed.scannedTabs)) {
        for (const tab of feed.scannedTabs) {
          if (tab.asset && tab.payout > 0) {
            if (!latestSwarmState.activePairs) latestSwarmState.activePairs = {};
            if (!latestSwarmState.activePairs[tab.asset]) {
              latestSwarmState.activePairs[tab.asset] = {
                asset: tab.asset,
                currentPrice: tab.currentPrice || 0,
                payout: tab.payout,
                queenSignal: tab.queenSignal || null,
                workers: [],
                tickCount: 0,
                lastTickTime: Date.now(),
                lastUpdated: Date.now()
              };
            }
          }
        }
      }
      return res.json({ status: 'IGNORED_NO_ASSET', message: 'Waiting for pair detection' });
    }

    if (feed.lastError) {
      recordSystemLog('ERROR', 'QUOTEX_CLIENT_ERROR', feed.lastError, 'QUOTEX_EXTENSION');
    }

    if (Array.isArray(feed.recentLogs)) {
      for (const item of feed.recentLogs) {
        if (!systemErrorLogs.find((l) => l.timestamp === item.timestamp && l.message === item.message)) {
          systemErrorLogs.unshift(item);
        }
      }
      if (systemErrorLogs.length > 200) systemErrorLogs.length = 200;
    }

    // Register or update activePairs map for simultaneous multi-tab monitoring
    if (!latestSwarmState.activePairs) latestSwarmState.activePairs = {};
    latestSwarmState.activePairs[feed.asset] = {
      asset: feed.asset,
      currentPrice: feed.currentPrice || 0,
      payout: feed.payout || 0.85,
      queenSignal: feed.queenSignal || null,
      workers: feed.workers || [],
      tickCount: (latestSwarmState.activePairs[feed.asset]?.tickCount || 0) + 1,
      lastTickTime: Date.now(),
      lastUpdated: Date.now()
    };

    // Process all scanned open tabs sent by the extension sniffer
    if (Array.isArray(feed.scannedTabs)) {
      for (const tab of feed.scannedTabs) {
        if (tab.asset && tab.payout > 0) {
          if (!latestSwarmState.activePairs[tab.asset]) {
            latestSwarmState.activePairs[tab.asset] = {
              asset: tab.asset,
              currentPrice: tab.currentPrice || 0,
              payout: tab.payout,
              queenSignal: tab.queenSignal || null,
              workers: [],
              tickCount: 0,
              lastTickTime: Date.now(),
              lastUpdated: Date.now()
            };
          } else {
            latestSwarmState.activePairs[tab.asset].payout = tab.payout;
            if (tab.queenSignal) {
              latestSwarmState.activePairs[tab.asset].queenSignal = tab.queenSignal;
            }
            if (tab.currentPrice) {
              latestSwarmState.activePairs[tab.asset].currentPrice = tab.currentPrice;
            }
          }
        }
      }
    }

    if (feed.activePairs && typeof feed.activePairs === 'object') {
      // 100% Dynamic Sync: Overwrite with current open tabs so closed pairs are removed
      latestSwarmState.activePairs = feed.activePairs;
    }

    if (feed.lastError) {
      systemErrorLogs.unshift({
        id: `err_pair_${Date.now()}`,
        timestamp: Date.now(),
        level: 'ERROR',
        type: 'PAIR_DETECTION_ERROR',
        source: 'CHROME_EXTENSION',
        message: feed.lastError
      });
      if (systemErrorLogs.length > 200) systemErrorLogs.pop();
    }

    if (Array.isArray(feed.candles) && feed.candles.length > 0) {
      latestSwarmState.candles = feed.candles;
      if (feed.asset && latestSwarmState.activePairs[feed.asset]) {
        latestSwarmState.activePairs[feed.asset].candles = feed.candles;
      }
    }

    // A pre-detection tab (no pair/price yet) posts feeds too — it must never wipe
    // the focused pair's live price or the whole dashboard reads 0 / STALLED.
    const feedPatch: any = { ...feed };
    if (!(feed.currentPrice > 0)) {
      feedPatch.currentPrice = latestSwarmState.currentPrice || 0;
      if (!feed.asset) feedPatch.asset = latestSwarmState.asset;
    }

    latestSwarmState = {
      ...latestSwarmState,
      ...feedPatch,
      candles: (Array.isArray(feed.candles) && feed.candles.length > 0) ? feed.candles : (latestSwarmState.candles || []),
      dataSource: 'QUOTEX_LIVE',
      connected: Boolean(feed.asset),
      lastTickTime: feed.currentPrice > 0 ? Date.now() : latestSwarmState.lastTickTime,
      tickCount: (latestSwarmState.tickCount || 0) + 1,
      feedStatus: feed.asset ? 'STREAMING_REAL_TICKS' : 'PAIR_DETECTION_ERROR',
      lastUpdated: Date.now()
    };

    broadcastSwarmState({
      type: 'LIVE_QUOTEX_INGEST',
      payload: latestSwarmState,
      timestamp: Date.now()
    });
    broadcastSwarmState({
      type: 'MULTI_PAIR_UPDATE',
      payload: latestSwarmState.activePairs,
      timestamp: Date.now()
    });
    broadcastSwarmState({
      type: 'TICK',
      payload: { price: latestSwarmState.currentPrice, asset: latestSwarmState.asset },
      timestamp: Date.now()
    });
    if (latestSwarmState.queenSignal) {
      broadcastSwarmState({
        type: 'QUEEN_UPDATE',
        payload: latestSwarmState.queenSignal,
        timestamp: Date.now()
      });
    }

    res.json({ status: 'SUCCESS', receivedAsset: feed.asset, timestamp: Date.now() });
  } catch (err: any) {
    recordSystemLog('ERROR', 'INGEST_EXCEPTION', err.message, 'INGEST_API');
    res.status(500).json({ error: err.message });
  }
});

// REST State Endpoint (Chrome Extension & App poll from AI Studio Cloud)
app.get('/api/swarm/state', (req, res) => {
  const isStalled = latestSwarmState.lastTickTime > 0 && Date.now() - latestSwarmState.lastTickTime > 8000;
  if (isStalled && latestSwarmState.feedStatus !== 'TICKS_STALLED_ERROR') {
    latestSwarmState.feedStatus = 'TICKS_STALLED_ERROR';
    latestSwarmState.connected = false;
  }

  res.json({
    ...latestSwarmState,
    isStalled,
    // Heartbeat so the web app can tell WAITING (extension alive, ticks quiet) apart
    // from NOT_INSTALLED (extension never contacted this server).
    extension: extensionPresence(),
    vision: visionSummary(),
    systemErrorLogs: systemErrorLogs.slice(0, 50),
    cloudHost: req.headers.host,
    serverTime: Date.now()
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chrome Extension presence heartbeat
// The extension background worker polls /api/extension/scan-command every ~4s and
// pushes /api/swarm/quotex-feed while any Quotex tab is open. Recording both contacts
// lets the web app distinguish "extension missing" from "Quotex tab is briefly quiet"
// (a single missed tick must never flip the header to NOT INSTALLED), and it keeps the
// presence signal alive even while the focused pair is switching / warming up.
// ─────────────────────────────────────────────────────────────────────────────
const EXTENSION_HEARTBEAT_TIMEOUT_MS = 15000;
let lastExtensionContactAt = 0;
let lastExtensionContactSource = 'NONE';
let extensionContactCount = 0;

function markExtensionContact(source: string) {
  lastExtensionContactAt = Date.now();
  lastExtensionContactSource = source;
  extensionContactCount += 1;
}

function extensionPresence() {
  const ageMs = lastExtensionContactAt > 0 ? Date.now() - lastExtensionContactAt : -1;
  return {
    lastContactAt: lastExtensionContactAt,
    lastContactSource: lastExtensionContactSource,
    ageMs,
    contacts: extensionContactCount,
    alive: ageMs >= 0 && ageMs < EXTENSION_HEARTBEAT_TIMEOUT_MS,
    heartbeatTimeoutMs: EXTENSION_HEARTBEAT_TIMEOUT_MS
  };
}

// Pending Extension Trade Commands Queue
interface ExtensionCommand {
  id: string;
  action: 'EXECUTE_TRADE' | 'SWITCH_PAIR';
  direction?: 'CALL' | 'PUT' | 'UP' | 'DOWN';
  asset: string;
  amount?: number;
  duration?: number;
  timestamp: number;
  status: 'PENDING' | 'EXECUTED' | 'FAILED';
}

const pendingExtensionCommands: ExtensionCommand[] = [];
const extensionExecutionHistory: Array<{
  id: string;
  commandId?: string;
  action: string;
  direction?: string;
  asset: string;
  amount?: number;
  result?: any;
  timestamp: number;
}> = [];

// Web App dispatches a trade command to the extension
app.post('/api/extension/trade-command', (req, res) => {
  try {
    const { action = 'EXECUTE_TRADE', direction, asset, amount = 1, duration = 60 } = req.body;
    const command: ExtensionCommand = {
      id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      action: action,
      direction: direction,
      asset: asset || latestSwarmState.asset || 'USD/INR (OTC)',
      amount: amount,
      duration: duration,
      timestamp: Date.now(),
      status: 'PENDING'
    };

    pendingExtensionCommands.push(command);
    if (pendingExtensionCommands.length > 20) pendingExtensionCommands.shift();

    recordSystemLog('INFO', 'EXTENSION_COMMAND_QUEUED', `Command ${action} ${direction || ''} on ${command.asset} queued for Quotex Extension`, 'WEB_APP_COMMAND');

    res.json({
      status: 'COMMAND_QUEUED',
      command: command,
      message: `Trade ${direction || action} queued! Quotex extension will execute in tab.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Extension in Quotex tab polls for commands to execute
app.get('/api/extension/trade-commands', (req, res) => {
  const commandsToRun = pendingExtensionCommands.filter(c => c.status === 'PENDING');
  for (const cmd of commandsToRun) {
    cmd.status = 'EXECUTED';
  }
  res.json({
    status: 'OK',
    commands: commandsToRun,
    serverTime: Date.now()
  });
});

// Extension reports result of DOM execution back
app.post('/api/extension/command-result', (req, res) => {
  try {
    const { commandId, result, timestamp } = req.body;
    extensionExecutionHistory.unshift({
      id: 'hist_' + Date.now(),
      commandId: commandId,
      action: result?.direction ? 'TRADE_' + result.direction : 'SWITCH_PAIR',
      direction: result?.direction,
      asset: result?.asset || latestSwarmState.asset,
      result: result,
      timestamp: timestamp || Date.now()
    });
    if (extensionExecutionHistory.length > 50) extensionExecutionHistory.length = 50;

    recordSystemLog('INFO', 'EXTENSION_TRADE_EXECUTED', `Quotex Tab executed ${result?.direction || 'COMMAND'} on ${result?.asset || 'Asset'} successfully!`, 'QUOTEX_EXTENSION');

    res.json({ status: 'ACK' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Web App retrieves real execution history
app.get('/api/extension/execution-history', (req, res) => {
  res.json({
    status: 'OK',
    history: extensionExecutionHistory
  });
});

// ── Mistral Vision Scan ingest (Chrome extension capture or manual upload) ──
app.post('/api/vision/scan', async (req, res) => {
  try {
    const { asset, image, price, source } = req.body || {};
    if (!asset || typeof asset !== 'string') {
      return res.status(400).json({ error: 'Missing asset' });
    }
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Missing or invalid image (dataURL expected)' });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return res.status(413).json({ error: 'Image too large (max ~5MB base64)' });
    }
    if (!MISTRAL_KEYS.length) {
      return res.status(503).json({ error: 'MISTRAL_API_KEY(S) are not configured on the server', configured: false });
    }

    const last = lastVisionScanAt[asset] || 0;
    if (Date.now() - last < VISION_SCAN_COOLDOWN_MS) {
      return res.status(429).json({
        error: 'Scan cooldown active for this asset',
        retryInMs: VISION_SCAN_COOLDOWN_MS - (Date.now() - last),
        latest: latestVisionScan(asset)
      });
    }

    recordSystemLog('INFO', 'VISION_SCAN_START', `Mistral vision scan requested for ${asset}`, 'MISTRAL_VISION');

    const raw = await callMistral(
      [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Chart pair: ${asset}. Live price at capture time: ${price ?? 'unknown'}. Scan this chart and return the JSON verdict.` },
            { type: 'image_url', image_url: image }
          ]
        }
      ],
      MISTRAL_VISION_MODEL,
      800
    );

    lastVisionScanAt[asset] = Date.now();

    const parsed = extractJsonBlock(raw) || {};
    const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
    const upper = (v: any, fallback: string) => String(v || fallback).toUpperCase().slice(0, 40);
    const scan: VisionScanRecord = {
      id: `vis_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      asset,
      timestamp: Date.now(),
      source: source === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'EXTENSION_CAPTURE',
      thumbnail: image.length < 400_000 ? image : undefined,
      priceAtScan: num(price) ?? undefined,
      model: MISTRAL_VISION_MODEL,
      trend: upper(parsed.trend, 'UNKNOWN'),
      momentum: upper(parsed.momentum, 'NEUTRAL'),
      volatility: upper(parsed.volatility, 'MEDIUM'),
      structure: String(parsed.structure || 'Not visible').slice(0, 200),
      patterns: Array.isArray(parsed.patterns)
        ? parsed.patterns.slice(0, 6).map((p: any) => String(p).slice(0, 60))
        : [],
      support: num(parsed.support),
      resistance: num(parsed.resistance),
      candleRead: String(parsed.candle_read || parsed.candleRead || '').slice(0, 300),
      signal: String(parsed.signal || '').toUpperCase() === 'UP'
        ? 'UP'
        : String(parsed.signal || '').toUpperCase() === 'DOWN'
          ? 'DOWN'
          : 'NONE',
      confidence: Math.max(0, Math.min(1, num(parsed.confidence) ?? 0.5)),
      reasoning: Array.isArray(parsed.reasoning)
        ? parsed.reasoning.slice(0, 5).map((r: any) => String(r).slice(0, 200))
        : []
    };

    if (!visionScansByAsset[asset]) visionScansByAsset[asset] = [];
    visionScansByAsset[asset].unshift(scan);
    if (visionScansByAsset[asset].length > MAX_VISION_SCANS_PER_ASSET) visionScansByAsset[asset].pop();
    if (!visionStatsByAsset[asset]) {
      visionStatsByAsset[asset] = { correct: 0, total: 0, ewma: 0.5, trust: 0.5, recent: [] };
    }

    recordSystemLog('SUCCESS', 'VISION_SCAN_DONE', `Mistral vision verdict ${scan.signal} (${Math.round(scan.confidence * 100)}%) on ${asset} — trend ${scan.trend}, momentum ${scan.momentum}`, 'MISTRAL_VISION');

    latestSwarmState.vision = visionSummary();
    broadcastSwarmState({ type: 'VISION_UPDATE', payload: scan, timestamp: Date.now() });

    res.json({ status: 'OK', scan });
  } catch (err: any) {
    recordSystemLog('ERROR', 'VISION_SCAN_ERROR', err.message, 'MISTRAL_VISION');
    res.status(500).json({ error: err.message });
  }
});

// Latest scan + accuracy for one asset (or the newest across all assets)
app.get('/api/vision/latest', (req, res) => {
  const asset = (req.query.asset as string) || '';
  const scans = asset ? (visionScansByAsset[asset] || []) : [];
  const latest = asset ? (scans[0] || null) : latestVisionScan();
  const st = asset ? visionStatsByAsset[asset] : null;
  res.json({
    status: 'OK',
    configured: MISTRAL_KEYS.length > 0,
    keys: MISTRAL_KEYS.length,
    model: MISTRAL_VISION_MODEL,
    latest,
    history: scans.slice(0, MAX_VISION_SCANS_PER_ASSET).map((s) => ({ ...s, thumbnail: undefined })),
    accuracy: st
      ? {
          correct: st.correct,
          total: st.total,
          ewma: Number(st.ewma.toFixed(3)),
          trust: Number(st.trust.toFixed(3)),
          recent: st.recent.slice(0, 10)
        }
      : { correct: 0, total: 0, ewma: 0.5, trust: 0.5, recent: [] }
  });
});

// Settle a vision prediction against the real closed candle (self-training feedback)
app.post('/api/vision/outcome', (req, res) => {
  try {
    const { asset, scanId, actual } = req.body || {};
    if (!asset || !['UP', 'DOWN', 'DRAW'].includes(actual)) {
      return res.status(400).json({ error: 'asset and actual (UP|DOWN|DRAW) are required' });
    }
    const result = recordVisionOutcome(asset, scanId, actual);
    if (!result) {
      return res.status(404).json({ error: 'No settleable vision scan found for asset' });
    }
    broadcastSwarmState({
      type: 'VISION_ACCURACY',
      payload: {
        asset,
        accuracyEwma: Number(result.stats.ewma.toFixed(3)),
        trust: Number(result.stats.trust.toFixed(3)),
        total: result.stats.total,
        correct: result.stats.correct
      },
      timestamp: Date.now()
    });
    res.json({
      status: 'OK',
      correct: result.correct,
      stats: { ...result.stats, ewma: Number(result.stats.ewma.toFixed(3)), trust: Number(result.stats.trust.toFixed(3)) }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Vision scan command queue: web app queues, extension background polls & claims ──
interface VisionScanCommand {
  id: string;
  asset: string;
  requestedAt: number;
  claimedAt?: number;
  reclaims?: number;
  status: 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED';
}
const visionScanCommands: VisionScanCommand[] = [];

// Web app requests a fresh chart scan on the focused Quotex tab
app.post('/api/extension/scan-command', (req, res) => {
  const asset = (req.body && req.body.asset) || latestSwarmState.asset || '';
  if (!asset) return res.status(400).json({ error: 'No asset available to scan' });
  const now = Date.now();
  // Clicking SCAN again while the previous command for this pair is still in flight used
  // to pile up duplicates (each one later logged as a VISION_SCAN_RECLAIMED warning).
  const inFlight = visionScanCommands.find(
    (c) => c.asset === asset && (c.status === 'PENDING' || c.status === 'CLAIMED') && now - c.requestedAt < 30000
  );
  if (inFlight) {
    return res.json({ status: 'QUEUED', command: inFlight, deduplicated: true });
  }
  const cmd: VisionScanCommand = {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    asset,
    requestedAt: now,
    reclaims: 0,
    status: 'PENDING'
  };
  visionScanCommands.push(cmd);
  while (visionScanCommands.length > 10) visionScanCommands.shift();
  recordSystemLog('INFO', 'VISION_SCAN_QUEUED', `Vision scan queued for ${asset}`, 'WEB_APP_COMMAND');
  res.json({ status: 'QUEUED', command: cmd });
});

// Extension background polls and claims the pending scan command
app.get('/api/extension/scan-command', (req, res) => {
  // Any call here proves the extension background worker is alive, even while the
  // Quotex tab has no fresh ticks (tab switched, pair warming up, ...).
  markExtensionContact('SCAN_COMMAND_POLL');
  // Reclaim abandoned commands: claimed but no scan-result within 60s (e.g. the
  // capture failed silently) — otherwise the queue jams and scans stop working.
  const now = Date.now();
  visionScanCommands.forEach((c) => {
    if (c.status === 'CLAIMED' && c.claimedAt && now - c.claimedAt > 60000) {
      c.reclaims = (c.reclaims || 0) + 1;
      if (c.reclaims > 2) {
        // Stop the endless requeue/retry loop: after 3 attempts the real cause is
        // "no scannable visible Quotex chart", so fail loudly once instead of
        // emitting a VISION_SCAN_RECLAIMED warning every minute forever.
        c.status = 'FAILED';
        recordSystemLog(
          'ERROR',
          'VISION_SCAN_FAILED',
          `Scan command ${c.id} (${c.asset}) failed ${c.reclaims} times — the Quotex chart tab was never captured. Open the Quotex chart, keep that tab VISIBLE (capture only works on the visible tab) and scan again.`,
          'WEB_APP_COMMAND'
        );
      } else {
        c.status = 'PENDING';
        c.claimedAt = undefined;
        recordSystemLog('WARN', 'VISION_SCAN_RECLAIMED', `Scan command ${c.id} (${c.asset}) timed out unclaimed — requeued (attempt ${c.reclaims}/3)`, 'WEB_APP_COMMAND');
      }
    }
  });
  const cmd = visionScanCommands.find((c) => c.status === 'PENDING');
  if (cmd) {
    cmd.status = 'CLAIMED';
    cmd.claimedAt = now;
  }
  res.json({ status: 'OK', command: cmd || null, serverTime: Date.now() });
});

// Extension reports the capture+scan outcome
app.post('/api/extension/scan-result', (req, res) => {
  const { commandId, ok, error, reason } = req.body || {};
  markExtensionContact('SCAN_RESULT');
  const cmd = visionScanCommands.find((c) => c.id === commandId);
  // Idempotent: with several Quotex tabs open, more than one tab may report a result
  // for the same command — never let a loser's FAILED overwrite the winner's DONE.
  if (cmd && cmd.status !== 'DONE') cmd.status = ok ? 'DONE' : 'FAILED';
  // Surface the real reason immediately instead of leaving the operator to guess why
  // the scan button never turned into a verdict.
  if (!ok && cmd && cmd.status !== 'DONE') {
    recordSystemLog(
      'WARN',
      'VISION_SCAN_REJECTED',
      `Extension could not scan ${cmd ? cmd.asset : 'the chart'}: ${error || reason || 'capture unavailable'}. Keep the Quotex chart tab open and visible.`,
      'CHROME_EXTENSION'
    );
  }
  res.json({ status: 'ACK' });
});

// Server-side Mistral explanation of the Queen decision
app.post('/api/mistral/explain-queen', async (req, res) => {
  try {
    const { queenSignal, featureVector, workers, regime } = req.body || {};

    if (!queenSignal) {
      return res.status(400).json({ error: 'Missing queenSignal data' });
    }

    if (!MISTRAL_KEYS.length) {
      const upCount = queenSignal.upVotes || 0;
      const downCount = queenSignal.downVotes || 0;
      const consensusPct = Math.round((queenSignal.consensus || 0) * 100);
      const confPct = Math.round((queenSignal.confidence || 0) * 100);
      const dir = queenSignal.direction || 'HOLD';
      const ev = (queenSignal.evidence || []).join(', ') || 'No single confluence dominance';

      return res.json({
        source: 'DETERMINISTIC_ENGINE',
        explanation:
          `Queen selected ${dir} because ${dir === 'UP' ? upCount : downCount} of 20 workers aligned with ${dir.toLowerCase()} market evidence with ${consensusPct}% consensus and ${confPct}% reliability confidence. ` +
          `The setup features: ${ev}. Current market regime is ${regime || 'RANGE'}. Vision trust is blended into every fly's vote through its individually trained visionWeight.`
      });
    }

    const prompt = `
You are an institutional quantitative market analyst specializing in Quotex OTC Smart Money Concepts (SMC), Swarm Intelligence and a Mistral vision chart-scanning layer.
Explain this deterministic Queen Fly signal decision. DO NOT invent or predict future prices or guarantee profitability. Base your reasoning strictly on the provided quantitative data.

DATA:
- Asset: ${queenSignal.asset}
- Queen Decision: ${queenSignal.direction}
- Confidence: ${Math.round((queenSignal.confidence || 0) * 100)}%
- Consensus: ${Math.round((queenSignal.consensus || 0) * 100)}% (${queenSignal.upVotes} UP, ${queenSignal.downVotes} DOWN, ${queenSignal.holdVotes} HOLD)
- Status: ${queenSignal.status}
- SMC Confluence Score: ${featureVector?.confluenceScore || 0}/100
- Trend: ${featureVector?.trend || 'UNCERTAIN'}
- Market Regime: ${regime || 'RANGE'}
- Evidence: ${(queenSignal.evidence || []).join(', ')}
- Vision verdict: ${featureVector?.visionSignal || 'NONE'} (confidence ${Math.round((featureVector?.visionConfidence || 0) * 100)}%)
- Order Blocks: Bullish=${featureVector?.bullishOB}, Bearish=${featureVector?.bearishOB}, Fresh=${featureVector?.obFresh}
- Liquidity Sweep: ${featureVector?.liquiditySweep} (${featureVector?.liquidityType})
- FVG: Bullish=${featureVector?.bullishFVG}, Bearish=${featureVector?.bearishFVG}
- Candle Pattern: ${featureVector?.candlePattern}

Explain in 3 crisp, professional bullet points:
1. Primary Catalyst: why the Queen and dominant workers chose ${queenSignal.direction}.
2. Confluence & Vision: how SMC structure and the Mistral vision verdict supported or limited the setup.
3. Risk & Dissent: why dissenting workers voted against or held, and key invalidation risks.
`;

    const raw = await callMistral([{ role: 'user', content: prompt }], MISTRAL_TEXT_MODEL, 600);

    return res.json({
      source: 'MISTRAL_AI',
      explanation: raw.trim() || 'Diagnostic completed.'
    });
  } catch (err: any) {
    console.error('Mistral explanation error:', err);
    return res.status(500).json({
      error: 'Failed to generate explanation',
      details: err.message
    });
  }
});

// Web app publishes its COMBINED Queen signal (SMC + vision + swarm) so the extension
// HUD and popup can display the same next-candle verdict.
app.post('/api/swarm/queen-signal', (req, res) => {
  try {
    const { queenSignal, asset } = req.body || {};
    if (!queenSignal) return res.status(400).json({ error: 'Missing queenSignal' });
    latestSwarmState.combinedQueen = {
      ...queenSignal,
      asset: queenSignal.asset || asset,
      receivedAt: Date.now()
    };
    latestSwarmState.lastUpdated = Date.now();
    broadcastSwarmState({ type: 'QUEEN_COMBINED_UPDATE', payload: latestSwarmState.combinedQueen, timestamp: Date.now() });
    res.json({ status: 'OK' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// App status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    app: 'OTC Swarm Queen',
    version: '1.0.0',
    mode: 'FULL_STACK',
    liveExecution: 'DISABLED',
    port: PORT,
    timestamp: Date.now()
  });
});

// Extension Download ZIP Route
app.get('/api/extension/download', async (req, res) => {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const extDir = path.resolve(process.cwd(), 'extension');
    // Version-aware filename: the zip always identifies which extension build it carries
    let extVersion = '1.0.0';
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf-8'));
      if (manifest && manifest.version) extVersion = String(manifest.version);
    } catch { /* fall back to default version tag */ }
    const readDirRecursive = (dir: string, base: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          readDirRecursive(fullPath, relPath);
        } else {
          zip.file(relPath, fs.readFileSync(fullPath));
        }
      }
    };

    readDirRecursive(extDir, '');
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('X-Extension-Version', extVersion);
    res.setHeader('Content-Disposition', `attachment; filename="otc-swarm-queen-extension-v${extVersion}.zip"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Error generating extension zip:', err);
    res.status(500).json({ error: 'Failed to generate extension zip', details: err.message });
  }
});

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // ESM ("type": "module") has no __dirname — resolve from the module URL.
    const distPath = path.resolve(import.meta.dirname || process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`OTC Swarm Queen Terminal live at http://0.0.0.0:${PORT}`);
  });
}

startServer();
