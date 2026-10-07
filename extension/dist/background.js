/**
 * OTC Swarm Queen - Multi-Tab Background Service Worker (Manifest V3)
 * Pure JavaScript
 * 
 * 100% AUTOMATIC MULTI-PAIR SCANNER
 * Scans ALL open Quotex tabs and top bar pairs, tracks each pair's price & Queen signal,
 * and streams to Web App and Extension Popup simultaneously!
 */

const KNOWN_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
  "PKR", "BRL", "BDT", "DZD", "MXN", "PHP", "IDR", "INR",
  "TRY", "ZAR", "EGP", "NGN", "ARS", "COP", "AED", "SAR",
  "MYR", "VND", "THB", "SGD", "KZT", "BTC", "ETH", "SOL"
];

const state = {
  connected: false,
  webAppConnected: true,
  webAppUrl: "https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app",
  connectionMode: "AUTONOMOUS_MULTI_TAB",
  dataSource: "QUOTEX_REAL_FEED",
  asset: null, // Strictly null until detected
  currentPrice: 0,
  payout: 0.85,
  tickCount: 0,
  lastTickTime: 0,
  connectionStatus: "SCANNING_QUOTEX_TABS",
  lastError: null,
  activePairs: {}, // Maps pair name -> { asset, currentPrice, payout, queenSignal, workers, tickCount, lastTickTime, tabId, isFocused }
  scannedTabsCount: 0,

  // --- PAIR OWNERSHIP (which pair we are locked onto) ---
  focusedAsset: null,          // pair the user selected (popup / web app) or the AUTO-detected pair
  pairSelectionMode: "AUTO",   // "AUTO" = follow Quotex   |   "MANUAL" = pinned by the user
  pairLockUntil: 0,
  candlePhase: null,           // shared 1-minute candle countdown (single source of truth)
  pairSignals: {},             // per-pair queen signals
  bestPair: null,              // pair with the best non-HOLD signal right now
  lastQuotexFeedAt: 0,
  queenSignal: {
    direction: "HOLD",
    // Honest stub: zeros until the content script streams a real verdict.
    confidence: 0,
    consensus: 0,
    status: "SCANNING_MARKET",
    evidence: ["Auto-detecting live Quotex pair and real-time tick stream..."],
    upVotes: 0,
    downVotes: 0,
    holdVotes: 20,
    confluenceScore: 0,
    expiry: "1 MINUTE (M1 OTC)",
    timestamp: Date.now()
  },
  workers: [],
  lastUpdated: Date.now()
};

