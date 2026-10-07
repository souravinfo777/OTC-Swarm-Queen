/**
 * OTC Swarm Queen - Chrome Extension Background Service Worker (Manifest V3)
 */

const state = {
  connected: true,
  connectionMode: "AUTONOMOUS_PLUS_CLOUD",
  dataSource: "QUOTEX_ENGINE",
  asset: "USD/DZD (OTC)",
  currentPrice: 255.291,
  queenSignal: {
    direction: "HOLD",
    confidence: 0.72,
    consensus: 0.75,
    status: "PAPER_SIGNAL",
    evidence: ["Analyzing Quotex Order Flow", "Liquidity Sweep Range", "SMC Confluence"],
    upVotes: 15,
    downVotes: 3,
    holdVotes: 2
  },
  smc: {
    confluenceScore: 78,
    trend: "BULLISH",
    bos: true,
    choch: false,
    liquiditySweep: true
  },
  workers: [] as any[],
  paperTradesCount: 0,
  lastUpdated: Date.now()
};

for (let i = 1; i <= 20; i++) {
  state.workers.push({
    id: i,
    generation: 1,
    health: 95,
    fitness: 0.8,
    status: "ACTIVE",
    lastDecision: { decision: i <= 15 ? "UP" : "DOWN" }
  });
}

function updateBadge(direction: string) {
  if (typeof chrome !== "undefined" && chrome.action) {
    if (direction === "UP") {
      chrome.action.setBadgeText({ text: "UP" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    } else if (direction === "DOWN") {
      chrome.action.setBadgeText({ text: "DN" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    } else {
      chrome.action.setBadgeText({ text: "HLD" });
      chrome.action.setBadgeBackgroundColor({ color: "#64748b" });
    }
  }
}

function persistState() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ swarmState: state });
  }
}

function queryAllTabs() {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      for (const t of tabs) {
        if (!t.id || !t.url) continue;
        if (t.url.includes("aistudio.google.com") || t.url.includes("run.app") || t.url.includes("localhost")) {
          chrome.tabs.sendMessage(t.id, { type: "REQUEST_STATE_FROM_TAB" }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res && res.payload) {
              mergeState(res.payload, "AI_STUDIO_TAB");
            }
          });
        }
      }
    });
  }
}

function mergeState(p: any, source: string) {
  if (!p) return;
  state.connected = true;
  state.dataSource = source;
  if (p.asset) state.asset = p.asset;
  if (p.currentPrice) state.currentPrice = p.currentPrice;
  if (p.queenSignal) {
    state.queenSignal = p.queenSignal;
    updateBadge(p.queenSignal.direction);
  }
  if (p.smc) state.smc = p.smc;
  if (p.workers && p.workers.length > 0) state.workers = p.workers;
  if (p.paperTradesCount !== undefined) state.paperTradesCount = p.paperTradesCount;
  state.lastUpdated = Date.now();
  persistState();
}

if (typeof chrome !== "undefined") {
  chrome.runtime.onInstalled.addListener(() => {
    updateBadge("HLD");
    queryAllTabs();
  });

  chrome.runtime.onStartup.addListener(() => {
    updateBadge("HLD");
    queryAllTabs();
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "LIVE_ENGINE_UPDATE" && request.payload) {
      mergeState(request.payload, "QUOTEX_LIVE");
      sendResponse({ status: "ACK" });
      return true;
    }

    if (request.type === "DIRECT_TAB_SYNC" && request.payload) {
      mergeState(request.payload, "AI_STUDIO_TAB");
      sendResponse({ status: "ACK" });
      return true;
    }

    if (request.type === "GET_SWARM_STATE") {
      queryAllTabs();
      sendResponse(state);
      return true;
    }

    if (request.type === "FORCE_AUTO_CONNECT") {
      queryAllTabs();
      setTimeout(() => sendResponse(state), 200);
      return true;
    }
  });

  setInterval(queryAllTabs, 2000);
}