/** Extension toolbar badge mirrors the focused pair's live direction. */
function updateBadge(direction) {
  try {
    if (typeof chrome === "undefined" || !chrome.action) return;
    const dir = String(direction || "HOLD").toUpperCase();
    if (dir === "CALL" || dir === "UP") {
      chrome.action.setBadgeText({ text: "UP" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    } else if (dir === "PUT" || dir === "DOWN") {
      chrome.action.setBadgeText({ text: "DN" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    } else {
      chrome.action.setBadgeText({ text: "HLD" });
      chrome.action.setBadgeBackgroundColor({ color: "#64748b" });
    }
  } catch (e) {}
}

/**
 * Fires a real Chrome notification the first time a given pair produces a CALL/PUT.
 * HOLD is never announced. The in-page corner card is the primary alert; this is the
 * system-level one for when the user is on another tab.
 */
const announcedAlerts = {};
let lastSystemAlertAt = 0;

/** A signal is only "fresh" if its feed is still live (guards against stale pair signals). */
function nowFresh(signal) {
  return Boolean(signal && signal.timestamp && Date.now() - signal.timestamp < 15000);
}

function notifyNewSignal(asset, signal) {
  try {
    if (!asset || !signal) return;
    const dir = signal.direction;
    if (dir !== "CALL" && dir !== "PUT") return; // never notify on HOLD
    if (typeof chrome === "undefined" || !chrome.notifications) return;

    const key = dir + "@" + (signal.candleKey || Math.floor(Date.now() / 60000));
    if (announcedAlerts[asset] === key) return;

    const now = Date.now();
    // Global anti-spam gap. Kept short (6s) so a genuine fresh CALL/PUT on another pair
    // is announced immediately instead of being swallowed for 20 seconds.
    if (now - lastSystemAlertAt < 6000) return;
    announcedAlerts[asset] = key;
    lastSystemAlertAt = now;

    const isCall = dir === "CALL";
    const conf = Math.round((signal.confidence || 0) * 100);
    const power = Math.round((signal.power || 0) * 100);

    // Inline SVG badge (the extension ships no binary icon assets).
    const glyph = isCall
      ? "M32 12 L50 38 H38 V54 H26 V38 H14 Z"
      : "M32 52 L14 26 H26 V10 H38 V26 H50 Z";
    const tint = isCall ? "#10b981" : "#ef4444";
    const icon = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" rx="14" fill="#0b1220"/>' +
      '<path d="' + glyph + '" fill="' + tint + '"/></svg>'
    );

    chrome.notifications.create("otcsq_" + asset.replace(/[^a-z0-9]/gi, ""), {
      type: "basic",
      iconUrl: icon,
      title: (isCall ? "⬆ CALL (UP)" : "⬇ PUT (DOWN)") + "  •  " + asset,
      message: "Power " + power + "%  ·  Confidence " + conf + "%  ·  " +
        Math.max(signal.upVotes || 0, signal.downVotes || 0) + "/20 workers  ·  M1 candle closes in " +
        (signal.candleExpiryTimer || "--"),
      priority: 2,
      requireInteraction: false
    }, function () { void chrome.runtime.lastError; });
  } catch (e) {}
}

function forwardToHttpEndpoints(payload) {
  const urls = [
    state.webAppUrl,
    "https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app",
    "https://ais-pre-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app",
    // A local dev server answers on localhost AND on the loopback IP — both spellings are
    // pushed so the feed never depends on which one the operator opened.
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  for (const u of uniqueUrls) {
    try {
      fetch(`${u.replace(/\/$/, '')}/api/swarm/quotex-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        mode: "cors"
      }).catch(() => {});
    } catch (e) {}
  }
}

function persistState() {
  state.lastUpdated = Date.now();
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ swarmQueenState: state });
  }
}

/**
 * Tabs that host the OTC Swarm Queen web app (cloud dev/pre, AI Studio, or a local
 * dev server). The local server is reachable as http://localhost:3000 AND as
 * http://127.0.0.1:3000 — the old check only matched "localhost:3000", so opening the
 * dashboard on 127.0.0.1 silently broke the instant push channel and every update had
 * to wait for the slower 1.5s REST poll (which looked like the bridge kept dropping).
 */
function isWebAppUrl(u) {
  u = String(u || "");
  return (
    u.includes("run.app") ||
    u.includes("aistudio.google.com") ||
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    u.includes("0.0.0.0")
  );
}

function forwardToWebApp(type, payload) {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({}, function (tabs) {
      if (!tabs) return;
      tabs.forEach(tab => {
        if (!isWebAppUrl(tab.url)) return;
        try {
          chrome.tabs.sendMessage(tab.id, { type: type, payload: payload }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        } catch (e) {}
      });
    });
  }
}

/**
 * Tabs we have already injected the content script into (this service-worker session only).
 * Without this the old code re-injected dist/content.js into every Quotex tab on every scan
 * (~every 5s), re-parsing the whole script a dozen times a minute per tab and making the
 * extension look like it kept "resetting" itself.
 */
const injectedTabs = new Set();

/**
 * Scan ALL open browser tabs to detect every open Quotex tab
 */
function scanQuotexTabs() {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return;

  chrome.tabs.query({}, function (tabs) {
    if (!tabs) return;
    let quotexTabsCount = 0;
    const liveTabIds = new Set();

    for (const tab of tabs) {
      if (!tab || !tab.id) continue;
      liveTabIds.add(tab.id);

      const u = tab.url || "";
      const isQuotex =
        u.includes("market-qx") || u.includes("quotex") || u.includes("qxbroker") ||
        u.includes("qx.info") || u.includes("qx-trade") || u.includes("demo-trade");
      if (!isQuotex) continue;

      quotexTabsCount++;

      // The manifest's content_scripts entry already injects on every page load, so this
      // is only a recovery path for a tab that was open before the extension was loaded.
      if (injectedTabs.has(tab.id)) continue;
      if (!chrome.scripting || !chrome.scripting.executeScript) continue;

      injectedTabs.add(tab.id);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/content.js"]
      }).catch(() => {
        injectedTabs.delete(tab.id); // let a genuinely failed injection retry next scan
      });
    }

    // Forget tabs that have been closed so the set cannot grow without bound.
    for (const id of Array.from(injectedTabs)) {
      if (!liveTabIds.has(id)) injectedTabs.delete(id);
    }

    state.scannedTabsCount = quotexTabsCount;
    persistState();
  });
}

// Initial state load
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["swarmQueenState", "webAppUrl"], function (res) {
    if (res && res.swarmQueenState) {
      Object.assign(state, res.swarmQueenState);
      // Clear legacy/stale cached assets that don't match active Quotex session
      if (state.asset === "USD/PKR (OTC)" || state.asset === "USD/MXN (OTC)") {
        state.asset = null;
        state.currentPrice = 0;
      }
    }
    if (res && res.webAppUrl) {
      state.webAppUrl = res.webAppUrl;
      state.webAppConnected = true;
    }
    scanQuotexTabs();
  });
}

// Runtime message listener
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Tick and SMC Engine Updates from Content Script
    if (request.type === "LIVE_ENGINE_UPDATE") {
      const feed = request.payload;

      if (!state.activePairs) state.activePairs = {};

      // 100% DYNAMIC TAB SYNC: Prune any closed tabs!
      if (Array.isArray(feed.scannedTabs)) {
        const currentOpenAssets = new Set(feed.scannedTabs.map(t => t.asset));
        for (const existingAsset of Object.keys(state.activePairs)) {
          if (!currentOpenAssets.has(existingAsset)) {
            delete state.activePairs[existingAsset];
          }
        }

        // Add or update open tabs
        for (const tab of feed.scannedTabs) {
          if (tab.asset) {
            // Prefer the price the content script resolved FOR THIS PAIR. Keeping our own
            // last value here is what made a stale quote (e.g. USD/IDR's 17864) stay on
            // screen under a different pair's name in the radar list.
            const feedPair = (feed.activePairs && feed.activePairs[tab.asset]) || null;
            const pairPrice = feedPair && typeof feedPair.currentPrice === "number"
              ? feedPair.currentPrice
              : 0;

            state.activePairs[tab.asset] = {
              asset: tab.asset,
              currentPrice: tab.asset === feed.asset ? (feed.currentPrice || 0) : pairPrice,
              payout: tab.payout || 0.85,
              payoutPct: tab.payoutPct || Math.round((tab.payout || 0.85) * 100),
              isActive: tab.isActive || (tab.asset === feed.asset),
              queenSignal: (feedPair && feedPair.queenSignal) || tab.queenSignal ||
                (tab.asset === feed.asset ? feed.queenSignal : null),
              tabId: sender.tab?.id,
              lastTickTime: Date.now()
            };
          }
        }
      }

      // --- PAIR OWNERSHIP ---
      // The content script is the single source of truth for which pair is focused
      // (it holds the manual lock). The background simply mirrors it, so a manual
      // selection can never be dragged back to the previously detected pair.
      if (feed.asset) {
        state.connected = true;
        state.asset = feed.asset;
        state.focusedAsset = feed.asset;
      }
      state.pairSelectionMode = feed.pairSelectionMode === "MANUAL" ? "MANUAL" : "AUTO";
      state.pairLockUntil = feed.isLocked ? Date.now() + 5000 : 0;
      state.lastQuotexFeedAt = Date.now();

      // Shared 1-minute candle countdown (uses the broker's own on-chart badge).
      if (feed.candlePhase) {
        state.candlePhase = feed.candlePhase;
      } else if (feed.candleExpirySeconds !== null && feed.candleExpirySeconds !== undefined) {
        state.candlePhase = {
          remainingSec: feed.candleExpirySeconds,
          totalSec: 60,
          timeFormatted: feed.candleExpiryTimer || `00:${String(feed.candleExpirySeconds).padStart(2, "0")}s`,
          closeAt: feed.candleCloseAt || Date.now() + feed.candleExpirySeconds * 1000,
          isEntryZone: feed.candleExpirySeconds <= 8,
          source: "QUOTEX_FEED"
        };
      }

      // Per-pair signal map + best opportunity pair.
      if (state.asset && feed.queenSignal) {
        state.pairSignals[state.asset] = feed.queenSignal;
      }
      if (feed.pairSignals && typeof feed.pairSignals === "object") {
        Object.assign(state.pairSignals, feed.pairSignals);
      }

      if (feed.asset) {
        state.payout = feed.payout || state.payout;
        if (feed.currentPrice && feed.currentPrice > 0) {
          state.currentPrice = feed.currentPrice;
        }
        // Never let an empty/HOLD stub wipe out a live directional signal for this pair.
        const incoming = feed.queenSignal;
        const existing = state.pairSignals[state.asset];
        const incomingIsEmpty = !incoming || (!incoming.direction && !incoming.confidence);
        const existingIsFresh = existing && existing.timestamp && Date.now() - existing.timestamp < 10000;
        if (!(incomingIsEmpty && existingIsFresh)) {
          // Merge so the new power / netScore / dominance fields survive.
          if (incoming) state.queenSignal = Object.assign({}, state.queenSignal, incoming);
        } else if (existing) {
          state.queenSignal = existing;
        }
        if (feed.workers) state.workers = feed.workers;
        if (Array.isArray(feed.candles) && feed.candles.length > 0) {
          state.candles = feed.candles;
          if (state.activePairs[feed.asset]) {
            state.activePairs[feed.asset].candles = feed.candles;
          }
        }
        state.lastError = null;
        state.connectionStatus = "STREAMING_REAL_TICKS";
      } else if (feed.lastError) {
        state.lastError = feed.lastError;
      }

      state.lastTickTime = Date.now();
      state.tickCount = (state.tickCount || 0) + 1;

      // --- BEST OPPORTUNITY PAIR ---
      // The content script already ranks every open pair using signal POWER and drops
      // anything stale; we mirror that verdict instead of re-ranking it here with a
      // confidence-only score (which used to resurrect a stale HOLD pair as "best").
      if (feed.bestPair !== undefined) state.bestPair = feed.bestPair;
      if (feed.noSetupPair !== undefined) state.noSetupPair = feed.noSetupPair;
      if (!state.bestPair) {
        // Fallback ranking for feeds that do not carry a bestPair (e.g. the web app).
        let best = null;
        const now = Date.now();
        for (const asset of Object.keys(state.pairSignals)) {
          const s = state.pairSignals[asset];
          if (!s || s.direction === "HOLD") continue;
          if (now - (s.timestamp || 0) > 15000) continue;
          const score = 1000 + (s.power || 0) * 100 + (s.confidence || 0) * 40;
          if (!best || score > best.score) {
            best = { asset: asset, score: score, direction: s.direction, confidence: s.confidence, power: s.power || 0, signal: s };
          }
        }
        state.bestPair = best;
      }

      // Extension badge mirrors the focused pair's live direction.
      if (state.queenSignal && state.queenSignal.direction) {
        updateBadge(state.queenSignal.direction);
      }

      // Raise a system notification for a NEW CALL/PUT on the focused pair, and for any
      // other open pair that just produced one. HOLDs never notify.
      if (feed.asset && feed.queenSignal) notifyNewSignal(feed.asset, feed.queenSignal);
      const others = feed.pairSignals || state.pairSignals;
      for (const asset of Object.keys(others)) {
        if (asset === feed.asset) continue;
        const s = others[asset];
        if (s && s.direction !== "HOLD" && nowFresh(s)) notifyNewSignal(asset, s);
      }

      persistState();
      forwardToWebApp("OTC_QUOTEX_LIVE_FEED", { ...state, activePairs: state.activePairs });
      forwardToHttpEndpoints({ ...feed, activePairs: state.activePairs });

      sendResponse({
        status: "ACK",
        asset: state.asset,
        pairSelectionMode: state.pairSelectionMode,
        activePairsCount: Object.keys(state.activePairs).length
      });
      return true;
    }

    // 2. State polling from Popup
    if (request.type === "GET_SWARM_STATE") {
      sendResponse({
        ...state,
        focusedAsset: state.focusedAsset || state.asset,
        isLocked: state.pairSelectionMode === "MANUAL",
        // The signal the popup must render = the FOCUSED pair's own signal.
        focusedPairSignal: (state.asset && state.pairSignals[state.asset]) || state.queenSignal
      });
      return true;
    }

    // 3. User clicks to select/switch a detected pair in popup
    if (request.type === "SELECT_DETECTED_PAIR") {
      const targetPair = request.asset;

      // Pin the pair: while MANUAL, no feed/DOM detection may move the focus away.
      state.asset = targetPair;
      state.focusedAsset = targetPair;
      state.pairSelectionMode = "MANUAL";
      state.pairLockUntil = Date.now() + 60000;

      if (state.activePairs && state.activePairs[targetPair]) {
        const p = state.activePairs[targetPair];
        if (p.currentPrice > 0) state.currentPrice = p.currentPrice;
        if (p.payout > 0) state.payout = p.payout;
        if (p.queenSignal) {
          state.queenSignal = p.queenSignal;
          state.pairSignals[targetPair] = p.queenSignal;
        }
      }
      persistState();

      // Ask the Quotex tab to focus the pair; the content script applies its own lock.
      chrome.tabs.query({}, function (tabs) {
        if (!tabs) return;
        tabs.forEach(tab => {
          if (isQuotexUrl(tab.url)) {
            chrome.tabs.sendMessage(tab.id, {
              action: "SELECT_PAIR",
              asset: targetPair,
              clickDom: true,
              source: "POPUP_SELECT"
            }).catch(() => {});
          }
        });
      });

      sendResponse({
        status: "OK",
        asset: state.asset,
        pairSelectionMode: state.pairSelectionMode,
        queenSignal: state.pairSignals[targetPair] || state.queenSignal
      });
      return true;
    }

    // 4. Forward Trade Command from Web App Bridge to Quotex Tab
    if (request.type === "FORWARD_COMMAND_TO_QUOTEX") {
      chrome.tabs.query({}, function (tabs) {
        if (!tabs) return;
        let sent = false;
        tabs.forEach(tab => {
          if (isQuotexUrl(tab.url)) {
            chrome.tabs.sendMessage(tab.id, {
              action: request.action,
              direction: request.direction,
              amount: request.amount,
              asset: request.asset
            }, function (res) {
              if (!sent) {
                sent = true;
                sendResponse(res || { success: true });
              }
            });
          }
        });
        if (!sent) {
          sendResponse({ success: false, reason: "NO_QUOTEX_TAB_FOUND" });
        }
      });
      return true;
    }

    // 5. Update Web App URL
    if (request.type === "SET_WEB_APP_URL") {
      state.webAppUrl = request.url;
      state.webAppConnected = true;
      persistState();
      sendResponse({ status: "OK" });
      return true;
    }

    // 6. Web App (React SPA) tab sync.
    // CRITICAL: the web app must NEVER be able to overwrite a live Quotex feed. Previously
    // its zero-simulation "FEED_OFFLINE_HOLD" snapshot could poison the extension state,
    // which is why the popup/HUD kept showing a signal that did not belong to the pair.
    if (request.type === "DIRECT_TAB_SYNC" || request.type === "WEBAPP_STATE_SYNC") {
      const p = request.payload || {};
      const quotexIsLive = Boolean(state.lastQuotexFeedAt) && (Date.now() - state.lastQuotexFeedAt < 10000);

      state.webAppConnected = true;
      if (p.webAppUrl) state.webAppUrl = p.webAppUrl;

      if (!quotexIsLive) {
        // Quotex is not streaming: the web app snapshot is the only source available.
        if (p.asset) {
          state.asset = p.asset;
          state.focusedAsset = p.asset;
        }
        if (p.currentPrice) state.currentPrice = p.currentPrice;
        if (p.queenSignal) state.queenSignal = p.queenSignal;
        if (p.workers) state.workers = p.workers;
        state.dataSource = "AI_STUDIO_TAB";
      }

      persistState();
      sendResponse({
        status: "SYNCED",
        acceptedWebAppState: !quotexIsLive,
        quotexIsLive: quotexIsLive,
        focusedAsset: state.asset,
        pairSelectionMode: state.pairSelectionMode
      });
      return true;
    }

    // 7. Popup / web app asks to release the manual pair pin.
    if (request.type === "RELEASE_PAIR_LOCK") {
      state.pairSelectionMode = "AUTO";
      state.pairLockUntil = 0;
      chrome.tabs.query({}, function (tabs) {
        if (!tabs) return;
        tabs.forEach(tab => {
          if (isQuotexUrl(tab.url)) {
            chrome.tabs.sendMessage(tab.id, { action: "RELEASE_PAIR_LOCK" }).catch(() => {});
          }
        });
      });
      persistState();
      sendResponse({ status: "OK", pairSelectionMode: "AUTO" });
      return true;
    }
  });
}

// Periodic tab scanner every 3 seconds
if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.create("scanTabsAlarm", { periodInMinutes: 0.1 }); // every 6 seconds
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "scanTabsAlarm") {
      scanQuotexTabs();
    }
  });
}
setInterval(scanQuotexTabs, 5000);

// ─────────────────────────────────────────────────────────────────────────────
// Mistral Vision Chart Scanner bridge (v1.3)
// Screenshots the focused Quotex chart, relays web-app scan commands, and pushes
// the combined Queen signal + vision verdict into the floating HUD.
// ─────────────────────────────────────────────────────────────────────────────
const VISION_DEFAULT_SERVER = "http://localhost:3000";

function visionServerBase(cb) {
  try {
    chrome.storage.local.get(["webAppUrl"], function (res) {
      cb((res && res.webAppUrl ? String(res.webAppUrl).replace(/\/$/, "") : VISION_DEFAULT_SERVER));
    });
  } catch (e) {
    cb(VISION_DEFAULT_SERVER);
  }
}

function isQuotexUrl(u) {
  u = u || "";
  return u.includes("quotex") || u.includes("market-qx") || u.includes("qxbroker") ||
    u.includes("qx.info") || u.includes("qx-trade") || u.includes("demo-trade");
}

/**
 * Tell the web app's scan queue how a dispatched capture ended, so a failed capture
 * stops sitting in CLAIMED state until the 60s server reclaim fires (that reclaim was
 * the source of the "VISION_SCAN_RECLAIMED" warning spam in the logs).
 */
function reportScanResult(base, commandId, ok, reason) {
  if (!commandId) return;
  try {
    fetch(base + "/api/extension/scan-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({ commandId: commandId, ok: !!ok, reason: reason || null })
    }).catch(function () {});
  } catch (e) { /* ignore */ }
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Content script asks for a screenshot of the visible chart tab.
    if (request.type === "CAPTURE_CHART") {
      const windowId = sender && sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
      // captureVisibleTab only captures the VISIBLE tab of the window. If the
      // requesting tab is a background tab we would capture the wrong page's
      // pixels (e.g. the dashboard) and label them as another pair's chart —
      // so refuse unless the sender really is the active tab.
      const doCapture = () => {
        try {
          chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 72 }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
              sendResponse({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "capture failed" });
              return;
            }
            sendResponse({ ok: true, dataUrl: dataUrl });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      };
      if (sender && sender.tab) {
        try {
          chrome.tabs.get(sender.tab.id, function (tab) {
            if (chrome.runtime.lastError || !tab || !tab.active) {
              sendResponse({ ok: false, error: "tab_not_visible" });
              return;
            }
            doCapture();
          });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      } else {
        doCapture();
      }
      return true;
    }

    // Popup button: trigger a capture+scan in the focused Quotex tab.
    if (request.type === "RUN_VISION_SCAN") {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const targets = (tabs || []).filter(function (t) { return isQuotexUrl(t.url); });
        // No fallback to background tabs: they cannot be captured correctly and
        // would submit a screenshot of whatever page is actually visible.
        if (!targets.length) {
          sendResponse({ ok: false, error: "no_active_quotex_tab" });
          return;
        }
        let dispatched = false;
        targets.forEach(function (tab) {
          try {
            chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_AND_SCAN", asset: state.asset, source: "POPUP" }, function () { void chrome.runtime.lastError; });
            dispatched = true;
          } catch (e) { /* ignore */ }
        });
        sendResponse({ ok: dispatched });
      });
      return true;
    }

    // Popup: kick a tab scan so a just-opened popup immediately reflects the
    // current connection state instead of waiting for the next 5s interval tick.
    if (request.type === "FORCE_AUTO_CONNECT") {
      try { scanQuotexTabs(); } catch (e) { /* ignore */ }
      sendResponse({
        ok: true,
        connected: state.webAppConnected,
        asset: state.asset,
        scannedTabsCount: state.scannedTabsCount
      });
      return true;
    }
  });
}

/**
 * Execute one trade/pair command claimed from the web app's /api/extension/trade-commands
 * queue, then report the DOM execution outcome back via /api/extension/command-result so
 * the web app's Execution Activity Feed shows what really happened.
 */
function reportCommandResult(base, cmd, result) {
  try {
    fetch(base + "/api/extension/command-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({
        commandId: cmd.id,
        timestamp: Date.now(),
        result: {
          action: cmd.action,
          direction: result.direction !== undefined ? result.direction : cmd.direction,
          asset: result.asset || cmd.asset,
          ok: !!result.ok,
          error: result.error || null,
          detail: result.detail || null
        }
      })
    }).catch(function () {});
  } catch (e) { /* ignore */ }
}

function executeTradeCommand(base, cmd) {
  if (!cmd || !cmd.action) return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    const target = (tabs || []).find(function (t) { return isQuotexUrl(t.url); });
    if (!target || !target.id) {
      reportCommandResult(base, cmd, { ok: false, error: "no_active_quotex_tab" });
      return;
    }
    try {
      if (cmd.action === "SWITCH_PAIR") {
        chrome.tabs.sendMessage(target.id, { action: "SWITCH_PAIR", asset: cmd.asset }, function (res) {
          if (chrome.runtime.lastError) {
            reportCommandResult(base, cmd, { ok: false, error: "content_script_unreachable", asset: cmd.asset });
            return;
          }
          reportCommandResult(base, cmd, { ok: !!(res && res.success), asset: cmd.asset, detail: res });
        });
        return;
      }
      // EXECUTE_TRADE (and anything else actionable): forward the DOM click.
      chrome.tabs.sendMessage(target.id, {
        action: "EXECUTE_TRADE",
        direction: cmd.direction,
        amount: cmd.amount,
        asset: cmd.asset
      }, function (res) {
        if (chrome.runtime.lastError) {
          reportCommandResult(base, cmd, { ok: false, error: "content_script_unreachable" });
          return;
        }
        reportCommandResult(base, cmd, { ok: !!(res && res.success), detail: res });
      });
    } catch (e) {
      reportCommandResult(base, cmd, { ok: false, error: e.message || "dispatch_failed" });
    }
  });
}

// Poll the web app for vision scan commands + the combined Queen signal.
setInterval(function () {
  visionServerBase(function (base) {
    // 1. Claim a pending scan command from the web app and forward it to Quotex tabs.
    fetch(base + "/api/extension/scan-command", { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.command) {
          const cmd = data.command;
          // Forward only to the ACTIVE Quotex tab of the last focused window —
          // background tabs cannot be captured and would mislabel the screenshot.
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
            const targets = (tabs || []).filter(function (t) { return isQuotexUrl(t.url); });
            if (!targets.length) {
              // Nothing scannable is on screen: fail the command immediately so the
              // web app shows the real reason instead of a 60s "reclaimed" timeout.
              reportScanResult(base, cmd.id, false, "no_visible_quotex_tab");
              return;
            }
            targets.forEach(function (tab) {
              try {
                chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_AND_SCAN", asset: cmd.asset, commandId: cmd.id, source: "WEB_APP" }, function (res) {
                  if (chrome.runtime.lastError) {
                    // Content script missing/unreachable in that tab (e.g. it was open
                    // before the extension loaded) — the capture will never happen.
                    reportScanResult(base, cmd.id, false, "content_script_unreachable");
                    return;
                  }
                  if (!res) {
                    reportScanResult(base, cmd.id, false, "no_capture_response");
                  }
                  // res.success === false is reported by the content script itself.
                });
              } catch (e) {
                reportScanResult(base, cmd.id, false, e.message || "dispatch_failed");
              }
            });
          });
        }
      })
      .catch(function () {});

    // 2. Claim any pending trade/pair commands queued by the web app.
    fetch(base + "/api/extension/trade-commands", { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.commands)) {
          data.commands.forEach(function (cmd) { executeTradeCommand(base, cmd); });
        }
      })
      .catch(function () {});

    // 3. Fetch server state for the combined Queen signal + latest vision verdict.
    fetch(base + "/api/swarm/state", { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        state.combinedQueen = s.combinedQueen || null;
        state.visionScan = s.vision && s.vision.latest ? s.vision.latest : null;
        chrome.tabs.query({}, function (tabs) {
          (tabs || []).forEach(function (tab) {
            if (!isQuotexUrl(tab.url)) return;
            try {
              chrome.tabs.sendMessage(tab.id, {
                action: "SERVER_STATE_UPDATE",
                combinedQueen: state.combinedQueen,
                visionScan: state.visionScan
              }, function () { void chrome.runtime.lastError; });
            } catch (e) { /* ignore */ }
          });
        });
      })
      .catch(function () {});
  });
}, 4000);
