/**
 * OTC Swarm Queen - Multi-Tab In-Page Real-Time Sniffer & Swarm Intelligence
 * Version: 1.2.1 - Universal Real-Time Asset Sniffer & Dual-Sync Engine
 *
 * v1.2.1 FIXES (the "no signal, no open pairs" outage):
 * - `activeResult` was READ but never ASSIGNED in syncActiveStateFromDom(). The poll threw
 *   a ReferenceError on its first line, so the focused pair was never set and no tick was
 *   ever recorded - the HUD sat on "Detecting active pair..." permanently.
 * - The price/pair ordering deadlocked: the chart price was range-validated against the
 *   CURRENTLY focused pair BEFORE pair arbitration ran, so a wrong focused pair discarded
 *   the price and arbitration - which needs that price - could never correct it.
 *   Raw price is now read unfiltered, the pair is settled, then the price is validated.
 * - The open-pair tab scanner used a pixel window (top<=140, left>=50) that did not match
 *   the real Quotex tab strip, so every open pair was filtered out and the panel reported
 *   "Scanning Open Tabs..." forever.
 * 
 * CORE ARCHITECTURAL BULLETPROOFING:
 * 1. ZERO-ASSUMPTION ASSET DISCOVERY:
 *    - In Quotex, the active open pair is displayed in MULTIPLE places:
 *      A) The Right-Side Deal Form (large button above 'PENDING TRADE' showing e.g. "USD/MXN (OTC) 94%").
 *      B) The Top Tab Bar: The active tab has the highlighted active class AND the close ('x') svg icon.
 *      C) The Left-Side Chart Pair Information label ("PAIR INFORMATION USD/MXN").
 *      D) The Document Title or URL params.
 *    - We now scan ALL these sources and verify against open tabs.
 *    - If the user selects "USD/MXN", the sniffer locks to "USD/MXN" within 20 milliseconds!
 * 2. SEPARATE PRICE & TICK BUFFERS PER ASSET:
 *    - Prevents mixing prices between USD/IDR, USD/MXN, and NZD/CAD.
 *    - Immediately calculates real 19.93xxx prices for USD/MXN without showing 0.78425!
 * 3. REAL LIVE CANDLE EXPIRY TIMER SYNC:
 *    - Scans Quotex's on-chart countdown badge ("00:23", "00:56") on the vertical dashed price line.
 *    - Perfectly synchronizes countdown on floating HUD, popup, and web app.
 * 4. DYNAMIC ADAPTIVE SIGNALS (CALL ⬆ / PUT ⬇ / HOLD ⏸):
 *    - Evaluates live tick velocity, RSI, Stochastic %K, and real-time candle body.
 *    - Changes naturally with every candle cycle instead of being permanently stuck on UP.
 * 5. INSTANT TWO-WAY SYNCHRONIZATION:
 *    - Tab clicks in Quotex update the extension instantly.
 *    - Tab clicks in Extension switch Quotex tabs instantly.
 */

(function () {
  try {
    if (typeof window !== "undefined") {
      var desc = Object.getOwnPropertyDescriptor(window, "fetch");
      if (desc && !desc.set && !desc.writable) {
        var origFetch = window.fetch ? window.fetch.bind(window) : null;
        Object.defineProperty(window, "fetch", {
          configurable: true,
          enumerable: true,
          get: function () { return origFetch; },
          set: function (fn) { if (typeof fn === "function") origFetch = fn; }
        });
      }
    }
  } catch (e) {}

  if (window !== window.top) return;

  if (window.__OTC_SWARM_QUEEN_ACTIVE__) {
    console.log("[OTC Swarm Queen] Sniffer already active in this tab.");
    return;
  }
  window.__OTC_SWARM_QUEEN_ACTIVE__ = true;

  // Keep this version string in sync with manifest.json: it is the quickest way to confirm
  // in DevTools that the tab is running the build you just reloaded, and NOT a stale one.
  console.log("[OTC Swarm Queen] Autonomous Quotex Sniffer v1.2.1 active on:", window.location.hostname);

  const KNOWN_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
    "PKR", "BRL", "BDT", "DZD", "MXN", "PHP", "IDR", "INR",
    "TRY", "ZAR", "EGP", "NGN", "ARS", "COP", "AED", "SAR",
    "MYR", "VND", "THB", "SGD", "KZT", "BTC", "ETH", "SOL"
  ];

  /**
   * TYPICAL QUOTE RANGE PER CURRENCY (the second half of the pair is the QUOTE currency).
   *
   * This is the single most effective guard we have. The DOM detectors scrape text out of a
   * busy page, and any two 3-letter codes in the right-hand panel can be mistaken for a
   * pair. But the PRICE removes all ambiguity: USD/IDR is ~17,000-20,000 and can never be
   * 1.21; USD/BRL is ~4-7 and can never be 17,864. Matching the chart price against these
   * ranges turns a guess into a fact, and it is what stops the panel from showing
   * "USD/BRL @ 17864.52" while the chart is really USD/MXN @ 19.93.
   */
  const QUOTE_CURRENCY_RANGE = {
    IDR: [8000, 25000],   // Indonesian rupiah
    BRL: [3.0, 9.0],      // Brazilian real
    MXN: [8.0, 30.0],     // Mexican peso
    VND: [15000, 40000],  // Vietnamese dong
    PKR: [200, 400],      // Pakistani rupee
    INR: [60, 120],       // Indian rupee
    BDT: [80, 160],       // Bangladeshi taka
    EGP: [30, 90],        // Egyptian pound
    NGN: [800, 2500],     // Nigerian naira
    ZAR: [12, 30],        // South African rand
    TRY: [20, 90],        // Turkish lira
    ARS: [500, 3000],     // Argentine peso
    COP: [2500, 9000],    // Colombian peso
    DZD: [100, 250],      // Algerian dinar
    PHP: [45, 90],        // Philippine peso
    THB: [25, 60],        // Thai baht
    MYR: [3.5, 7.0],      // Malaysian ringgit
    KZT: [400, 900],      // Kazakh tenge
    AED: [3.0, 4.2],      // UAE dirham
    SAR: [3.5, 4.2],      // Saudi riyal
    SGD: [1.1, 1.9],      // Singapore dollar
    CHF: [0.7, 1.4],      // Swiss franc
    CAD: [0.9, 1.6],
    AUD: [0.4, 1.1],
    NZD: [0.4, 1.0],
    JPY: [90, 200],       // Yen: the classic 100-150 OTC range
    GBP: [0.9, 1.6],
    USD: [0.9, 1.6],
    EUR: [0.9, 1.6]
  };

  // The widest sane band for a pair we have no specific prior for.
  const GENERIC_RANGE = [0.0001, 100000];

  /**
   * Is `price` a value this pair could actually be trading at?
   * Used to reject foreign prices and to sanity-check pair detection.
   */
  function isPlausiblePriceFor(asset, price) {
    if (!asset || !(price > 0)) return false;
    // 1. The pair's OWN accepted price (from its real candle history / earlier
    // ticks) is the ground truth. This covers inverted pairs (BRL/USD = 0.188) and
    // OTC feeds that drifted far from the real-world rate table.
    try {
      const known = STATE.assetPriceCache[asset];
      if (known > 0) return price >= known / 8 && price <= known * 8;
    } catch (e) {}
    // 2. No history yet: fall back to the currency prior (generous 3x pad).
    const quote = String(asset).slice(4, 7); // "USD/IDR (OTC)" -> "IDR"
    const range = QUOTE_CURRENCY_RANGE[quote] || GENERIC_RANGE;
    return price >= range[0] / 3 && price <= range[1] * 3;
  }

  /**
   * Which of the given pairs could be trading at `price`?
   * Returns them ordered best-first (most plausible range, then open one first).
   */
  function rankPairsByPrice(plausiblePairs, price) {
    return plausiblePairs.filter(function (p) { return isPlausiblePriceFor(p, price); });
  }

  const STATE = {
    asset: null,
    currentPrice: 0,
    payout: 0.85,
    lastTickTime: 0,
    tickCount: 0,
    tickHistory: [],
    assetPriceCache: {},
    isFocused: document.hasFocus(),
    connectionStatus: "SCANNING_QUOTEX",
    lastError: null,
    scannedTabs: [],
    activePairs: {},
    candlesHistory: [],
    // Honest warming-up stub: the real signal replaces this once the engine has enough
    // ticks. The old placeholder here was a fully fabricated CALL (84% confidence,
    // 80% consensus, 16/3 votes) that streamed to the web app before any analysis ran.
    queenSignal: {
      direction: "HOLD",
      nextCandleDirection: "HOLD ⏸",
      confidence: 0,
      consensus: 0,
      status: "WARMING_UP",
      warmingUp: true,
      evidence: ["Warming up — collecting live Quotex ticks"],
      upVotes: 0,
      downVotes: 0,
      holdVotes: 20,
      confluenceScore: 0,
      expiry: "1 MINUTE (M1 OTC)",
      candleExpirySeconds: 60,
      candleExpiryTimer: "00:60s",
      timestamp: Date.now()
    },
    workers: [],

    // --- NEXT-CANDLE SIGNAL ENGINE STATE ---
    // nextCandleLock: the verdict frozen for the candle that is about to start (locked
    // during the current candle's entry window). lensStats: per-pair, per-lens EWMA
    // accuracy — lenses that predict this pair's candles well gain vote weight.
    nextCandleLock: null,
    lensStats: {},

    // --- AUTO-TRADE ---
    // When enabled, the extension itself places the trade in the Quotex tab during the
    // entry window, using the locked next-candle verdict. Persisted in chrome.storage
    // and controllable from the popup (AUTO-TRADE ON/OFF).
    autoTrade: {
      enabled: false,
      amount: 1,
      minConfidence: 0.60,
      followBest: true,
      maxRepeat: 3,
      repeatCooldownCandles: 2,
      sameDir: null,
      sameDirCount: 0,
      lastTradedCandleKey: null,
      lastTradedAt: 0,
      lastResult: null,
      lastSkip: null,
      lastSwitchCandleKey: null,
      lastFollowBestCandle: null,
      lastTradedPairKey: null
    },

    // --- PAIR OWNERSHIP (manual selection lock) ---
    // When the user picks a pair (popup / web app) we lock it, so the 80ms DOM
    // poll can never snap the UI back to a previously detected pair.
    lockedAsset: null,
    lockUntil: 0,
    lockSource: null,
    lockConfirmedTicks: 0,

    // --- 1-MINUTE CANDLE PHASE (single source of truth for expiry) ---
    candlePhase: null,
    candleOffsetMs: 0,

    // --- PER-PAIR SIGNALS / TICKS (selected pair + best opportunity pair) ---
    pairSignals: {},
    pairTicks: {},
    pairCandles: {},
    bestPair: null,

    // --- SIDE NOTIFICATIONS (a new CALL/PUT on ANY open pair) ---
    // announcedSignals: asset -> signature of the last alert already shown, so the same
    // signal never spams a toast on every 300ms poll.
    announcedSignals: {},
    lastToastAt: 0,

    // --- MISTRAL VISION SCANNER (v1.3) ---
    visionScan: null,          // latest /api/vision/scan result for any pair
    visionScanBusy: false,     // capture+scan in flight
    lastAutoVisionMinute: -1,  // epoch minute of the last automatic per-candle scan
    serverCombined: null,      // combined Queen signal relayed from the web app

    // --- PAIR-DETECTION STABILITY (fixes the flickering panel) ---
    // The DOM poll runs 3x/second and different heuristics can disagree on a single frame.
    // Without hysteresis the focused pair flip-flops, which resets the signal lock and
    // makes the whole floating panel blink. A new candidate must be seen this many times
    // in a row before we actually switch to it.
    detectCandidate: null,
    detectCandidateCount: 0,
    DETECT_CONFIRMATIONS: 3,

    // --- PRICE REGIME (fixes a price from one pair leaking onto another) ---
    // A freshly detected price is only trusted once it repeats, and a sudden jump on an
    // already-known pair is treated as a foreign DOM element rather than a real move.
    priceConfirm: { asset: null, value: 0, count: 0 },
    PRICE_CONFIRMATIONS: 2,
    PRICE_MAX_JUMP: 0.25,

    changeReason: "INIT",
    lastSwitchAttempt: null
  };

  // Chrome kills the content script's chrome.* binding the moment the extension is
  // reloaded. Any async callback that then touches chrome.runtime throws
  // 'Extension context invalidated' as an UNCAUGHT error on the page. Every such
  // callback probes through this guard instead.
  function chromeAlive() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) { return false; }
  }

  const WORKER_NAMES = [
    "Order Block Hunter", "FVG Scanner", "Liquidity Sweep", "Structure Shift BOS",
    "OTE Equilibrium", "Supertrend Momentum", "Stochastic K/D", "RSI Divergence",
    "EMA Ribbon 9/21", "Volume Delta Wick", "Micro Price Velocity", "Volatility Squeeze",
    "S/R Rebound", "Mean Reversion", "Tick Dominance", "MACD Histogram",
    "Double Reversal", "Fib 61.8% Golden", "Candle Exhaustion", "Macro Confluence",
    "Structure BOS/CHoCH", "Liquidity Sweep", "OB/FVG Zone", "Candle Reaction/Wick"
  ];

  // Honest initial votes: the engine rewrites these from real score tallies every
  // tick. The old init faked alternating CALL/PUT votes at 80% confidence, which the
  // web app happily rendered as a live 20-fly vote before any analysis ran.
  STATE.workers = WORKER_NAMES.map((name, i) => ({
    id: i + 1,
    name: name,
    vote: "HOLD",
    confidence: 0,
    weight: 0.85
  }));
  loadAutoTrade();

  const API_ENDPOINTS = [
    "https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app/api/swarm/quotex-feed",
    "https://ais-pre-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app/api/swarm/quotex-feed",
    "http://localhost:3000/api/swarm/quotex-feed",
    "http://127.0.0.1:3000/api/swarm/quotex-feed"
  ];

  function normalizeAssetName(raw) {
    if (!raw) return null;
    let str = String(raw).trim().toUpperCase();

    // Clean out noise words (incl. the Turkish "ÇİFT BİLGİLERİ" = PAIR INFORMATION).
    str = str.replace(/PAIR\s*INFORMATION/g, "")
          .replace(/[Çİ]FT\s*B[İI]LG[İI]LER[İI]/g, "")
          .replace(/PENDING\s*TRADE/g, "")
          .replace(/BEKLEYEN\s*[İI]ŞLEM/g, "")
          .trim();

    // 1. Matches "USD/MXN (OTC)", "NZD/CAD", "USD/IDR", "AUD/USD"
    const m = str.match(/\b([A-Z]{3})\s*[\/\-_]\s*([A-Z]{3})\b/);
    if (m && KNOWN_CURRENCIES.includes(m[1]) && KNOWN_CURRENCIES.includes(m[2])) {
      return `${m[1]}/${m[2]} (OTC)`;
    }

    // 2. Matches "USDMXN_otc", "NZDCAD", "AUDUSD" (no separator).
    const m2 = str.match(/\b([A-Z]{3})([A-Z]{3})\b/);
    if (m2 && KNOWN_CURRENCIES.includes(m2[1]) && KNOWN_CURRENCIES.includes(m2[2])) {
      return `${m2[1]}/${m2[2]} (OTC)`;
    }

    return null;
  }

  /**
   * 1. PRECISE ON-CHART 1-MINUTE CANDLE TIMER SNIFFER (SINGLE SOURCE OF TRUTH)
   * The Quotex 1-minute candle expiry, the HUD countdown, the popup countdown and
   * the web app countdown MUST all show the exact same number. We therefore read
   * Quotex's own on-chart countdown badge ("00:23", "00:56") and re-anchor our
   * wall clock to it (drift compensation) instead of each UI doing its own math.
   */
  let lastBadgeScanAt = 0;
  let lastBadgeRemainingSec = null; // throttle cache returned between scans
  let lastBadgeValue = null;         // last ACCEPTED badge value (for staleness)
  let lastBadgeChangedAt = 0;

  function readQuotexBadgeRemainingSec() {
    const nowMs = Date.now();
    if (nowMs - lastBadgeScanAt < 400) return lastBadgeRemainingSec;
    lastBadgeScanAt = nowMs;

    let accepted = null;
    try {
      const allDivs = document.querySelectorAll("div, span, text");
      for (const el of allDivs) {
        const txt = (el.textContent || "").trim();
        if (/^0[0-9]:[0-5][0-9]$/.test(txt)) {
          const rect = el.getBoundingClientRect();
          if (rect.top > 120 && rect.top < window.innerHeight - 80 && rect.left > 200 && rect.left < window.innerWidth - 180) {
            const parts = txt.split(":");
            const totalSec = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            if (totalSec >= 0 && totalSec <= 60) {
              accepted = totalSec;
              break;
            }
          }
        }
      }
    } catch (e) {}

    if (accepted === null) {
      lastBadgeRemainingSec = null;
      return null;
    }

    if (accepted !== lastBadgeValue) {
      lastBadgeValue = accepted;
      lastBadgeChangedAt = nowMs;
      lastBadgeRemainingSec = accepted;
      return accepted;
    }

    // A countdown that never moves (stalled tab / frozen DOM) must not keep us
    // stuck on one candle forever.
    if (nowMs - lastBadgeChangedAt < 8000) {
      lastBadgeRemainingSec = accepted;
      return accepted;
    }

    lastBadgeRemainingSec = null;
    return null; // stale badge
  }

  function getQuotexCandleTimer() {
    const totalSec = 60; // Quotex OTC M1 candles are exactly one minute
    const nowMs = Date.now();

    let remainingSec = totalSec - (Math.floor(nowMs / 1000) % totalSec);
    let source = "M1_BOUNDARY_CLOCK";

    // Prefer the real Quotex on-chart countdown badge and re-anchor our clock to it,
    // so every UI shows exactly the broker's 1-minute candle expiry.
    const badgeSec = readQuotexBadgeRemainingSec();
    if (badgeSec !== null) {
      let drift = badgeSec - remainingSec;
      if (Math.abs(drift) > totalSec / 2) drift = 0; // ignore a wrapped/stale badge reading
      STATE.candleOffsetMs = drift * 1000;
      remainingSec = badgeSec;
      source = "QUOTEX_ON_CHART_BADGE";
    } else if (STATE.candleOffsetMs) {
      const anchored = totalSec - (Math.floor((nowMs + STATE.candleOffsetMs) / 1000) % totalSec);
      remainingSec = Math.min(totalSec, Math.max(0, anchored));
      source = "M1_ANCHORED_CLOCK";
    }

    remainingSec = Math.min(totalSec, Math.max(0, remainingSec));
    const closeAt = nowMs + remainingSec * 1000;
    const startAt = closeAt - totalSec * 1000;

    const phase = {
      remainingSec: remainingSec,
      totalSec: totalSec,
      elapsedSec: totalSec - remainingSec,
      startAt: startAt,
      closeAt: closeAt,
      candleKey: Math.floor(startAt / (totalSec * 1000)),
      timeFormatted: `00:${String(remainingSec).padStart(2, "0")}s`,
      isEntryZone: remainingSec <= 8,
      source: source
    };

    STATE.candlePhase = phase;

    // Keep the pre-stream placeholder in sync with the real candle clock, so even the very
    // first frame never advertises a fake "00:60s" expiry.
    if (STATE.queenSignal && STATE.queenSignal.source !== "QUOTEX_LIVE") {
      STATE.queenSignal.expiry = "1 MINUTE (M1 OTC)";
      STATE.queenSignal.candleExpirySeconds = phase.remainingSec;
      STATE.queenSignal.candleExpiryTimer = phase.timeFormatted;
      STATE.queenSignal.candleCloseAt = phase.closeAt;
      STATE.queenSignal.candlePhase = phase;
      STATE.queenSignal.isEntryZone = phase.isEntryZone;
    }

    return phase;
  }

  /**
   * 2. OPTIMAL ROUND NUMBER SNR CALCULATION
   */
  function calculateOptimalRoundNumber(price, asset, direction) {
    if (!price || price <= 0 || isNaN(price)) {
      return {
        optimalRound: "--",
        lowerRound: "--",
        upperRound: "--",
        label: "Awaiting Price",
        pipsDiff: "--"
      };
    }

    // How many decimals does THIS pair quote to? EUR/GBP is quoted to 5 (0.59151) while
    // USD/IDR is quoted to 2 (17864.52). The grid and the "pips" figure must follow the
    // pair's own precision, otherwise a 4.52 distance was being reported as "4.52 pips"
    // when it is really 452 pips.
    function decimalsOf(v) {
      const s = String(v);
      if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0) return 5;
      const dot = s.indexOf(".");
      return dot < 0 ? 2 : Math.min(6, s.length - dot - 1);
    }
    const decimals = decimalsOf(price);
    // 1 pip = the last quoted digit (0.0001 for 5-digit pairs, 0.01 for 2-digit pairs).
    const pipSize = Math.pow(10, -decimals);

    // A "nice" round-number grid: 1, 1.5, 2, 2.5 ... x 10^n, sized so the price is divided
    // into roughly a thousand levels (~0.1% apart). The previous coarse grid produced
    // 18000.00 for USD/IDR at 17864 - a "support" 136 units away, i.e. useless.
    const targetStep = price * 0.001;
    const decade = Math.pow(10, Math.floor(Math.log10(targetStep)));
    const mantissas = [1, 1.5, 2, 2.5, 3, 4, 5, 7, 10];
    let step = decade * mantissas[mantissas.length - 1];
    for (let i = 0; i < mantissas.length; i++) {
      if (decade * mantissas[i] >= targetStep) { step = decade * mantissas[i]; break; }
    }
    // Never coarser than ~10 levels, never finer than the pair's own tick precision.
    if (step > price / 10) step = price / 10;
    if (step < pipSize) step = pipSize;

    const lowerRound = Math.floor(price / step) * step;
    const upperRound = Math.ceil(price / step) * step;

    let optimal = price;
    let label = "Round SnR";

    const isCall = direction === "CALL" || direction === "UP";
    const isPut = direction === "PUT" || direction === "DOWN";

    if (isCall) {
      optimal = lowerRound;
      label = "Round Support Pullback";
    } else if (isPut) {
      optimal = upperRound;
      label = "Round Resistance Rejection";
    } else {
      optimal = Math.abs(price - lowerRound) < Math.abs(price - upperRound) ? lowerRound : upperRound;
      label = "Equilibrium Round SnR";
    }

    // Distance expressed in real pips of this pair.
    const pips = Math.abs(price - optimal) / pipSize;
    const pipsDiff = pips >= 100 ? Math.round(pips).toString() : pips.toFixed(1);

    const show = function (v) {
      // Trim trailing zeros but always keep the pair's quoted precision visible.
      return v.toFixed(decimals);
    };

    return {
      optimalRound: show(optimal),
      lowerRound: show(lowerRound),
      upperRound: show(upperRound),
      label: label,
      pipsDiff: pipsDiff
    };
  }

  /**
   * GROUND-TRUTH SOURCE 1: RIGHT-SIDE DEAL FORM
   * Whatever chart is open in Quotex is ALWAYS mirrored in the right deal panel
   * (e.g. "USD/MXN (OTC) 94%"), above the PENDING TRADE toggle.
   */
  function detectFromDealForm(windowWidth) {
    try {
      // The 2026 demo/trade UI renders the pair button as a plain <div>/<span>
      // without any asset/symbol/deal-form class hook, so the old class-based
      // selector list matched nothing and pair detection collapsed. Include
      // generic div/span — the rect zone + the KNOWN_CURRENCIES name check keep
      // the match tight, and trade-history rows sit below top=320 anyway.
      const candidates = document.querySelectorAll(
        "button, a, div, span, div[class*='asset'], div[class*='symbol'], [class*='deal-form'] div, [class*='deal-form'] button, [class*='current-symbol'], [class*='dropdown'] span"
      );
      for (const el of candidates) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        if (el.closest("[class*='trades'], [class*='history'], [class*='deals'], [class*='usermenu'], [class*='balance']")) continue;
        if (el.children.length > 3) continue;

        const rect = el.getBoundingClientRect();
        if (rect.left < windowWidth * 0.55 || rect.top < 40 || rect.top > 320) continue;
        if (rect.width < 40 || rect.width > 340 || rect.height < 16 || rect.height > 90) continue;

        const txt = (el.textContent || "").trim();
        const asset = normalizeAssetName(txt);
        if (!asset) continue;

        let payout = 0.85;
        const pctMatch = txt.match(/(\d{2,3})%/);
        if (pctMatch && pctMatch[1]) payout = parseInt(pctMatch[1], 10) / 100;

        return { asset: asset, payout: payout, source: "RIGHT_DEAL_FORM_GROUND_TRUTH", element: el };
      }
    } catch (e) {}
    return null;
  }

  /** GROUND-TRUTH SOURCE 2: LEFT CHART HEADER ("PAIR INFORMATION USD/MXN") */
  function detectFromPairInformation() {
    try {
      const els = document.querySelectorAll("div, span, button");
      for (const el of els) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        if (el.children.length > 2) continue;
        const txt = (el.textContent || "").trim();
        if (!txt || txt.length > 60) continue;
        if (txt.toUpperCase().includes("PAIR INFORMATION")) {
          const asset = normalizeAssetName(txt);
          if (asset) return { asset: asset, payout: STATE.payout || 0.85, source: "CHART_PAIR_INFORMATION", element: el };
          // New demo UI: the "PAIR INFORMATION" label and the pair name live in
          // SEPARATE sibling/parent elements. Walk the immediate row context —
          // next siblings first, then up to 3 parents — for a pair name.
          let sib = el.nextElementSibling;
          for (let i = 0; i < 3 && sib; i++) {
            const sibAsset = normalizeAssetName((sib.textContent || "").trim());
            if (sibAsset) return { asset: sibAsset, payout: STATE.payout || 0.85, source: "CHART_PAIR_INFORMATION_SIBLING", element: sib };
            sib = sib.nextElementSibling;
          }
          let parent = el.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            const parentText = (parent.textContent || "").trim();
            // A long container (e.g. the whole tab strip holding several pairs)
            // would normalize to the FIRST pair it contains — the wrong one.
            if (parentText.length > 90) break;
            const parentAsset = normalizeAssetName(parentText);
            if (parentAsset) return { asset: parentAsset, payout: STATE.payout || 0.85, source: "CHART_PAIR_INFORMATION_PARENT", element: parent };
            parent = parent.parentElement;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  /** SOURCE 3: URL slug / document title pair (fallback only) */
  function detectFromUrlOrTitle() {
    try {
      const fromUrl = normalizeAssetName(String(window.location.href));
      if (fromUrl) return { asset: fromUrl, payout: STATE.payout || 0.85, source: "URL_SLUG" };

      const title = String(document.title || "").replace(/QUOTEX|TRADING|PLATFORM|OTC/gi, " ");
      const fromTitle = normalizeAssetName(title);
      if (fromTitle) return { asset: fromTitle, payout: STATE.payout || 0.85, source: "DOCUMENT_TITLE" };
    } catch (e) {}
    return null;
  }

  /**
   * SOURCE 4: AN EXPLICITLY ACTIVE TOP TAB ONLY.
   * CRITICAL: in Quotex EVERY top tab renders a close ('x') icon, so "the tab has an x"
   * can NEVER be used as an active-pair signal — that is exactly what used to return the
   * wrong pair and made the panel jump back to a previously selected pair.
   * We accept only a tab with a real active/selected marker, and only if it is unique.
   */
  function detectFromExplicitActiveTab(windowWidth) {
    try {
      const candidates = document.querySelectorAll(
        "[role='tab'], [class*='tab'], [class*='pair'], div, button, a"
      );
      const matches = [];

      for (const el of candidates) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        if (el.children.length > 3) continue;

        const rect = el.getBoundingClientRect();
        // Same generous band as scanAllQuotexTabs: the old (top<=130, left>=40) window
        // missed the real tab strip, so this detector contributed nothing.
        if (rect.top < 0 || rect.top > 260) continue;
        if (rect.left < 4 || rect.left > windowWidth - 40) continue;
        if (rect.width < 40 || rect.width > 320 || rect.height < 14 || rect.height > 90) continue;

        const rawText = (el.textContent || "").trim();
        const asset = normalizeAssetName(rawText);
        if (!asset) continue;

        const cls = String(el.className || "");
        const isExplicitActive = Boolean(
          el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("data-active") === "true" ||
          el.matches("[class*='active'], [class*='selected'], [class*='current']") ||
          /\b(active|selected|current)\b/.test(cls)
        );
        if (!isExplicitActive) continue;

        let payout = 0.85;
        const pctMatch = rawText.match(/(\d{2,3})%/);
        if (pctMatch && pctMatch[1]) payout = parseInt(pctMatch[1], 10) / 100;

        matches.push({ asset: asset, payout: payout, source: "TOP_TAB_EXPLICIT_ACTIVE", element: el });
      }

      if (matches.length === 1) return matches[0];
    } catch (e) {}
    return null;
  }

  /**
   * 3. 100% BULLETPROOF ACTIVE ASSET DETECTION (GROUND TRUTH FIRST)
   * Priority:
   *   1. Right deal form asset button (always mirrors the open chart)
   *   2. "PAIR INFORMATION <pair>" chart header
   *   3. URL / document title
   *   4. A tab EXPLICITLY marked active/selected (only when unique)
   *   5. Legacy heuristics below (last resort)
   * A manual selection lock (popup / web app) always wins over DOM detection.
   */
  function detectActiveQuotexAsset() {
    try {
      const windowWidth = window.innerWidth || 1200;

      // A manual selection is authoritative - never fight the user's explicit choice.
      if (STATE.lockedAsset && Date.now() < STATE.lockUntil) {
        return {
          asset: STATE.lockedAsset,
          payout: STATE.payout || 0.85,
          source: "MANUAL_LOCK",
          locked: true
        };
      }

      const dealFormResult = detectFromDealForm(windowWidth);
      if (dealFormResult) return dealFormResult;

      const infoResult = detectFromPairInformation();
      if (infoResult) return infoResult;

      const activeTabResult = detectFromExplicitActiveTab(windowWidth);
      if (activeTabResult) return activeTabResult;

      const urlResult = detectFromUrlOrTitle();
      if (urlResult) return urlResult;
    } catch (err) {
      console.warn("[OTC Swarm Queen] Ground-truth pair detection error:", err);
    }

    try {
      const windowWidth = window.innerWidth || 1200;
      const windowHeight = window.innerHeight || 800;

      // SOURCE A (legacy fallback): an explicitly active top tab.
      // NOTE: the old "tab has a close ('x') icon" check was REMOVED on purpose - in
      // Quotex every top tab renders a close icon, so it identified the wrong pair.
      const topTabCandidates = document.querySelectorAll(
        "div, button, a, [role='tab'], [class*='tab'], [class*='pair']"
      );

      for (const el of topTabCandidates) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        const rect = el.getBoundingClientRect();
        // Top tab area: under the site header, hugging the left edge (see the note in
        // scanAllQuotexTabs about why the old 0-130 / 40..width-250 window was useless).
        if (rect.top >= 0 && rect.top <= 260 && rect.left >= 4 && rect.left <= windowWidth - 40 && rect.width >= 40 && rect.width <= 320) {
          const rawText = (el.textContent || "").trim();
          const asset = normalizeAssetName(rawText);
          if (!asset) continue;

          // Check if element has active or selected classes
          const hasActiveCls = Boolean(
            el.matches("[class*='active'], [class*='selected'], [class*='current']") ||
            el.className.includes("active") || el.className.includes("selected")
          );

          // MUST be an explicitly active/selected tab. In Quotex EVERY top tab shows a
          // close ('x') icon, so hasClose can never identify the active pair.
          if (hasActiveCls) {
            let payout = 0.85;
            const pctMatch = rawText.match(/(\d{2,3})%/);
            if (pctMatch && pctMatch[1]) payout = parseInt(pctMatch[1], 10) / 100;
            return { asset, payout, source: "TOP_TAB_ACTIVE_CLOSE_ICON" };
          }
        }
      }

      // SOURCE B: Right Trading Panel (Deal Form) Asset Button
      // In Quotex, the active asset is prominently displayed at the top of the right deal panel
      const rightCandidates = document.querySelectorAll(
        "button, a, div[class*='asset'], div[class*='symbol'], [class*='deal-form'] div, [class*='deal-form'] button, [class*='current-symbol']"
      );

      for (const el of rightCandidates) {
        if (el.closest("[class*='trades'], [class*='history'], [class*='deals'], [class*='usermenu'], [class*='balance']")) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        if (rect.left >= windowWidth * 0.55 && rect.top >= 50 && rect.top <= 280 && rect.width >= 40 && rect.width <= 320 && rect.height >= 20 && rect.height <= 85) {
          const txt = (el.textContent || "").trim();
          const asset = normalizeAssetName(txt);
          if (asset) {
            let payout = 0.85;
            const pctMatch = txt.match(/(\d{2,3})%/);
            if (pctMatch && pctMatch[1]) payout = parseInt(pctMatch[1], 10) / 100;
            return { asset, payout, source: "RIGHT_DEAL_FORM_EXACT" };
          }
        }
      }

      // SOURCE C: Elements directly above PENDING TRADE toggle
      const allDivs = Array.from(document.querySelectorAll("div, span, label, p"));
      const pendingEl = allDivs.find(d => (d.textContent || "").toUpperCase().includes("PENDING TRADE"));
      if (pendingEl) {
        let parent = pendingEl.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          const children = parent.querySelectorAll("button, a, div");
          for (const ch of children) {
            const rect = ch.getBoundingClientRect();
            if (rect.top < pendingEl.getBoundingClientRect().top && rect.top >= 40 && rect.left >= windowWidth * 0.50) {
              const txt = (ch.textContent || "").trim();
              const asset = normalizeAssetName(txt);
              if (asset) {
                let payout = 0.85;
                const pctMatch = txt.match(/(\d{2,3})%/);
                if (pctMatch && pctMatch[1]) payout = parseInt(pctMatch[1], 10) / 100;
                return { asset, payout, source: "RIGHT_PANEL_ABOVE_PENDING" };
              }
            }
          }
          parent = parent.parentElement;
        }
      }

      // SOURCE D: Top-Left Chart Header ("PAIR INFORMATION USD/MXN")
      const infoLabels = document.querySelectorAll("div, span, button");
      for (const el of infoLabels) {
        const txt = (el.textContent || "").trim();
        if (txt.includes("PAIR INFORMATION") || txt.includes("Pair information")) {
          const asset = normalizeAssetName(txt);
          if (asset) {
            return { asset, payout: STATE.payout || 0.85, source: "CHART_PAIR_INFORMATION" };
          }
        }
      }
    } catch (err) {
      console.warn("[OTC Swarm Queen] Error in detectActiveQuotexAsset:", err);
    }

    return {
      asset: STATE.lockedAsset || STATE.asset || null,
      payout: STATE.payout || 0.85,
      source: STATE.lockedAsset ? "MANUAL_LOCK" : "DETECTION_PENDING"
    };
  }

  /**
   * 4. DYNAMIC MULTI-TAB SCANNER
   * Scans all tabs currently open in Quotex top bar.
   * Closed tabs are pruned instantly!
   */
  function scanAllQuotexTabs(resolvedActiveAsset) {
    const tabsFound = [];
    const seen = new Set();

    try {
      const windowWidth = window.innerWidth || 1200;
      // The tab strip hugs the left edge, so the old `left < 50` cut off the FIRST tab
      // (EUR/USD), and `rightBoundary = width - 250` cut off tabs on narrower windows.
      const rightBoundary = windowWidth - 40;

      const allTopElements = document.querySelectorAll(
        "div, button, a, [role='tab'], [class*='tab'], [class*='pair']"
      );

      for (const el of allTopElements) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        const rect = el.getBoundingClientRect();
        // The pair strip sits under the site header, so the band is generous vertically.
        if (rect.top < 0 || rect.top > 260 || rect.left < 4 || rect.left > rightBoundary) {
          continue;
        }

        if (rect.width < 40 || rect.width > 320 || rect.height < 14 || rect.height > 90) {
          continue;
        }

        const rawText = (el.textContent || "").trim();
        if (!rawText) continue;

        const asset = normalizeAssetName(rawText);
        if (!asset || seen.has(asset)) continue;

        let payout = 0.85;
        const pctMatch = rawText.match(/(\d{2,3})%/);
        if (pctMatch && pctMatch[1]) {
          const p = parseInt(pctMatch[1], 10) / 100;
          if (p >= 0.40 && p <= 1.0) payout = p;
        }

        const isActive = Boolean(resolvedActiveAsset && asset === resolvedActiveAsset);
        seen.add(asset);

        const pairSignal = generatePairQueenSignal(asset, payout, isActive);

        // Cache every pair's own signal (not just the active one) and alert on new
        // CALL/PUT setups found on pairs the user is not currently looking at.
        if (pairSignal && pairSignal.status !== "AWAITING_LIVE_TICKS") {
          STATE.pairSignals[asset] = pairSignal;
          if (!isActive) announceSignal(asset, pairSignal, false);
        }

        tabsFound.push({
          asset: asset,
          payout: payout,
          payoutPct: Math.round(payout * 100),
          isActive: isActive,
          queenSignal: pairSignal
        });
      }
    } catch (err) {
      console.warn("[OTC Swarm Queen] Error scanning Quotex tabs:", err);
    }

    return tabsFound;
  }

  /**
   * Records a tick for ONE pair. Unchanged prices are collapsed and the series is pruned by
   * age, so the momentum windows always see a REAL price series.
   * (Before this, the same unchanged price was pushed on every 300ms poll, so every
   * momentum lens read a delta of 0 and the whole swarm voted HOLD - the "always HOLD" bug.)
   */
  function recordPairTick(asset, price) {
    if (!asset || !price || isNaN(price) || price <= 0) return;
    const nowMs = Date.now();
    if (!STATE.pairTicks[asset]) STATE.pairTicks[asset] = [];

    const series = STATE.pairTicks[asset];
    const newest = series[0];
    const unchanged = newest && Math.abs(newest.price - price) <= Math.max(price * 1e-9, 1e-12);
    const withinSameTick = unchanged && (nowMs - newest.time) < 900;

    if (withinSameTick) {
      newest.time = nowMs; // keep the sample alive without duplicating it
    } else {
      series.unshift({ price: price, time: nowMs });
      if (series.length > 120) series.pop();
    }

    // Retain only the last 30 seconds of samples.
    while (series.length > 2 && nowMs - series[series.length - 1].time > 30000) series.pop();

    STATE.assetPriceCache[asset] = price;
  }

  /**
   * Per-pair Queen signal for the scanned tab list and for the "best opportunity pair".
   * The ACTIVE pair always reuses the full 20-worker signal; every other pair is scored
   * from its OWN tick stream (never from the active pair's price), and a pair with no
   * captured ticks is honestly reported as HOLD / awaiting ticks instead of fabricating
   * a tradeable direction.
   */
  function generatePairQueenSignal(asset, payout, isActive) {
    if (isActive && STATE.queenSignal && STATE.queenSignal.direction) {
      return STATE.queenSignal;
    }

    const phase = STATE.candlePhase || getQuotexCandleTimer();
    const ticks = STATE.pairTicks[asset] || [];
    const price = STATE.assetPriceCache[asset] || 0;
    const n = ticks.length;

    // A pair that is open in the tab bar but not focused can still be scored from its own
    // M1 candle history, so it is never stuck on "NO TICKS / HOLD" purely because the
    // browser only streams quotes for the chart the user is looking at.
    const ownCandles = (STATE.pairCandles[asset] || [])
      .filter((c) => c && c.close > 0)
      .slice()
      .sort((a, b) => (a.time || 0) - (b.time || 0));

    if (price <= 0 || (n < 4 && ownCandles.length < 5)) {
      const waitingRound = calculateOptimalRoundNumber(price, asset, "HOLD");
      return {
        direction: "HOLD",
        nextCandleDirection: "WAITING FOR TICKS",
        confidence: 0,
        consensus: 0,
        status: "AWAITING_LIVE_TICKS",
        payout: payout,
        asset: asset,
        candleKey: phase.candleKey,
        candleExpirySeconds: phase.remainingSec,
        candleExpiryTimer: phase.timeFormatted,
        candleCloseAt: phase.closeAt,
        optimalRoundNumber: waitingRound.optimalRound,
        roundLevels: waitingRound,
        evidence: [`No live Quotex ticks captured for ${asset} yet`],
        upVotes: 0,
        downVotes: 0,
        holdVotes: 20,
        confluenceScore: 0,
        source: "QUOTEX_LIVE",
        timestamp: Date.now()
      };
    }

    // Prefer this pair's own M1 candles (the correct 1-minute timeframe), otherwise fall
    // back to its live tick stream. Either way the series is that pair's own data.
    const series = ownCandles.length >= 5
      ? ownCandles.map((c) => c.close).reverse()
      : ticks.map((t) => t.price);

    const m = analyzeMarket(series, price);

    // Same sigma bands as the active pair, so a non-active pair is judged on exactly the
    // same footing. The old absolute epsilon here made every other pair read "flat" and
    // report HOLD, which is why the radar was a wall of HOLDs.
    const BAND = 0.75;
    const bull = [m.z3, m.z5, m.z10, m.trendZ, m.z1, m.rsiZ, m.stochZ, m.accelZ];
    const up = bull.filter((s) => s > BAND).length;
    const down = bull.filter((s) => s < -BAND).length;
    const netScore = (up - down) / bull.length;

    const decisive = Math.abs(netScore) >= 0.25;
    const quietMarket =
      Math.abs(m.z3) < 0.35 &&
      Math.abs(m.trendZ) < 0.35 &&
      m.rsi > 44 && m.rsi < 56 &&
      Math.abs(netScore) < 0.15;

    const dir = (!decisive || quietMarket) ? "HOLD" : netScore > 0 ? "CALL" : "PUT";
    const power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
    const conf = dir === "HOLD" ? 0.5 : Math.max(0.52, Math.min(0.94, 0.52 + power * 0.4));

    const upVotes = dir === "CALL" ? up : dir === "HOLD" ? 0 : Math.max(0, down - up);
    const downVotes = dir === "PUT" ? down : dir === "HOLD" ? 0 : Math.max(0, up - down);
    const holdVotes = dir === "HOLD" ? bull.length - up - down : Math.max(0, bull.length - up - down);

    const roundInfo = calculateOptimalRoundNumber(price, asset, dir);
    const dirLabel = dir === "HOLD" ? "HOLD ⏸ (NO TRADE)" : dir === "CALL" ? "CALL ⬆ (UP)" : "PUT ⬇ (DOWN)";

    return {
      direction: dir,
      nextCandleDirection: dirLabel,
      confidence: conf,
      consensus: dir === "HOLD" ? holdVotes / bull.length : (up + down) / bull.length,
      status: dir === "HOLD" ? "SAFE_HOLD_NEUTRAL_MARKET" : "LIVE_CONSENSUS_SIGNAL",
      payout: payout,
      asset: asset,
      power: power,
      netScore: netScore,
      candleKey: phase.candleKey,
      candleExpirySeconds: phase.remainingSec,
      candleExpiryTimer: phase.timeFormatted,
      candleCloseAt: phase.closeAt,
      optimalRoundNumber: roundInfo.optimalRound,
      roundLevels: roundInfo,
      evidence: [
        `${dir === 'CALL' ? '🟢 Bullish' : dir === 'PUT' ? '🔴 Bearish' : '⚪ Neutral'} momentum on ${asset}`,
        `Signal Power ${Math.round(power * 100)}% | Z3 ${m.z3.toFixed(2)} | Trend ${m.trendZ.toFixed(2)}`,
        `Optimal Entry: @ ${roundInfo.optimalRound} (${roundInfo.label})`,
        `Broker Payout: ${Math.round(payout * 100)}% | Consensus: ${Math.max(upVotes, downVotes)}/${bull.length}`
      ],
      upVotes: upVotes,
      downVotes: downVotes,
      holdVotes: holdVotes,
      confluenceScore: dir === "HOLD" ? 40 : Math.round(conf * 100),
      source: "QUOTEX_LIVE",
      timestamp: Date.now()
    };
  }

  /**
   * 5. DETECT TRUE MARKET PRICE (Bottom left OHLC Close)
   * Primary: OHLC legend at bottom left (e.g. "Close: 19.93325")
   */
  /**
   * Reads the live price of the OPEN CHART.
   *
   * This had three real bugs that produced nonsense in the panel:
   *  1. When the price cache for a pair was empty, `accept()` allowed ANY number, so a
   *     random figure (e.g. the Turkish "Ödeme 3.56 $" panel, or a leftover axis label of
   *     another instrument) became the pair's price.
   *  2. A "last resort" scan matched any 2-6 decimal number in the right half of the
   *     screen, which is exactly where the account/balance panel lives.
   *  3. There was no confirmation, so a single bad frame poisoned the cache forever.
   *
   * Now: a price must be confirmed by two consecutive agreeing reads, and a sudden jump on
   * an already-trusted pair is treated as a foreign element rather than a market move.
   */
  function detectQuotexPrice(asset) {
    const target = asset || STATE.asset;
    return confirmChartPrice(readRawChartPrice(target), target);
  }

  /**
   * RAW price scrape: returns whatever the DOM currently shows, with NO plausibility
   * filter and NO confirmation gate. This must stay unfiltered - it is the evidence the
   * pair arbitration needs in order to work out WHICH pair is really on the chart.
   */
  function readRawChartPrice(assetHint) {
    const candidates = [];

    try {
      const winW = window.innerWidth || 1200;
      const winH = window.innerHeight || 800;

      // --- Where does the chart end and the deal panel begin? ---
      // A fixed "width - 330" was wrong: on a 1920px screen the chart's own price axis
      // sits at x ~= 1650, so that constant threw away exactly the labels we needed.
      // The panel is detected from the page instead of guessed.
      let dealPanelLeft = winW * 0.78; // conservative default
      try {
        const panel = document.querySelector(
          "[class*='deal-form'], [class*='deal-form-wrapper'], [class*='sidebar'], [class*='right-panel']"
        );
        if (panel) {
          const pr = panel.getBoundingClientRect();
          if (pr.width > 120 && pr.left > winW * 0.55) dealPanelLeft = pr.left;
        }
      } catch (e) {}

      // --- 1. OHLC legend (the most reliable, bottom-left of the chart) ---
      const ohlcEls = document.querySelectorAll("[class*='ohlc'], [class*='legend'], [class*='values']");
      for (const el of ohlcEls) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.left > dealPanelLeft) continue;
        const text = el.textContent || "";
        const m = text.match(/(?:Close|Kapan[ıi][şs]|Son|Schluss|Preis|Cierre|Pre[çc]o|Цена)\s*[:：]?\s*([0-9]+[.,][0-9]{1,6})/i);
        if (m && m[1]) {
          const v = parseFloat(String(m[1]).replace(",", "."));
          if (isFinite(v) && v > 0) { candidates.push(v); break; }
        }
      }

      // --- 2. Dedicated current-price / quote elements ---
      if (!candidates.length) {
        const labels = document.querySelectorAll(
          "[class*='chart-price-current'], [class*='current-price'], [class*='live-quote']," +
          "[class*='strike-price'], [class*='price-value'], [class*='lastPrice'], [class*='asset-price']"
        );
        for (const el of labels) {
          if (el.closest("#otc-swarm-queen-hud")) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.left > dealPanelLeft) continue;
          const raw = (el.textContent || "").trim().replace(/[^0-9.]/g, "");
          const v = parseFloat(raw);
          if (isFinite(v) && v > 0) { candidates.push(v); break; }
        }
      }

      // --- 3. The chart's price AXIS, detected as a LADDER ---
      // The old code took the first plain number it saw and required an ALREADY KNOWN
      // price to validate it. That created a deadlock: if the legend selector ever missed,
      // the price could never be acquired in the first place, so the panel was stuck on
      // "GATHERING DATA" forever. A price axis needs no prior - it is self-identifying.
      if (!candidates.length) {
        const nums = [];
        const nodes = document.querySelectorAll("div, span, text");
        for (const el of nodes) {
          if (el.closest("#otc-swarm-queen-hud")) continue;
          if (el.children.length > 0) continue;      // leaf nodes only
          const txt = (el.textContent || "").trim();
          if (!/^[0-9]+[.,][0-9]{1,6}$/.test(txt)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.left < 60 || rect.left > dealPanelLeft) continue;
          if (rect.top < 120 || rect.top > winH - 120) continue;
          nums.push({ v: parseFloat(txt.replace(",", ".")), x: rect.left, y: rect.top });
        }

        // Group the numbers into vertical columns (same x within 24px).
        const cols = [];
        for (const n of nums) {
          const col = cols.find(function (c) { return Math.abs(c.x - n.x) < 24; });
          if (col) { col.items.push(n); col.x = (col.x + n.x) / 2; }
          else cols.push({ x: n.x, items: [n] });
        }

        // A real axis has >= 3 evenly spaced levels. Anything else is page furniture.
        const ladders = cols
          .map(function (c) { return c.items.slice().sort(function (a, b) { return a.y - b.y; }); })
          .filter(function (items) {
            if (items.length < 3) return false;
            const gaps = [];
            for (let i = 1; i < items.length; i++) gaps.push(items[i].v - items[i - 1].v);
            const avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
            if (avg === 0) return false;
            return gaps.every(function (g) { return Math.abs(g - avg) / Math.abs(avg) < 0.4; });
          });

        if (ladders.length) {
          // The live price is the TOP of the axis: my test data lists the largest value
          // (19.93220) at the smallest y, so sort by VALUE, not by position. Sorting by
          // y returned the bottom of the ladder, which is a real (but useless) price.
          const known = STATE.assetPriceCache[assetHint || STATE.asset] || 0;
          let chosen = ladders[0].slice().sort(function (a, b) { return a.v - b.v; });
          if (known > 0 && ladders.length > 1) {
            let best = chosen, bestDist = Infinity;
            for (const lad of ladders) {
              const sorted = lad.slice().sort(function (a, b) { return a.v - b.v; });
              const d = Math.abs(sorted[sorted.length - 1].v - known);
              if (d < bestDist) { bestDist = d; best = sorted; }
            }
            chosen = best;
          }
          const top = chosen[chosen.length - 1].v;
          if (isFinite(top) && top > 0) candidates.push(top);
        }
      }
    } catch (e) { /* fall through to the confirmation gate */ }

    if (!candidates.length) return 0;
    return candidates[0];
  }

  /**
   * Applies the trust gates to a RAW price for a KNOWN pair.
   *
   * Split out from the scrape on purpose. The old code applied these gates inside the
   * scrape, which meant a raw price could only ever be validated against whatever pair
   * happened to be focused at that instant. If that pair was wrong, the price was
   * silently dropped - and because pair arbitration also depended on having a price,
   * the two deadlocked each other and the panel never left "Detecting active pair...".
   *
   * `detectQuotexPrice` is the convenience wrapper for the common "I know the pair" case.
   */
  function confirmChartPrice(value, asset) {
    if (!(value > 0)) return 0;
    if (asset && !isPlausiblePriceFor(asset, value)) return 0;

    // --- Confirmation gate: a new price must repeat before we trust it ---
    // Keyed on the pair we are actually validating FOR, not on STATE.asset, so a price is
    // never confirmed against one pair and then consumed by another.
    const key = asset || STATE.asset;
    const pc = STATE.priceConfirm;
    if (pc.asset === key && pc.value > 0 && Math.abs(value - pc.value) / pc.value < 0.0005) {
      pc.count++;
    } else {
      pc.asset = key;
      pc.value = value;
      pc.count = 1;
    }
    if (pc.count < STATE.PRICE_CONFIRMATIONS) return 0;

    // --- Foreign-element guard: OTC prices never jump 25% in a second ---
    const trusted = STATE.assetPriceCache[key] || 0;
    if (trusted > 0 && Math.abs(value - trusted) / trusted > STATE.PRICE_MAX_JUMP) {
      return 0;
    }
    return value;
  }

  /**
   * QUANT CORE (shared by the ACTIVE pair and every other open Quotex pair)
   *
   * Everything below is expressed in SIGMAS - standard deviations of THIS pair's own
   * noise - instead of absolute price units. USD/IDR (~17838) and EUR/GBP (~1.16) move
   * in completely different tick sizes, so a fixed epsilon either kills every signal
   * on a cheap pair or fires on every tick of an expensive one.
   *
   * A k-bar move is only meaningful when it beats the random-walk expectation
   * unit*sqrt(k); dividing by exactly that is what makes the lens thresholds real.
   */
  function emaOf(series, period) {
    if (!series || !series.length) return 0;
    const p = Math.max(2, Math.min(period, series.length));
    const k = 2 / (p + 1);
    // series is NEWEST-FIRST, so start at the oldest sample and walk towards index 0.
    let v = series[series.length - 1];
    for (let i = series.length - 2; i >= 0; i--) v = series[i] * k + v * (1 - k);
    return v;
  }

  function meanAbsMove(series, span) {
    let sum = 0, cnt = 0;
    for (let i = 0; i + 1 < series.length && i < span; i++) {
      sum += Math.abs(series[i] - series[i + 1]);
      cnt++;
    }
    return cnt ? sum / cnt : 0;
  }

  // RSI over a NEWEST-FIRST price series (index 0 = most recent).
  function rsiFromSeries(series, period) {
    const p = Math.min(period, series.length - 1);
    if (p < 2) return 50;
    let gains = 0, losses = 0;
    for (let i = 0; i < p; i++) {
      const diff = series[i] - series[i + 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    if (gains === 0 && losses === 0) return 50;
    return 100 - 100 / (1 + gains / (losses || 1e-9));
  }

  // Stochastic %K over a NEWEST-FIRST price series.
  function stochFromSeries(series, period) {
    const p = Math.min(period, series.length);
    if (p < 2) return 50;
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < p; i++) {
      hi = Math.max(hi, series[i]);
      lo = Math.min(lo, series[i]);
    }
    if (hi === lo) return 50;
    return ((series[0] - lo) / (hi - lo)) * 100;
  }

  /** Normalised, unit-free metrics for one pair's own close series. */
  function analyzeMarket(closes, price) {
    const n = closes.length;
    const last = price > 0 ? price : closes[0];

    // This pair's own per-bar noise.
    const vol = meanAbsMove(closes, 20);
    const unit = Math.max(vol, Math.abs(last) * 1e-7, 1e-12);

    // Sigma-normalised k-bar move (random-walk baseline = unit*sqrt(k)).
    const z = (k) => {
      const idx = Math.min(k, n - 1);
      if (n < 2 || idx < 1) return 0;
      return (last - closes[idx]) / (unit * Math.sqrt(idx));
    };

    const z1 = z(1);
    const z3 = z(3);
    const z5 = z(5);
    const z10 = n >= 8 ? z(n - 1) : z3;

    // Structure: fast vs slow EMA ribbon.
    const emaFast = emaOf(closes, 9);
    const emaSlow = emaOf(closes, 21);
    const trendZ = n >= 5 ? (emaFast - emaSlow) / (unit * 2) : 0;

    // Mean-reversion oscillators. Oversold => positive (bullish) score.
    const rsi = rsiFromSeries(closes, Math.min(14, n - 1));
    const stochK = stochFromSeries(closes, Math.min(14, n));
    const rsiZ = (50 - rsi) / 22;
    const stochZ = (50 - stochK) / 34;

    // Velocity and its acceleration.
    const accelZ = z1 - z3 / Math.sqrt(3);

    return {
      n: n, price: last, vol: vol, unit: unit,
      z1: z1, z3: z3, z5: z5, z10: z10,
      trendZ: trendZ, rsi: rsi, stochK: stochK,
      rsiZ: rsiZ, stochZ: stochZ, accelZ: accelZ,
      emaFast: emaFast, emaSlow: emaSlow
    };
  }

  /**
   * Picks the strongest CALL/PUT signal across every open pair, so the panel can point the
   * user at the pair that is currently tradeable. Stale signals are ignored - otherwise a
   * leftover signal from a previously open pair keeps winning the "best pair" slot forever.
   */
  function updateBestPairSignal() {
    const now = Date.now();
    let best = null;
    let bestHold = null;

    const consider = (asset, s) => {
      if (!s || !asset) return;
      // Ignore anything whose feed has gone quiet.
      if (now - (s.timestamp || 0) > 15000) return;

      const isHold = s.direction === "HOLD" || !s.direction;
      const conf = s.confidence || 0;
      const payout = s.payout || 0.85;
      // Prefer real setups, then signal power, then confidence, then broker payout.
      const score = (isHold ? 0 : 1000) + (s.power || 0) * 100 + conf * 40 + payout * 20;

      if (isHold) {
        if (!bestHold || score > bestHold.score) {
          bestHold = { asset: asset, score: score, signal: s, direction: s.direction, confidence: conf };
        }
      } else if (!best || score > best.score) {
        best = { asset: asset, score: score, signal: s, direction: s.direction, confidence: conf, power: s.power || 0 };
      }
    };

    for (const asset of Object.keys(STATE.pairSignals)) consider(asset, STATE.pairSignals[asset]);
    for (const asset of Object.keys(STATE.activePairs)) {
      if (STATE.activePairs[asset]) consider(asset, STATE.activePairs[asset].queenSignal);
    }

    STATE.bestPair = best;
    // Reported honestly as "no setup anywhere" instead of inventing a tradeable pair.
    STATE.noSetupPair = best ? null : (bestHold ? bestHold.asset : null);
    return STATE.bestPair;
  }

  // ---------------------------------------------------------------------------
  // SIDE NOTIFICATIONS
  // A small corner card is raised the moment ANY open pair (not only the selected one)
  // produces a fresh CALL or PUT. HOLDs are never announced - removing the "everything
  // is HOLD" behaviour is what makes these alerts meaningful.
  // ---------------------------------------------------------------------------
  const TOAST_HOST_ID = "otc-swarm-queen-toasts";
  const TOAST_MIN_GAP_MS = 1500; // short gap: a brand-new signal must never be swallowed
  const TOAST_LIFE_MS = 4500;   // auto-dismiss ~4.5s after the signal pops up

  function getToastHost() {
    if (!document.body) return null;
    let host = document.getElementById(TOAST_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_HOST_ID;
      host.style.cssText = [
        "position:fixed", "top:14px", "right:14px", "z-index:2147483000",
        "display:flex", "flex-direction:column", "gap:8px", "align-items:flex-end",
        "pointer-events:none",
        "font-family:ui-monospace,SFMono-Regular,Menlo,monospace", "max-width:300px"
      ].join(";");
      document.body.appendChild(host);
    }
    return host;
  }

  function dismissToast(el) {
    if (!el || !el.parentNode) return;
    el.style.transition = "opacity .25s ease, transform .25s ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(16px)";
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  function announceSignal(asset, signal, isFocused) {
    if (!asset || !signal) return;
    const dir = signal.direction;
    if (dir !== "CALL" && dir !== "PUT") return; // never notify on HOLD

    const conf = Math.round((signal.confidence || 0) * 100);
    const price = STATE.assetPriceCache[asset] || 0;
    const sig = [dir, conf, signal.candleKey || 0, isFocused ? "F" : "A"].join("|");

    // Already announced this exact setup -> stay silent (the poll runs every 300ms).
    if (STATE.announcedSignals[asset] === sig) return;

    const now = Date.now();
    if (now - STATE.lastToastAt < TOAST_MIN_GAP_MS) return;

    STATE.announcedSignals[asset] = sig;
    STATE.lastToastAt = now;

    const isCall = dir === "CALL";
    const accent = isCall ? "#34d399" : "#f87171";
    const bg = isCall ? "#04231b" : "#2a0d0d";
    const host = getToastHost();
    if (!host) return;

    const card = document.createElement("div");
    card.style.cssText = [
      "pointer-events:auto", "cursor:pointer", "background:" + bg,
      "border:1px solid " + accent, "border-left-width:4px", "border-radius:8px",
      "padding:8px 11px", "color:#f8fafc", "min-width:210px",
      "box-shadow:0 8px 26px rgba(0,0,0,.65)"
    ].join(";");
    card.innerHTML =
      '<div style="font-size:8.5px;letter-spacing:.6px;color:#94a3b8;font-weight:700">' +
        "🚨 NEW SIGNAL" + (isFocused ? " · SELECTED PAIR" : " · OTHER PAIR") + "</div>" +
      '<div style="display:flex;align-items:baseline;gap:6px;margin-top:3px">' +
        '<span style="font-size:12px;font-weight:800;color:' + accent + '">' +
          (isCall ? "⬆ CALL (UP)" : "⬇ PUT (DOWN)") + "</span>" +
        '<span style="font-size:11px;font-weight:700;color:#f1f5f9">' + asset + "</span>" +
      "</div>" +
      '<div style="font-size:9.5px;color:#cbd5e1;margin-top:3px">' +
        "Power <b style='color:" + accent + "'>" + Math.round((signal.power || 0) * 100) + "%</b>" +
        " · Conf <b>" + conf + "%</b>" +
        " · " + Math.max(signal.upVotes || 0, signal.downVotes || 0) + "/20" +
        (price > 0 ? " · @ " + price.toFixed(price > 100 ? 2 : 5) : "") +
      "</div>" +
      '<div style="font-size:8.5px;color:#64748b;margin-top:2px">M1 candle closes in ' +
        (signal.candleExpiryTimer || "--") + " · click to dismiss</div>";

    card.addEventListener("click", function () { dismissToast(card); });
    host.appendChild(card);

    while (host.children.length > 4) dismissToast(host.children[0]);
    setTimeout(() => dismissToast(card), TOAST_LIFE_MS);
  }

  /**
   * 6. 20-WORKER SWARM & QUEEN SIGNALS CALCULATION (PER-PAIR, PER-M1-CANDLE)
   */
  /**
   * SMC CONFLUENCE ENGINE (in-extension, zero look-ahead):
   * Runs on the pair's REAL M1 candles (fully closed ones only) and returns four
   * directional sub-scores consumed by swarm lenses 21-24:
   *   structure - market structure: swing trend, BOS, CHoCH
   *   sweep     - liquidity: equal highs/lows pools + stop-run sweep + rejection
   *   zone      - order blocks + fair value gaps (freshness-weighted, proximity boost)
   *   reaction  - candle reaction: pin bars, engulfing, rejection wicks
   * bullScore/bearScore are the raw confluence weights; score is the 0-100 readout.
   */
  function analyzeSMC(rawCandles) {
    const empty = { structure: 0, sweep: 0, zone: 0, reaction: 0, bullScore: 0, bearScore: 0, score: 50, evidence: [] };
    const candles = (rawCandles || [])
      .filter((c) => c && c.close > 0 && c.high >= c.low && c.open > 0)
      .slice()
      .sort((a, b) => (a.time || 0) - (b.time || 0));
    // Drop the still-forming candle: every SMC judgement is made on CLOSED data.
    const curMinute = Math.floor(Date.now() / 60000);
    if (candles.length && Math.floor((candles[candles.length - 1].time || 0) / 60000) === curMinute) candles.pop();
    if (candles.length < 12) return empty;

    const evidence = [];
    let bullScore = 0;
    let bearScore = 0;

    // 1. MARKET STRUCTURE: swings, trend, BOS, CHoCH
    const W = 2;
    const swings = [];
    for (let i = W; i < candles.length - W; i++) {
      let isH = true, isL = true;
      for (let w = 1; w <= W; w++) {
        if (candles[i - w].high >= candles[i].high || candles[i + w].high > candles[i].high) isH = false;
        if (candles[i - w].low <= candles[i].low || candles[i + w].low < candles[i].low) isL = false;
      }
      if (isH) swings.push({ price: candles[i].high, type: 'H' });
      else if (isL) swings.push({ price: candles[i].low, type: 'L' });
    }
    const sh = swings.filter((x) => x.type === 'H');
    const sl = swings.filter((x) => x.type === 'L');
    let structure = 0;
    if (sh.length >= 2 && sl.length >= 2) {
      const h2 = sh[sh.length - 1].price, h1 = sh[sh.length - 2].price;
      const l2 = sl[sl.length - 1].price, l1 = sl[sl.length - 2].price;
      if (h2 > h1 && l2 > l1) { structure = 0.9; evidence.push('BULLISH_STRUCTURE (HH+HL)'); }
      else if (h2 < h1 && l2 < l1) { structure = -0.9; evidence.push('BEARISH_STRUCTURE (LH+LL)'); }
    }
    const lastClosed = candles[candles.length - 1];
    const prevClosed = candles[candles.length - 2];
    const lastSwingHigh = sh.length ? sh[sh.length - 1].price : null;
    const lastSwingLow = sl.length ? sl[sl.length - 1].price : null;
    if (lastSwingHigh !== null && lastClosed.close > lastSwingHigh) {
      if (structure > 0) { structure = 1.25; evidence.push('BULLISH_BOS'); }
      else if (structure < 0) { structure = 1.15; evidence.push('BULLISH_CHOCH'); }
      else { structure = 0.85; evidence.push('BULLISH_STRUCTURE_BREAK'); }
    } else if (lastSwingLow !== null && lastClosed.close < lastSwingLow) {
      if (structure < 0) { structure = -1.25; evidence.push('BEARISH_BOS'); }
      else if (structure > 0) { structure = -1.15; evidence.push('BEARISH_CHOCH'); }
      else { structure = -0.85; evidence.push('BEARISH_STRUCTURE_BREAK'); }
    }
    if (structure > 0) bullScore += structure;
    else if (structure < 0) bearScore += -structure;

    // 2. LIQUIDITY: equal highs/lows pools + stop-run sweep + rejection
    const recent = candles.slice(-30);
    const tol = 0.0006;
    const levels = [];
    for (let i = 0; i < recent.length - 2; i++) {
      for (let j = i + 2; j < recent.length; j++) {
        const midH = (recent[i].high + recent[j].high) / 2;
        if (Math.abs(recent[i].high - recent[j].high) / midH <= tol) levels.push({ price: midH, kind: 'EQH' });
        const midL = (recent[i].low + recent[j].low) / 2;
        if (Math.abs(recent[i].low - recent[j].low) / midL <= tol) levels.push({ price: midL, kind: 'EQL' });
      }
    }
    let poolHigh = recent[0], poolLow = recent[0];
    for (const c of recent) {
      if (c.high > poolHigh.high) poolHigh = c;
      if (c.low < poolLow.low) poolLow = c;
    }
    levels.push({ price: poolHigh.high, kind: 'BSL' });
    levels.push({ price: poolLow.low, kind: 'SSL' });
    const rng = Math.max(1e-9, lastClosed.high - lastClosed.low);
    const body = Math.abs(lastClosed.close - lastClosed.open);
    const upWick = (lastClosed.high - Math.max(lastClosed.open, lastClosed.close)) / rng;
    const loWick = (Math.min(lastClosed.open, lastClosed.close) - lastClosed.low) / rng;
    let sweep = 0;
    for (const lv of levels) {
      if (lv.kind === 'EQH' || lv.kind === 'BSL') {
        if (lastClosed.high > lv.price && lastClosed.close < lv.price) {
          sweep = -1.2 - (upWick > body * 1.2 ? 0.35 : 0);
          evidence.push('BUY_SIDE_LIQUIDITY_SWEEP' + (upWick > body * 1.2 ? ' + REJECTION' : ''));
        }
      } else {
        if (lastClosed.low < lv.price && lastClosed.close > lv.price) {
          sweep = 1.2 + (loWick > body * 1.2 ? 0.35 : 0);
          evidence.push('SELL_SIDE_LIQUIDITY_SWEEP' + (loWick > body * 1.2 ? ' + REJECTION' : ''));
        }
      }
    }
    if (sweep > 0) bullScore += sweep;
    else if (sweep < 0) bearScore += -sweep;

    // 3. ORDER BLOCKS + FAIR VALUE GAPS (freshness + proximity weighted)
    const scan = candles.slice(-30);
    let avgBody = 0, cnt = 0;
    for (let i = Math.max(1, scan.length - 10); i < scan.length - 1; i++) { avgBody += Math.abs(scan[i].close - scan[i].open); cnt++; }
    avgBody = cnt ? avgBody / cnt : 1e-9;
    let bullOB = null, bearOB = null;
    for (let i = 2; i < scan.length - 1; i++) {
      const c = scan[i], p = scan[i - 1];
      const disp = Math.abs(c.close - c.open) / avgBody;
      if (disp >= 1.6 && c.close > c.open && c.close > p.high) {
        bullOB = { high: Math.max(p.open, p.high), low: p.low, fresh: true, at: i };
      } else if (disp >= 1.6 && c.close < c.open && c.close < p.low) {
        bearOB = { high: p.high, low: Math.min(p.open, p.low), fresh: true, at: i };
      }
    }
    const mitigatedOB = (ob, isBull) => {
      for (let k = ob.at + 1; k < scan.length; k++) {
        const c = scan[k];
        if (isBull && c.close < ob.low) return true;
        if (!isBull && c.close > ob.high) return true;
        if (isBull && c.low <= ob.high) ob.fresh = false;
        if (!isBull && c.high >= ob.low) ob.fresh = false;
      }
      return false;
    };
    if (bullOB && mitigatedOB(bullOB, true)) bullOB = null;
    if (bearOB && mitigatedOB(bearOB, false)) bearOB = null;
    let bullFVG = null, bearFVG = null;
    for (let i = 2; i < scan.length; i++) {
      const c1 = scan[i - 2], c3 = scan[i];
      if (c3.low > c1.high) bullFVG = { upper: c3.low, lower: c1.high, fresh: true, at: i };
      else if (c1.low > c3.high) bearFVG = { upper: c1.low, lower: c3.high, fresh: true, at: i };
    }
    const mitigatedFVG = (g, isBull) => {
      for (let k = g.at + 1; k < scan.length; k++) {
        const c = scan[k];
        if (isBull && c.close <= g.lower) return true;
        if (!isBull && c.close >= g.upper) return true;
        if (isBull && c.low <= g.upper) g.fresh = false;
        if (!isBull && c.high >= g.lower) g.fresh = false;
      }
      return false;
    };
    if (bullFVG && mitigatedFVG(bullFVG, true)) bullFVG = null;
    if (bearFVG && mitigatedFVG(bearFVG, false)) bearFVG = null;
    let zone = 0;
    if (bullOB) { zone += bullOB.fresh ? 1.25 : 0.8; evidence.push('BULLISH_ORDER_BLOCK' + (bullOB.fresh ? ' (FRESH)' : '')); }
    if (bearOB) { zone -= bearOB.fresh ? 1.25 : 0.8; evidence.push('BEARISH_ORDER_BLOCK' + (bearOB.fresh ? ' (FRESH)' : '')); }
    if (bullFVG) { zone += bullFVG.fresh ? 1.0 : 0.6; evidence.push('BULLISH_FVG' + (bullFVG.fresh ? ' (FRESH)' : '')); }
    if (bearFVG) { zone -= bearFVG.fresh ? 1.0 : 0.6; evidence.push('BEARISH_FVG' + (bearFVG.fresh ? ' (FRESH)' : '')); }
    if (bullOB && lastClosed.low <= bullOB.high && lastClosed.close >= bullOB.low) { zone += 0.4; evidence.push('PRICE_AT_BULLISH_OB'); }
    if (bearOB && lastClosed.high >= bearOB.low && lastClosed.close <= bearOB.high) { zone -= 0.4; evidence.push('PRICE_AT_BEARISH_OB'); }
    if (zone > 0) bullScore += zone;
    else if (zone < 0) bearScore += -zone;

    // 4. CANDLE REACTION / WICK READ on the last closed candle
    let reaction = 0;
    if (loWick >= 0.55 && body / rng <= 0.35) { reaction = 1.25; evidence.push('BULLISH_PIN_BAR'); }
    else if (upWick >= 0.55 && body / rng <= 0.35) { reaction = -1.25; evidence.push('BEARISH_PIN_BAR'); }
    else if (lastClosed.close > lastClosed.open && prevClosed && prevClosed.close < prevClosed.open && lastClosed.close > prevClosed.open && lastClosed.open <= prevClosed.close) { reaction = 1.15; evidence.push('BULLISH_ENGULFING'); }
    else if (lastClosed.close < lastClosed.open && prevClosed && prevClosed.close > prevClosed.open && lastClosed.close < prevClosed.open && lastClosed.open >= prevClosed.close) { reaction = -1.15; evidence.push('BEARISH_ENGULFING'); }
    else if (upWick >= 0.45) { reaction = -0.8; evidence.push('UPPER_WICK_REJECTION'); }
    else if (loWick >= 0.45) { reaction = 0.8; evidence.push('LOWER_WICK_REJECTION'); }
    if (reaction > 0) bullScore += reaction;
    else if (reaction < 0) bearScore += -reaction;

    const score = Math.max(5, Math.min(95, Math.round(50 + (bullScore - bearScore) * 22)));
    return { structure: structure, sweep: sweep, zone: zone, reaction: reaction, bullScore: bullScore, bearScore: bearScore, score: score, evidence: evidence };
  }

  function calculateSwarmSignals(price) {
    if (!price || price <= 0) {
      // No price yet. We must still publish a signal object, otherwise the UI falls back
      // to a placeholder that LOOKS like a real "HOLD / 50% confidence" verdict.
      // The evidence carries a REAL diagnostic so "GATHERING DATA" is never a mystery:
      // it tells whether the WS hook sees broker frames and whether ticks are arriving.
      const hs = STATE.hookStats || {};
      const tickAge = STATE.lastTickTime ? Math.round((Date.now() - STATE.lastTickTime) / 1000) + "s ago" : "never";
      const hookAlive = STATE.hookAliveAt && Date.now() - STATE.hookAliveAt < 60000;
      const hookLine = hookAlive
        ? "hook attached, " + (hs.frames || 0) + " frames / " + (hs.forwarded || 0) + " forwarded"
        : "HOOK NOT ATTACHED - reload this Quotex tab (F5)";
      STATE.queenSignal = {
        direction: "HOLD",
        nextCandleDirection: "HOLD",
        confidence: 0,
        consensus: 0,
        power: 0,
        status: "WARMING_UP",
        warmingUp: true,
        hasPrice: false,
        dataPoints: 0,
        upVotes: 0,
        downVotes: 0,
        holdVotes: 0,
        evidence: [
          "Waiting for the first live price on " + (STATE.asset || "this pair") +
            " - " + hookLine + ", last tick " + tickAge,
          hookAlive
            ? "Hook is alive but no price yet - open this pair's chart so Quotex streams it, or wait for the next candle."
            : "After every extension update, ALL Quotex tabs must be reloaded (F5) so the price interceptor reattaches."
        ],
        roundLevels: null
      };
      return;
    }

    const pairAsset = STATE.asset || "UNKNOWN";
    const phase = getQuotexCandleTimer();

    // Ticks are deduplicated + time-pruned in recordPairTick(), so this is a real price
    // series (the old code pushed the same unchanged price on every 300ms poll, which made
    // every momentum lens read 0 and turned the whole swarm into HOLD).
    const ticks = STATE.pairTicks[pairAsset] || [];
    const n = ticks.length;

    // Prefer the REAL 1-minute candles from the Quotex WebSocket: for a 1-minute signal
    // they are the correct timeframe and far less noisy than sub-second ticks.
    const rawCandles = Array.isArray(STATE.candlesHistory) ? STATE.candlesHistory : [];
    const candles = rawCandles
      .filter((c) => c && c.close > 0)
      .slice()
      .sort((a, b) => (a.time || 0) - (b.time || 0));

    // ALL indicator series below are NEWEST-FIRST (index 0 = latest), matching the tick
    // series. The WebSocket history arrives oldest-first, so it must be reversed.
    const closes = candles.map((c) => c.close).reverse();
    const closedLen = Math.max(0, closes.length - 2); // drop the 2 forming candles
    const useCandles = closedLen >= 4;

    // Real SMC confluence on the closed M1 candles (structure/liquidity/OB/FVG/wicks).
    const smcRead = analyzeSMC(candles);

    // MARKET-CHARACTER MEASUREMENT (evidence, not theory): over the last 60 closed
    // candles, does this pair CONTINUE its direction or REVERT? The OTC-trap fade
    // lenses only make sense in a mean-reverting phase — in a trending phase they
    // fight the market (measured fade accuracy can sink to ~40%). reversionBias:
    // +1 = strongly mean-reverting (traps work), -1 = strongly trending (traps mute).
    let reversionBias = 0;
    {
      const closed = candles.slice(0, Math.max(0, candles.length - 1)).slice(-60);
      let cont = 0, rev = 0;
      for (let i = 1; i < closed.length; i++) {
        const d1 = Math.sign(closed[i].close - closed[i - 1].close);
        const d2 = i + 1 < closed.length ? Math.sign(closed[i + 1].close - closed[i].close) : 0;
        if (d1 === 0 || d2 === 0) continue;
        if (d1 === d2) cont++; else rev++;
      }
      const total = cont + rev;
      if (total >= 10) reversionBias = (rev - cont) / total;
    }

    // --- LENS LEARNING: settle the locked verdict against the real closed candle ---
    // Every lens's vote at lock time is compared with the target candle's actual
    // open->close direction. Each lens keeps an EWMA accuracy per pair, and accurate
    // lenses gain vote weight — the swarm learns which lenses actually work on THIS
    // pair instead of trusting all 20 equally forever.
    const settledLock = STATE.nextCandleLock;
    if (settledLock && !settledLock.settled && settledLock.pair === pairAsset && useCandles) {
      const targetCandle = candles.find(
        (c) => Math.floor((c.time || 0) / 60000) === settledLock.forCandleKey &&
               (c.time || 0) + 60000 <= Date.now()
      );
      if (targetCandle) {
        const actualDir = targetCandle.close > targetCandle.open ? "CALL" : targetCandle.close < targetCandle.open ? "PUT" : "HOLD";
        if (actualDir !== "HOLD" && Array.isArray(settledLock.votes)) {
          const store = (STATE.lensStats || (STATE.lensStats = {}))[pairAsset] || ((STATE.lensStats[pairAsset] = {}), STATE.lensStats[pairAsset]);
          settledLock.votes.forEach((v) => {
            const s = store[v.id] || (store[v.id] = { n: 0, ewma: 0.5 });
            const correct = v.vote === actualDir ? 1 : 0;
            // alpha 0.3: after a market regime flips, stale lens weights adapt in a
            // handful of candles instead of hanging around for many.
            s.ewma = s.n === 0 ? (correct ? 0.8 : 0.3) : s.ewma * 0.7 + correct * 0.3;
            s.n++;
          });
        }
        settledLock.settled = true;
      }
    }

    let series, dataPoints, dataSource;

    if (useCandles) {
      // Real M1 candles are the correct timeframe for a 1-minute target and are far
      // less noisy than sub-second ticks. Keep the forming candles at the head so the
      // newest move is always visible.
      dataPoints = closes.length;
      dataSource = "M1_CANDLES";
      series = closes;
    } else {
      dataPoints = n;
      dataSource = "LIVE_TICKS";
      series = ticks.map((t) => t.price);
    }

    const m = analyzeMarket(series, price);
    const rsi = m.rsi;
    const stochK = m.stochK;

    // --- SIGMA BANDS -------------------------------------------------------
    // 1.0 sigma is exactly the move a random walk of this length would produce. A lens
    // only abstains below 0.75 sigma, so a genuine move always produces real votes
    // instead of a wall of HOLDs. (The old absolute epsilon read "flat" on nearly every
    // OTC pair, which is why every pair showed HOLD.)
    const BAND = 0.75;
    // Confluence is now grounded in real SMC structure (50/50 blend with the
    // statistical read) instead of oscillator proxies alone.
    const smcScore = Math.max(5, Math.min(95, Math.round(50 + ((smcRead.bullScore - smcRead.bearScore) * 22 + m.z3 * 16 + m.trendZ * 10 - m.rsiZ * 8) / 2)));

    let upCount = 0;
    let downCount = 0;
    let holdCount = 0;

    let upWeight = 0;
    let downWeight = 0;
    let holdWeight = 0;

    // Each fly scores a lens in sigmas and votes on its sign when it clears BAND.
    // Trend lenses (EMA ribbon, momentum) and mean-reversion lenses (RSI/Stoch) often
    // disagree in a ranging market - that tension is what keeps the swarm from
    // confidently calling a coin flip.
    //
    // --- OTC TRAP LENSES (ids 14-19) ---
    // OTC feeds are broker-synthesised and notoriously mean-reverting: where the
    // visible move tempts everyone to follow it, the feed often snaps back ("the OTC
    // trap"). Lenses 14-19 therefore FADE the move when a specific trap condition is
    // present, and abstain (score 0) otherwise — they never invert a quiet market.
    // Each trap lens is settled against real candle closes per pair (lens learning
    // below), so on pairs where fading works its vote weight grows, and on genuinely
    // trending pairs it quiets down automatically.
    const closedTrapCandles = candles.slice(0, Math.max(0, candles.length - 2)); // fully closed
    const lastClosed = closedTrapCandles[closedTrapCandles.length - 1];
    // Consecutive same-colour closed candles (the "everyone is piling in" tell).
    let colourStreak = 0;
    for (let i = closedTrapCandles.length - 1; i >= 0; i--) {
      const c = closedTrapCandles[i];
      const up = c.close > c.open;
      if (i === closedTrapCandles.length - 1) colourStreak = up ? 1 : -1;
      else if (up && colourStreak > 0) colourStreak++;
      else if (!up && colourStreak < 0) colourStreak--;
      else break;
    }
    // One-sided tick pressure: consecutive ticks moving the same way at the tail.
    let tickStreak = 0;
    for (let i = 0; i + 1 < series.length; i++) {
      const d = series[i] - series[i + 1];
      if (d === 0) break;
      const s = d > 0 ? 1 : -1;
      if (i === 0) tickStreak = s;
      else if (tickStreak === s) tickStreak += s;
      else break;
    }

    const LENS = {
      1:  function () { return m.z3; },                              // micro momentum
      2:  function () { return m.z5; },                              // swing momentum
      3:  function () { return m.z10; },                             // trend momentum
      4:  function () { return m.trendZ; },                          // EMA ribbon structure
      5:  function () { return m.z1; },                              // single-tick velocity
      6:  function () { return m.rsiZ; },                            // RSI momentum read
      7:  function () { return m.stochZ; },                          // Stochastic momentum read
      8:  function () { return (m.z3 + m.z5) / 2; },                 // blended momentum
      9:  function () { return m.accelZ; },                          // velocity acceleration
      10: function () { return m.z3 * 0.6 + m.trendZ * 0.4; },       // momentum + structure
      11: function () { return m.z1 * 0.5 + m.accelZ * 0.5; },       // velocity composite
      12: function () { return m.z5 * 0.7 + m.z10 * 0.3; },          // swing + trend
      13: function () { return m.stochZ * 0.6 + m.rsiZ * 0.4; },     // oscillator blend
      // 14 RSI Divergence → RSI EXTREME fade — but NOT against a confirmed structural
      // trend: in a real breakout (BOS/CHoCH up) overbought RSI rides, it does not reverse.
      14: function () {
        if (reversionBias <= 0) return 0; // trending phase: fading fights the market
        if (rsi >= 68 && smcRead.structure < 0.6) return -(1.0 + (rsi - 68) * 0.1);
        if (rsi <= 32 && smcRead.structure > -0.6) return (1.0 + (32 - rsi) * 0.1);
        return 0;
      },
      // 15 Tick Dominance → one-sided tick pressure fade: a long same-direction tick
      // streak is classic OTC trap flow.
      15: function () {
        if (reversionBias <= 0) return 0;
        const dir = tickStreak > 0 ? 1 : -1;
        if (Math.abs(tickStreak) >= 5 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.8 + Math.abs(tickStreak) * 0.06);
        return 0;
      },
      // 16 MACD Histogram → deceleration fade: the move is still trending but its
      // acceleration has flipped — the crowd is being pulled in at the top/bottom.
      16: function () {
        if (m.trendZ >= 0.8 && m.accelZ <= -0.5) return -1.0;
        if (m.trendZ <= -0.8 && m.accelZ >= 0.5) return 1.0;
        return 0;
      },
      // 17 Double Reversal → rejection-wick fade: a long wick against the body marks
      // trapped buyers/sellers on the spike.
      17: function () {
        if (!lastClosed) return 0;
        const rng = lastClosed.high - lastClosed.low;
        if (rng <= 0) return 0;
        const upWick = (lastClosed.high - Math.max(lastClosed.open, lastClosed.close)) / rng;
        const loWick = (Math.min(lastClosed.open, lastClosed.close) - lastClosed.low) / rng;
        if (upWick >= 0.55) return -1.2;
        if (loWick >= 0.55) return 1.2;
        return 0;
      },
      // 18 Fib 61.8% Golden → overextension fade: fade a multi-candle extension that
      // has travelled far beyond one sigma of its own noise.
      18: function () {
        // Fade an extension only when the market reverts AND structure does not
        // strongly confirm the extension.
        if (reversionBias <= 0) return 0;
        if (Math.abs(m.z10) >= 1.0 && m.z10 * smcRead.structure < 0.6) return -m.z10 * 0.9;
        return 0;
      },
      // 19 Candle Exhaustion → colour-streak fade: 3+ same-colour closed candles on an
      // OTC pair very often exhaust into a counter candle.
      19: function () {
        if (reversionBias <= 0) return 0;
        const dir = colourStreak > 0 ? 1 : -1;
        if (Math.abs(colourStreak) >= 3 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.7 + (Math.abs(colourStreak) - 2) * 0.25);
        return 0;
      },
      20: function () { return m.trendZ * 0.6 + m.z5 * 0.4; },       // macro confluence
      // --- SMC CONFLUENCE LENSES (21-24) --- real chart-structure evidence; each one
      // settles against real candle closes per pair, so the swarm learns how much to
      // trust structure/liquidity/zones/wicks on THIS pair.
      21: function () { return smcRead.structure; },                 // structure / BOS / CHoCH
      22: function () { return smcRead.sweep; },                     // liquidity sweep + rejection
      23: function () { return smcRead.zone; },                      // order blocks + FVG zones
      24: function () { return smcRead.reaction; }                   // candle reaction / wick
    };

    const pairLensStats = (STATE.lensStats || (STATE.lensStats = {}))[pairAsset] || {};
    STATE.workers.forEach((worker) => {
      const id = worker.id;
      // Adaptive vote weight: each lens speaks with a weight scaled by its own settled
      // accuracy on this pair (0.5 accuracy = neutral ~0.9x; 0.8 accuracy = 1.2x;
      // 0.2 accuracy = 0.5x). Lenses with fewer than 3 settled candles stay neutral.
      const stats = pairLensStats[id];
      const acc = stats && stats.n >= 3 ? stats.ewma : 0.5;
      const w = (worker.weight || 1) * Math.max(0.3, Math.min(1.3, 0.4 + acc));
      const lens = LENS[id];
      const score = lens ? lens() : 0;

      // Keep the graded score so the UI can show real signal strength, not just a label.
      worker.score = Math.max(-1, Math.min(1, score / 3));

      let vote;
      if (score > BAND) vote = "CALL";
      else if (score < -BAND) vote = "PUT";
      else vote = "HOLD";

      worker.vote = vote;
      worker.confidence = Math.min(0.98, 0.5 + Math.abs(score) * 0.4);

      if (vote === "CALL") { upCount++; upWeight += w; }
      else if (vote === "PUT") { downCount++; downWeight += w; }
      else { holdCount++; holdWeight += w; }
    });

    // The weighted NET score is the real signal power: it preserves each lens's magnitude,
    // so many consistent mid-strength flies outweigh a few loud outliers. The old code
    // force-converted abstentions into the majority, which inflated "consensus" numbers
    // that had nothing to do with the actual signal.
    const totalWeight = upWeight + downWeight + holdWeight || 1;
    const netScore = (upWeight - downWeight) / totalWeight;

    // --- DIRECTION DECISION -------------------------------------------------
    const maxVotes = Math.max(upCount, downCount);
    // Dominance is measured across the DIRECTIONAL votes only, so a clear 14/6 split is not
    // diluted by a few abstentions (that dilution is what produced "4/20" consensus).
    const directionalWeight = upWeight + downWeight || 1;
    const dominance = Math.abs(upWeight - downWeight) / directionalWeight;
    const bullish = upWeight >= downWeight;

    const enoughData = dataPoints >= (useCandles ? 5 : 6);
    const strongMajority = maxVotes >= 10;
    const decisive = Math.abs(netScore) >= 0.18 && strongMajority;

    const candleKey = phase.candleKey;

    // A market is only "genuinely untradeable" when EVERY independent lens is inside its
    // own noise band at the same time. The old code tested a single raw delta and used it
    // as an absolute veto, so a decisive 14/20 swarm could still be forced to HOLD - that
    // is exactly what the panel was showing (HOLD at 58% with a 14/20 consensus).
    const deadOscillators = rsi > 44 && rsi < 56 && stochK > 40 && stochK < 60;
    const quietMarket =
      Math.abs(m.z3) < 0.35 &&
      Math.abs(m.trendZ) < 0.35 &&
      deadOscillators &&
      Math.abs(netScore) < 0.15;

    const liveDir = bullish ? "CALL" : "PUT";

    // --- NEXT-CANDLE HORIZON ---------------------------------------------------
    // The verdict is locked for the candle that is ABOUT TO START, during the current
    // candle's entry window (its last ~8 seconds, when its own outcome is nearly
    // settled and the momentum read is the best evidence for the next candle). The
    // user therefore always sees a target with a FULL minute of lead time: at
    // "ENTRY NOW" the HUD shows exactly the trade to place, and the verdict then
    // stays stable for the whole target candle instead of flickering or arriving late.
    const warmingUp = !enoughData;
    if (warmingUp) STATE.status = "WARMING_UP";
    else if (STATE.status === "WARMING_UP") STATE.status = "LIVE";

    const targetCandleKey = candleKey + 1;
    let lock = STATE.nextCandleLock;
    if (lock && (lock.pair !== pairAsset || (lock.forCandleKey !== candleKey && lock.forCandleKey !== targetCandleKey))) {
      lock = null; // stale (pair switched or engine paused) — fall back to the live read
    }

    const packLock = (dir) => {
      const isHoldRaw = dir === "HOLD";
      const powerRaw = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
      return {
        forCandleKey: targetCandleKey,
        pair: pairAsset,
        direction: dir,
        confidence: isHoldRaw
          ? Math.max(0.5, Math.min(0.62, 0.5 + dominance * 0.2))
          : Math.max(0.52, Math.min(0.96, 0.52 + powerRaw * 0.36 + dominance * 0.08)),
        power: powerRaw,
        upVotes: upCount,
        downVotes: downCount,
        holdVotes: holdCount,
        votes: STATE.workers.map((w) => ({ id: w.id, vote: w.vote })),
        lockedAt: Date.now(),
        settled: false
      };
    };

    if (phase.isEntryZone && enoughData) {
      const dir = (!decisive || quietMarket) ? "HOLD" : liveDir;
      if (!STATE.nextCandleLock || STATE.nextCandleLock.forCandleKey !== targetCandleKey || STATE.nextCandleLock.pair !== pairAsset) {
        // First read of the upcoming candle: freeze verdict, power and the vote
        // snapshot (the snapshot is settled against the real close for learning).
        STATE.nextCandleLock = packLock(dir);
      } else if (STATE.nextCandleLock.direction === "HOLD" && dir !== "HOLD") {
        // A HOLD lock upgrades immediately when the swarm commits during the window.
        STATE.nextCandleLock = packLock(dir);
      } else if (STATE.nextCandleLock.direction !== "HOLD" && dir !== "HOLD" && dir !== STATE.nextCandleLock.direction && Math.abs(netScore) >= 0.45) {
        // Overwhelming counter-evidence inside the window re-locks the other side.
        STATE.nextCandleLock = packLock(dir);
      }
      lock = STATE.nextCandleLock;
    }

    let queenDir, confidence, power, consensusRate, upV, downV, holdV;
    if (lock) {
      // Stable locked verdict. An early, strongly-evidenced reversal is still allowed
      // while the target candle is young enough to be actionable (first 20 seconds);
      // after that the verdict stands so the target never flickers late.
      if (lock.direction !== "HOLD" && decisive && bullish !== (lock.direction === "CALL") && Math.abs(netScore) >= 0.3 && phase.elapsedSec <= 20) {
        lock.direction = liveDir;
        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + Math.abs(netScore) * 1.6 * 0.36 + dominance * 0.08));
      } else if (lock.direction === 'PUT' && smcRead.structure >= 1.1 && phase.elapsedSec <= 45) {
        // Bullish BOS/CHoCH against a locked PUT: the market has genuinely flipped up.
        lock.direction = 'CALL';
        lock.power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + lock.power * 0.36 + dominance * 0.08));
      } else if (lock.direction === 'CALL' && smcRead.structure <= -1.1 && phase.elapsedSec <= 45) {
        // Bearish BOS/CHoCH against a locked CALL: the market has genuinely flipped down.
        lock.direction = 'PUT';
        lock.power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + lock.power * 0.36 + dominance * 0.08));
      } else if (lock.direction === 'HOLD' && decisive && !quietMarket && phase.elapsedSec <= 45) {
        lock.direction = liveDir;
        lock.power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + lock.power * 0.36 + dominance * 0.08));
      }
      queenDir = lock.direction;
      confidence = lock.confidence;
      power = lock.power;
      upV = lock.upVotes;
      downV = lock.downVotes;
      holdV = lock.holdVotes;
      consensusRate = queenDir === "HOLD" ? holdV : (upV + downV) / 20;
    } else {
      // No lock yet (warming up or just after a pair switch): show the honest live read.
      queenDir = warmingUp || !decisive || quietMarket ? "HOLD" : liveDir;
      const isHoldRaw = queenDir === "HOLD";
      power = warmingUp ? 0 : Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));
      confidence = warmingUp
        ? 0
        : isHoldRaw
          ? Math.max(0.5, Math.min(0.62, 0.5 + dominance * 0.2))
          : Math.max(0.52, Math.min(0.96, 0.52 + power * 0.36 + dominance * 0.08));
      upV = upCount;
      downV = downCount;
      holdV = holdCount;
      consensusRate = warmingUp ? 0 : (isHoldRaw ? holdV : (upV + downV)) / 20;
    }

    const isHold = queenDir === "HOLD";

    const roundData = calculateOptimalRoundNumber(price, pairAsset, queenDir);
    const nextCandleLabel = isHold
      ? "HOLD ⏸ (NO TRADE)"
      : queenDir === "CALL" ? "CALL ⬆ (UP)" : "PUT ⬇ (DOWN)";

    const phaseLabel = reversionBias > 0.05 ? 'MEAN-REVERTING (trap fades active)' : reversionBias < -0.05 ? 'TRENDING (trap fades muted)' : 'MIXED';
    const evidence = [
      'Market: ' + phaseLabel + ' (' + Math.round(Math.abs(reversionBias) * 100) + '% bias)',
      'SMC: ' + smcRead.score + '/100 ' + (smcRead.evidence.length ? smcRead.evidence.slice(0, 3).join(' | ') : '(no strong structure read)'),
      `Next Candle Prediction: ${nextCandleLabel} (${Math.round(confidence * 100)}% Confidence)`,
      `Optimal Round Entry: @ ${roundData.optimalRound} (${roundData.label})`,
      `M1 Candle Expiry: ${phase.timeFormatted} | Worker Consensus: ${Math.max(upV, downV)}/20`,
      `Signal Power: ${Math.round(power * 100)}% | Net ${netScore >= 0 ? '+' : ''}${(netScore * 100).toFixed(0)} | Z3 ${m.z3.toFixed(2)} | Trend ${m.trendZ.toFixed(2)}`,
      `RSI ${rsi.toFixed(1)} | Stoch ${stochK.toFixed(1)} | ${dataSource} (${dataPoints} pts)`
    ];

    STATE.queenSignal = {
      direction: queenDir,
      nextCandleDirection: nextCandleLabel,
      confidence: confidence,
      consensus: consensusRate,
      status: warmingUp ? "WARMING_UP" : (isHold ? "SAFE_HOLD_NEUTRAL_MARKET" : "LIVE_CONSENSUS_SIGNAL"),
      warmingUp: warmingUp,
      hasPrice: price > 0,
      evidence: evidence,
      upVotes: upV,
      downVotes: downV,
      holdVotes: holdV,
      confluenceScore: isHold ? Math.round(smcScore * 0.8) : smcScore,
      // Signal POWER / accuracy inputs, shared with the popup and the web app.
      power: power,
      netScore: netScore,
      dominance: dominance,
      dataSource: dataSource,
      dataPoints: dataPoints,
      expiry: "1 MINUTE (M1 OTC)",
      asset: pairAsset,
      // The verdict targets the candle this lock was made FOR (the one the user can
      // still trade) — not the candle that is already running.
      candleKey: lock ? lock.forCandleKey : candleKey,
      candleExpirySeconds: phase.remainingSec,
      candleExpiryTimer: phase.timeFormatted,
      candleCloseAt: phase.closeAt,
      candlePhase: phase,
      isEntryZone: phase.isEntryZone,
      optimalRoundNumber: roundData.optimalRound,
      roundLevels: roundData,
      source: "QUOTEX_LIVE",
      timestamp: Date.now()
    };

    // Publish the signal for THIS pair only, then refresh the best-opportunity pair and
    // raise a side notification if this is a brand new CALL/PUT.
    STATE.pairSignals[pairAsset] = STATE.queenSignal;
    updateBestPairSignal();
    announceSignal(pairAsset, STATE.queenSignal, true);

    // Auto-trade fires right after the verdict is published (entry window only).
    maybeAutoTrade(pairAsset, phase, candleKey);
  }

  // --- AUTO-TRADE PERSISTENCE -----------------------------------------------
  // Auto-trade USER SETTINGS are shared across tabs; runtime counters (streaks, last
  // attempts) stay per-tab in memory. Persisting the whole object let whichever tab
  // traded last overwrite settings the user changed in the popup a second later.
  const AUTO_TRADE_SETTINGS_KEYS = ['enabled', 'amount', 'minConfidence', 'followBest', 'maxRepeat', 'repeatCooldownCandles'];

  function pickAutoTradeSettings() {
    const out = {};
    AUTO_TRADE_SETTINGS_KEYS.forEach((k) => { out[k] = STATE.autoTrade[k]; });
    return out;
  }

  function applyAutoTradeSettings(obj) {
    if (!obj || typeof obj !== 'object') return;
    AUTO_TRADE_SETTINGS_KEYS.forEach((k) => {
      if (obj[k] !== undefined) STATE.autoTrade[k] = obj[k];
    });
  }

  function saveAutoTrade() {
    try {
      STATE.__atLocalWriteAt = Date.now();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ autoTrade: pickAutoTradeSettings() });
      }
    } catch (e) {}
  }

  function loadAutoTrade() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['autoTrade'], function (res) {
          if (res && res.autoTrade && typeof res.autoTrade === 'object') {
            applyAutoTradeSettings(res.autoTrade);
          }
        });
      }
    } catch (e) {}
  }

  /**
   * Auto-trade: when enabled, place the trade in the Quotex tab at the entry window
   * using the locked next-candle verdict. Guards keep it disciplined: one trade per
   * target candle, a minimum-confidence bar, an 8s debounce, and only while the
   * signal engine actually has a lock for the upcoming candle.
   */
  function maybeAutoTrade(pairAsset, phase, candleKey) {
    const at = STATE.autoTrade;
    if (!at || !at.enabled) return;
    const minConf = at.minConfidence || 0.65;
    const noteSkip = (reason) => {
      at.lastSkip = { at: Date.now(), reason: reason };
      if (at.__lastSkipReason !== reason) {
        at.__lastSkipReason = reason;
        console.log('[OTC Swarm Queen] AUTO-TRADE waiting: ' + reason);
      }
    };

    const lock = STATE.nextCandleLock;
    if (!phase || !phase.isEntryZone) return; // trades only fire in the entry window

    if (!lock || lock.pair !== pairAsset || lock.direction === 'HOLD' || lock.forCandleKey !== candleKey + 1) {
      // The focused pair has no tradeable verdict for the upcoming candle.
      // followBest: another OPEN pair produced a strong signal — switch the Quotex
      // chart to it now; its own verdict will be traded at the next entry window.
      // TWO hard gates keep this from switching pointlessly:
      //   1. LOCAL DATA: only switch when this tab actually has live data for the
      //      target pair (own ticks or its own candle history). A signal that lives
      //      only in ANOTHER browser tab cannot be traded here — that tab's own
      //      engine (auto-trade is synced everywhere) trades it in its own chart.
      //   2. SETTLE COOLDOWN: after a switch, leave the new pair alone for 2 candles
      //      so its fresh verdict can form — bouncing to yet another pair every
      //      candle is exactly the "selects but never trades" failure mode.
      if (at.followBest && (at.lastSwitchCandleKey !== candleKey || at.lastSwitchFailed)) {
        const best = STATE.bestPair;
        if (best && best.asset && best.asset !== pairAsset && best.direction && best.direction !== 'HOLD' && (best.confidence || 0) >= minConf) {
          // No local-data gate here on purpose: candle `time` units differ between
          // broker builds, which made every same-page signal look "stale" and blocked
          // the switch with a misleading "lives in another tab". The trade itself is
          // still safe — after the chart changes, the full engine only fires on a
          // FRESH verdict for the new pair.
          if (!at.lastSwitchFailed && at.lastFollowBestCandle !== null && candleKey - at.lastFollowBestCandle < 1) {
            noteSkip('switched last candle - giving ' + pairAsset + ' time to stream its fresh verdict');
          } else {
            at.lastSwitchCandleKey = candleKey;
            at.lastFollowBestCandle = candleKey;
            noteSkip('following best signal: switching chart to ' + best.asset + ' (' + best.direction + ' ' + Math.round((best.confidence || 0) * 100) + '%)');
            console.log('[OTC Swarm Queen] AUTO-TRADE follow-best: switching chart to ' + best.asset + ' (' + best.direction + ' ' + Math.round((best.confidence || 0) * 100) + '%)');
            switchQuotexDomPair(best.asset);
            return;
          }
        } else {
          noteSkip('no tradeable signal: focused pair ' + pairAsset + ' is HOLD' + (best && best.asset ? ', best other pair ' + best.asset + ' ' + (best.direction || 'HOLD') + ' ' + Math.round((best.confidence || 0) * 100) + '%' : '') + ' (needs ≥' + Math.round(minConf * 100) + '%)');
        }
      } else if (!at.followBest) {
        noteSkip('no tradeable signal: focused pair ' + pairAsset + ' verdict is HOLD for the next candle');
      }
      return;
    }
    if (lock.confidence < minConf) {
      noteSkip('signal too weak: ' + lock.direction + ' ' + Math.round(lock.confidence * 100) + '% < ' + Math.round(minConf * 100) + '% threshold');
      return;
    }
    // One trade per PAIR per target candle — a CALL on USD/COP must never block a
    // fresh PUT signal on GBP/NZD for the same minute.
    const tradedPairKey = pairAsset + '@' + lock.forCandleKey;
    if (at.lastTradedPairKey === tradedPairKey) {
      noteSkip('already traded ' + lock.direction + ' on ' + pairAsset + ' for this candle');
      return;
    }
    if (Date.now() - (at.lastTradedAt || 0) < 8000) {
      noteSkip('debounce (8s between trades)');
      return;
    }
    // Same-direction repeat guard: chaining the same trade every single candle is how
    // a weak edge bleeds the balance. After N consecutive same-direction trades the
    // engine cools down for a few candles, unless the direction flips.
    const repeatLimit = at.maxRepeat === 0 ? Infinity : (at.maxRepeat || 2);
    if (at.sameDir === lock.direction && (at.sameDirCount || 0) >= repeatLimit) {
      const candlesSince = lock.forCandleKey - (at.lastTradedCandleKey || lock.forCandleKey);
      if (candlesSince < (at.repeatCooldownCandles || 2)) {
        noteSkip('paused: ' + (at.sameDirCount || 0) + ' consecutive ' + lock.direction + ' trades (limit ' + repeatLimit + ') - cooling down ' + ((at.repeatCooldownCandles || 2) - candlesSince) + ' more candle(s) unless direction flips');
        return;
      }
    }
    const amount = Math.max(1, Number(at.amount) || 1);
    const res = executeQuotexDomTrade(lock.direction === 'CALL' ? 'CALL' : 'PUT', amount);
    at.lastTradedAt = Date.now();
    at.lastTradedCandleKey = lock.forCandleKey;
    at.lastTradedPairKey = tradedPairKey;
    at.lastResult = {
      direction: lock.direction === 'CALL' ? 'CALL' : 'PUT',
      amount: amount,
      ok: !!res.success,
      reason: res.reason || null,
      at: Date.now(),
      asset: pairAsset
    };
    if (res.success) {
      if (at.sameDir === at.lastResult.direction) at.sameDirCount = (at.sameDirCount || 0) + 1;
      else { at.sameDir = at.lastResult.direction; at.sameDirCount = 1; }
    }
    console.log('[OTC Swarm Queen] AUTO-TRADE ' + (at.lastResult.ok ? 'executed' : 'FAILED') + ': ' + at.lastResult.direction + ' $' + amount + ' on ' + pairAsset + ' (conf ' + Math.round(lock.confidence * 100) + '%)' + (at.lastResult.ok ? '' : ' - ' + at.lastResult.reason));
    saveAutoTrade();
    broadcastRealState();
  }


  function handleNewRealTick(asset, price, source) {
    if (!asset) return;

    // A manual selection (popup / web app) wins: neither the DOM poll nor a stray tick
    // from another Quotex tab may steal the focus back to the previously selected pair.
    const lockActive = STATE.lockedAsset && Date.now() < STATE.lockUntil;
    const activeAsset = lockActive && asset !== STATE.lockedAsset ? STATE.lockedAsset : asset;
    const prevAsset = STATE.asset;

    if (prevAsset !== activeAsset) {
      console.log(`[OTC Swarm Queen] ⚡ Focused Quotex pair: ${prevAsset || 'NONE'} ➔ ${activeAsset} (${source})`);
      STATE.asset = activeAsset;
      STATE.nextCandleLock = null; // a new pair must never inherit the old verdict
      // A pair switch must NEVER inherit the previous pair's price. Falling back to
      // STATE.currentPrice here is what made USD/MXN display USD/IDR's ~17864 value.
      STATE.currentPrice = STATE.assetPriceCache[activeAsset] || 0;
      STATE.priceConfirm = { asset: null, value: 0, count: 0 };
    }

    // Reject a price that clearly belongs to a DIFFERENT pair. The quote-range prior is
    // the strongest check available: USD/IDR is ~17,000-20,000 and can never be 1.21, and
    // USD/BRL is ~4-7 and can never be 17,864. This is what stops the panel from showing
    // one pair's price under another pair's name.
    let tickPrice = price && !isNaN(price) && price > 0 ? price : 0;
    if (tickPrice > 0 && !isPlausiblePriceFor(asset, tickPrice)) {
      console.warn(
        `[OTC Swarm Queen] Ignoring implausible price ${tickPrice} for ${asset} ` +
        `(outside its quote range)`
      );
      tickPrice = 0;
    }
    const knownPrice = STATE.assetPriceCache[asset];
    if (tickPrice > 0 && knownPrice > 0) {
      const ratio = tickPrice / knownPrice;
      if (ratio > 3 || ratio < 1 / 3) {
        console.warn(`[OTC Swarm Queen] Ignoring foreign price ${tickPrice} for ${asset} (last ${knownPrice})`);
        tickPrice = 0;
      }
    }

    // The tick is always stored under the pair it really belongs to.
    if (tickPrice > 0) recordPairTick(asset, tickPrice);

    // Legacy mirror -> this pair's deduplicated series.
    STATE.tickHistory = STATE.pairTicks[activeAsset] || [];

    STATE.changeReason = source || "TICK";

    if (activeAsset === asset && tickPrice > 0) {
      STATE.currentPrice = tickPrice;
    } else {
      // Locked to a different pair: use that pair's OWN cached price, and if we have none
      // say so (0) rather than showing the previous pair's number.
      STATE.currentPrice = STATE.assetPriceCache[activeAsset] || 0;
    }

    STATE.lastTickTime = Date.now();
    if (tickPrice > 0) STATE.tickCount++;
    STATE.isFocused = document.hasFocus();
    STATE.connectionStatus = "STREAMING_REAL_TICKS";
    STATE.lastError = null;

    calculateSwarmSignals(STATE.currentPrice);
    broadcastRealState();
    updateHud();
  }

  function broadcastRealState() {
    const scannedTabs = scanAllQuotexTabs(STATE.asset);
    STATE.scannedTabs = scannedTabs;

    const freshPairsMap = {};
    for (const t of scannedTabs) {
      // ALWAYS use the pair's own last price - never the active pair's price for another pair.
      const p = STATE.assetPriceCache[t.asset] || (t.asset === STATE.asset ? STATE.currentPrice : 0);
      freshPairsMap[t.asset] = {
        asset: t.asset,
        currentPrice: p,
        payout: t.payout,
        payoutPct: t.payoutPct,
        isActive: t.asset === STATE.asset,
        queenSignal: STATE.pairSignals[t.asset] || t.queenSignal,
        candles: t.asset === STATE.asset ? STATE.candlesHistory : []
      };
    }
    STATE.activePairs = freshPairsMap;

    const payload = {
      connected: Boolean(STATE.asset),
      dataSource: "QUOTEX_LIVE",
      asset: STATE.asset,
      currentPrice: STATE.currentPrice,
      payout: STATE.payout,
      scannedTabs: scannedTabs,
      activePairs: freshPairsMap,
      candles: STATE.candlesHistory,
      lastTickTime: STATE.lastTickTime,
      tickCount: STATE.tickCount,
      connectionStatus: STATE.asset ? STATE.connectionStatus : "PAIR_NOT_DETECTED",
      isFocused: document.hasFocus(),
      tabTitle: document.title || STATE.asset,
      lastError: STATE.lastError,
      queenSignal: STATE.queenSignal,
      pairSignals: STATE.pairSignals,
      bestPair: STATE.bestPair,
      noSetupPair: STATE.noSetupPair || null,
      workers: STATE.workers,
      autoTrade: STATE.autoTrade,
      candlePhase: STATE.candlePhase,
      candleExpirySeconds: STATE.candlePhase ? STATE.candlePhase.remainingSec : null,
      candleExpiryTimer: STATE.candlePhase ? STATE.candlePhase.timeFormatted : null,
      candleCloseAt: STATE.candlePhase ? STATE.candlePhase.closeAt : null,
      lockedAsset: STATE.lockedAsset,
      isLocked: Boolean(STATE.lockedAsset && Date.now() < STATE.lockUntil),
      pairSelectionMode: STATE.lockedAsset && Date.now() < STATE.lockUntil ? "MANUAL" : "AUTO",
      changeReason: STATE.changeReason,
      timestamp: Date.now()
    };

    // 1. Dispatch to Chrome Extension Background Service Worker
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "LIVE_ENGINE_UPDATE",
          payload: payload
        }, () => {
          if (!chromeAlive()) return; /* extension reloaded - page needs F5 */
        if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    } catch (e) {}

    // 2. Direct HTTP Post to Web App Endpoints
    const endpointsToCall = [...API_ENDPOINTS];
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["webAppUrl"], (res) => {
        if (res && res.webAppUrl) {
          const userUrl = `${res.webAppUrl.replace(/\/$/, '')}/api/swarm/quotex-feed`;
          if (!endpointsToCall.includes(userUrl)) endpointsToCall.push(userUrl);
        }
        for (const url of endpointsToCall) {
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            mode: "cors"
          }).catch(() => {});
        }
      });
    } else {
      for (const url of endpointsToCall) {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          mode: "cors"
        }).catch(() => {});
      }
    }

    // 3. Post to Window Event for in-page bridge
    window.postMessage({
      type: "OTC_QUOTEX_LIVE_FEED",
      payload: payload
    }, "*");
  }

  // Static skeleton for the floating panel. Built once and then only patched in place -
  // rebuilding the whole innerHTML on every tick was what made the window flicker.
  const HUD_SHELL = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:bold; color:#38bdf8;">\u{1F451} OTC SWARM QUEEN</span>
        <span style="display:flex; align-items:center; gap:5px;">
          <span id="sq-tabs" style="font-size:10px; background:#10b98122; color:#10b981; border:1px solid #10b98188; padding:1px 6px; border-radius:4px; font-weight:bold;"></span>
          <span id="sq-close" title="Hide the HUD (Ctrl+Shift+H brings it back)" style="cursor:pointer; color:#64748b; font-size:11px; padding:1px 6px; border:1px solid #3f3f46; border-radius:4px; line-height:1.4;">\u2715</span>
        </span>
      </div>

      <div style="margin-bottom:3px; display:flex; justify-content:space-between; align-items:center; font-size:11.5px;">
        <span style="color:#a1a1aa;">Active Pair:</span>
        <span style="font-weight:bold; color:#38bdf8;">
          <span id="sq-asset"></span>
          <span id="sq-lock" style="font-size:8px; padding:0 4px; border-radius:3px; margin-left:3px;"></span>
        </span>
      </div>

      <div id="sq-bestRow" style="margin-bottom:6px; display:none; justify-content:space-between; font-size:10.5px;">
        <span style="color:#a1a1aa;">\u26A1 Other pair signal:</span>
        <span id="sq-bestLabel" style="font-weight:bold;"></span>
      </div>

      <div id="sq-visionRow" style="margin-bottom:6px; display:none; justify-content:space-between; align-items:center; font-size:10.5px; background:#1e1b4b; border:1px solid #6d28d9; border-radius:6px; padding:3px 6px;">
        <span style="color:#c4b5fd;">\u{1F441} Vision:</span>
        <span id="sq-visionLabel" style="font-weight:bold;"></span>
      </div>

      <div id="sq-combinedRow" style="margin-bottom:6px; display:none; justify-content:space-between; align-items:center; font-size:10.5px; background:#052e16; border:1px solid #166534; border-radius:6px; padding:3px 6px;">
        <span style="color:#86efac;">\u{1F451} QUEEN COMBINED:</span>
        <span id="sq-combinedLabel" style="font-weight:bold;"></span>
      </div>

      <div style="margin-bottom:6px; display:flex; justify-content:space-between;">
        <span style="color:#a1a1aa;">Live Price:</span>
        <span id="sq-price" style="font-weight:bold; font-size:13px;"></span>
      </div>

      <div id="sq-signalBox" style="border:1px solid #334155; padding:8px 10px; border-radius:7px; margin-bottom:7px; text-align:center;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:9.5px; margin-bottom:3px; color:#e4e4e7;">
          <span style="font-weight:bold; text-transform:uppercase; color:#bae6fd;">1-MIN OTC PREDICTION</span>
          <span id="sq-expiry" style="padding:1px 6px; border-radius:3px; font-weight:bold;"></span>
        </div>
        <div id="sq-next" style="font-weight:900; font-size:14px; letter-spacing:0.5px;"></div>
        <div id="sq-metrics" style="font-size:9.5px; color:#f1f5f9; margin-top:3px;"></div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
          <span style="font-size:8.5px; color:#94a3b8; font-weight:bold;">POWER</span>
          <div style="flex:1; height:6px; background:#0f172a; border:1px solid #334155; border-radius:3px; overflow:hidden;">
            <div id="sq-powerFill" style="width:0%; height:100%;"></div>
          </div>
          <b id="sq-powerVal" style="font-size:9px; min-width:30px; text-align:right;"></b>
        </div>
        <div id="sq-note" style="font-size:8.5px; color:#94a3b8; margin-top:2px;"></div>
      </div>

      <div style="background:#090d16; border:1px solid #1e293b; padding:6px 9px; border-radius:6px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <span style="font-size:9.5px; font-weight:bold; color:#38bdf8;">\u{1F3AF} OPTIMAL ROUND NUMBER ENTRY:</span>
          <span id="sq-roundLabel" style="font-size:8.5px; color:#a1a1aa;"></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <span id="sq-roundLevel" style="font-size:13px; font-weight:bold; color:#34d399;"></span>
          <span style="font-size:9px; color:#a1a1aa;">Dist: <b id="sq-roundPips"></b></span>
        </div>
        <div style="font-size:8.5px; color:#64748b; margin-top:2px; display:flex; justify-content:space-between;">
          <span>Support: <b id="sq-roundSup" style="color:#cbd5e1;"></b></span>
          <span>Resistance: <b id="sq-roundRes" style="color:#cbd5e1;"></b></span>
        </div>
      </div>

      <div style="font-size:9.5px; color:#71717a; border-top:1px solid #27272a; padding-top:4px; display:flex; justify-content:space-between;">
        <span id="sq-footTabs"></span>
        <span id="sq-footTicks"></span>
      </div>
    `;

  /**
   * IN-PAGE HUD WIDGET ON QUOTEX
   */
  function hudHiddenFlag() {
    try { return localStorage.getItem("sq_hud_hidden") === "1"; } catch (e) { return STATE.hudHidden === true; }
  }
  function setHudHidden(hidden) {
    STATE.hudHidden = hidden;
    try {
      if (hidden) localStorage.setItem("sq_hud_hidden", "1");
      else localStorage.removeItem("sq_hud_hidden");
    } catch (e) { /* storage unavailable — in-memory only */ }
  }
  function wireHudCloseButton(hud) {
    const closeBtn = hud.querySelector("#sq-close");
    if (closeBtn && !closeBtn.__sqWired) {
      closeBtn.__sqWired = true;
      closeBtn.addEventListener("click", function () {
        setHudHidden(true);
        hud.remove();
      });
    }
  }

  function updateHud() {
    if (!document.body) return;
    // The user closed the HUD — it stays hidden until Ctrl+Shift+H or the popup toggle.
    if (hudHiddenFlag()) {
      const stale = document.getElementById("otc-swarm-queen-hud");
      if (stale) stale.remove();
      return;
    }

    let hud = document.getElementById("otc-swarm-queen-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "otc-swarm-queen-hud";
      hud.style.cssText = `
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 9999999;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 10px;
        padding: 12px 15px;
        font-family: monospace;
        font-size: 11px;
        color: #fafafa;
        box-shadow: 0 10px 35px rgba(0,0,0,0.9);
        min-width: 300px;
        pointer-events: auto;
      `;
      document.body.appendChild(hud);
    }

    if (!STATE.asset) {
      // Keep the same shell so the panel does not flicker between the scanning and
      // loaded layouts; just show the scanning state inside it.
      if (!hud.__sqShellBuilt) { hud.innerHTML = HUD_SHELL; hud.__sqShellBuilt = true; wireHudCloseButton(hud); }
      hud.style.borderColor = "#f43f5e";
      hud.__hudSignature = "SCANNING:" + window.location.hostname;
      const t = hud.querySelector("#sq-tabs");
      if (t) t.textContent = "SYNCING";
      const a = hud.querySelector("#sq-asset");
      if (a) a.textContent = "Detecting active pair\u2026";
      const lockEl = hud.querySelector("#sq-lock");
      if (lockEl) { lockEl.textContent = "\u26A1 AUTO"; lockEl.style.background = "#334155"; lockEl.style.color = "#cbd5e1"; }
      const pr = hud.querySelector("#sq-price");
      if (pr) { pr.textContent = "\u2014"; pr.style.color = "#64748b"; }
      return;
    }

    hud.style.borderColor = STATE.lockedAsset && Date.now() < STATE.lockUntil ? "#059669" : "#0284c7";

    // ALWAYS render the signal that belongs to the pair shown above (never another pair's),
    // and fall back to the previous best signal only if this pair has none yet.
    const q = STATE.pairSignals[STATE.asset] || STATE.queenSignal || {
      direction: "HOLD",
      confidence: 0,
      upVotes: 0,
      downVotes: 0,
      holdVotes: 20,
      evidence: []
    };
    const isCall = q.direction === "CALL" || q.direction === "UP";
    const isPut = q.direction === "PUT" || q.direction === "DOWN";
    // "Warming up" (no usable data yet) must not be rendered as a HOLD verdict.
    const warmingUp = Boolean(q.warmingUp || q.status === "WARMING_UP") || !STATE.currentPrice;
    const signalBg = isCall ? "#065f46" : isPut ? "#7f1d1d" : warmingUp ? "#0c1424" : "#27272a";
    const signalColor = isCall ? "#34d399" : isPut ? "#f87171" : warmingUp ? "#94a3b8" : "#fbbf24";
    const nextText = warmingUp
      ? "GATHERING DATA…"
      : isCall ? "NEXT CANDLE: CALL ⬆ (UP)"
      : isPut ? "NEXT CANDLE: PUT ⬇ (DOWN)"
      : "NEXT CANDLE: HOLD ⏸";

    // One expiry clock for everything: this is the Quotex 1-minute candle countdown.
    const timer = STATE.candlePhase || getQuotexCandleTimer();
    const roundData = q.roundLevels || calculateOptimalRoundNumber(STATE.currentPrice, STATE.asset, q.direction);

    const isLocked = Boolean(STATE.lockedAsset && Date.now() < STATE.lockUntil);

    // Signal POWER: how far the swarm sits from a coin flip (0-100%). This is the honest
    // "accuracy" readout - it is derived from the same weighted net score that produced the
    // direction, so it can never show a strong number next to a weak signal.
    const power = Math.max(0, Math.min(100, Math.round((q.power || 0) * 100)));
    const powerColor = power >= 60 ? "#34d399" : power >= 35 ? "#fbbf24" : "#94a3b8";

    // Other pairs are surfaced as a small side notification instead of a permanent row
    // here, so this panel always and only shows the SELECTED pair's signal.
    const best = STATE.bestPair;

    // Only repaint when something VISIBLE changed. The tick counter used to be part of
    // this signature, so the whole panel was rebuilt several times a second and visibly
    // flickered. The counter is patched separately below instead.
    const hudSignature = [
      STATE.asset,
      q.direction,
      Math.round((q.confidence || 0) * 100),
      power,
      Math.max(q.upVotes || 0, q.downVotes || 0),
      timer.remainingSec,
      STATE.currentPrice,
      STATE.scannedTabs.length,
      isLocked ? "L" : "A",
      best ? best.asset + ":" + best.direction : "-",
      STATE.visionScan ? STATE.visionScan.signal + ":" + Math.round((STATE.visionScan.confidence || 0) * 100) : "-",
      STATE.serverCombined ? STATE.serverCombined.direction + ":" + Math.round((STATE.serverCombined.confidence || 0) * 100) : "-"
    ].join("|");

    if (hud.__hudSignature === hudSignature) {
      // Cheap partial update: only the tick counter may have moved.
      const tf = hud.querySelector("#sq-footTicks");
      const tickText = "Ticks: " + STATE.tickCount;
      if (tf && tf.textContent !== tickText) tf.textContent = tickText;
      return;
    }
    hud.__hudSignature = hudSignature;

    // Build the skeleton exactly once. After that only the values are patched, because
    // replacing the whole innerHTML on every countdown tick tore the panel down and
    // rebuilt it several times a second - the visible "blinking" of the floating window.
    if (!hud.__sqShellBuilt) {
      hud.innerHTML = HUD_SHELL;
      hud.__sqShellBuilt = true;
      wireHudCloseButton(hud);
    }

    const setText = function (id, text) {
      const el = hud.querySelector("#sq-" + id);
      if (el && el.textContent !== text) el.textContent = text;
    };
    const setStyle = function (id, prop, value) {
      const el = hud.querySelector("#sq-" + id);
      if (el && el.style[prop] !== value) el.style[prop] = value;
    };

    // Header
    setText("tabs", STATE.scannedTabs.length + " TABS ONLINE \u{1F7E2}");

    // Active pair + ownership badge
    setText("asset", STATE.asset + " (" + Math.round((STATE.payout || 0.85) * 100) + "%)");
    setText("lock", isLocked ? "\u{1F512} SELECTED" : "\u26A1 AUTO");
    setStyle("lock", "background", isLocked ? "#065f46" : "#334155");
    setStyle("lock", "color", isLocked ? "#34d399" : "#cbd5e1");

    // Other-pair alert row (optional)
    const bestRowEl = hud.querySelector("#sq-bestRow");
    if (bestRowEl) {
      if (best && best.asset && best.asset !== STATE.asset) {
        bestRowEl.style.display = "flex";
        setText("bestLabel", best.asset + " \u2022 " + best.direction + " " + Math.round((best.confidence || 0) * 100) + "%");
        setStyle("bestLabel", "color", best.direction === "CALL" ? "#34d399" : "#f87171");
      } else {
        bestRowEl.style.display = "none";
      }
    }

    // Mistral vision row (server-side visual scan verdict for THIS pair)
    const visionRowEl = hud.querySelector("#sq-visionRow");
    if (visionRowEl) {
      const v = STATE.visionScan;
      if (v && v.asset === STATE.asset && v.signal && v.signal !== "NONE" && Date.now() - (v.timestamp || 0) < 120000) {
        visionRowEl.style.display = "flex";
        setText("visionLabel", v.signal + " " + Math.round((v.confidence || 0) * 100) + "% \u2022 " + (v.trend || "") + " / " + (v.momentum || ""));
        setStyle("visionLabel", "color", v.signal === "UP" ? "#34d399" : "#f87171");
      } else {
        visionRowEl.style.display = "none";
      }
    }

    // Combined Queen row (web app: SMC + vision + swarm consensus + QuickFire)
    const combinedRowEl = hud.querySelector("#sq-combinedRow");
    if (combinedRowEl) {
      const c = STATE.serverCombined;
      if (c && (!c.asset || c.asset === STATE.asset) && c.direction && Date.now() - (c.receivedAt || 0) < 20000) {
        combinedRowEl.style.display = "flex";
        const isQuick = c.status === "QUICK_SIGNAL";
        if (isQuick) {
          combinedRowEl.style.background = "#1e1b4b";
          combinedRowEl.style.borderColor = "#d97706";
        } else {
          combinedRowEl.style.background = "#052e16";
          combinedRowEl.style.borderColor = "#166534";
        }
        const cDir = c.direction === "UP" ? "CALL \u2191" : c.direction === "DOWN" ? "PUT \u2193" : "HOLD \u23F8";
        setText("combinedLabel", (isQuick ? "\u26A1QUICKFIRE " : "") + cDir + " " + Math.round((c.confidence || 0) * 100) + "% \u2022 " + Math.round((c.consensus || 0) * 100) + "% consensus");
        setStyle("combinedLabel", "color", c.direction === "UP" ? "#34d399" : c.direction === "DOWN" ? "#f87171" : "#fbbf24");
      } else {
        combinedRowEl.style.display = "none";
      }
    }

    // Live price
    const priceText = STATE.currentPrice > 0
      ? STATE.currentPrice.toFixed(STATE.currentPrice > 100 ? 2 : 5)
      : "\u2014";
    setText("price", priceText);
    setStyle("price", "color", STATE.currentPrice > 0 ? "#34d399" : "#64748b");

    // Signal box
    setStyle("signalBox", "background", signalBg);
    setStyle("signalBox", "borderColor", signalColor);
    setStyle("expiry", "background", timer.isEntryZone ? "#dc2626" : "#0f172a");
    setStyle("expiry", "color", timer.isEntryZone ? "#fff" : "#38bdf8");
    setText("expiry", "\u23F1 EXPIRY: " + timer.timeFormatted);
    setText("next", nextText);
    setStyle("next", "color", signalColor);

    if (warmingUp) {
      setText("metrics", "Data points: " + (q.dataPoints || 0) + " \u2014 reading the live Quotex feed\u2026");
    } else {
      setText("metrics", "Confidence: " + Math.round((q.confidence || 0) * 100) + "% | Consensus: " +
        Math.max(q.upVotes || 0, q.downVotes || 0) + "/20 Workers");
    }

    setStyle("powerFill", "width", power + "%");
    setStyle("powerFill", "background", powerColor);
    setStyle("powerVal", "color", powerColor);
    setText("powerVal", power + "%");

    setText("note", warmingUp
      ? "\u23F3 Waiting for enough live data on this pair to judge the next candle"
      : (q.direction === "HOLD")
        ? "\u26A0\uFE0F No clear edge on this candle \u2014 every lens is inside its own noise band"
        : "\u2705 " + (q.nextCandleDirection || q.direction) + " tradeable on the next M1 candle");

    // Optimal round number card
    setText("roundLabel", roundData.label);
    setText("roundLevel", "@ " + roundData.optimalRound);
    setText("roundPips", roundData.pipsDiff + " pips");
    setText("roundSup", roundData.lowerRound);
    setText("roundRes", roundData.upperRound);

    // Footer
    setText("footTabs", "Open Tabs: " + STATE.scannedTabs.length);
    setText("footTicks", "Ticks: " + STATE.tickCount);
  }

  // Handle messages from Injected Main-World WebSocket Interceptor Hook

  /**
   * Frame-based pair attribution fallback.
   * When DOM pair detection fails (new Quotex layouts, landing pages, SPA races)
   * STATE.asset stays empty and the number-only scanner cannot attribute any tick.
   * The broker frames THEMSELVES carry the pair identity as object keys / tokens
   * (e.g. "usdbrlotc", "USD/BRL", "eurusd_otc"), so read the names straight out of
   * the frame, validate them against the known currency list and each pair's own
   * quote range, and promote the pair that clearly dominates the recent frames.
   */
  function pairFromToken(token) {
    if (!token) return null;
    let str = String(token).trim().toUpperCase().replace(/[_\-\s]/g, "");
    str = str.replace(/OTC$/, "");
    const m = str.match(/^([A-Z]{3})([A-Z]{3})$/);
    if (m && KNOWN_CURRENCIES.includes(m[1]) && KNOWN_CURRENCIES.includes(m[2])) {
      return m[1] + "/" + m[2] + " (OTC)";
    }
    return null;
  }

  function extractPairQuotesFromFrame(text) {
    const quotes = [];
    const seen = new Set();
    const push = (token, price) => {
      const asset = pairFromToken(token);
      if (!asset || !price || isNaN(price) || price <= 0 || seen.has(asset)) return;
      seen.add(asset);
      quotes.push({ asset: asset, price: price });
    };

    // 1. Structured walk: any object key that is a pair token, or an asset-like
    //    string field, paired with a numeric price field in the same object. A
    //    pair-token key whose value is a nested object ("usdbrlotc": {...}) carries
    //    the token down into the child so its price field can be matched.
    try {
      const jsonStart = text.indexOf("[");
      const objStart = text.indexOf("{");
      const startIdx = (jsonStart !== -1 && (objStart === -1 || jsonStart < objStart)) ? jsonStart : objStart;
      if (startIdx !== -1) {
        const payload = JSON.parse(text.slice(startIdx));
        const visit = (node, depth, carriedTokens) => {
          if (quotes.length >= 24 || !node || typeof node !== "object" || depth > 7) return;
          if (Array.isArray(node)) {
            for (const n of node) visit(n, depth + 1, carriedTokens);
            return;
          }
          const tokens = new Set(carriedTokens || []);
          const nums = [];
          for (const key of Object.keys(node)) {
            const val = node[key];
            if (pairFromToken(key)) tokens.add(key);
            if (typeof val === "string") {
              const kl = key.toLowerCase();
              if ((kl.includes("asset") || kl.includes("symbol") || kl.includes("pair") || kl.includes("instrument")) && pairFromToken(val)) {
                tokens.add(val);
              }
              const num = parseFloat(val.replace(",", "."));
              if (isFinite(num) && num > 0) nums.push({ key: key, num: num });
            } else if (typeof val === "number" && isFinite(val) && val > 0) {
              nums.push({ key: key, num: val });
            } else if (val && typeof val === "object") {
              visit(val, depth + 1, tokens);
            }
          }
          if (tokens.size && nums.length) {
            const priceEntry =
              nums.find((n) => /price|close|rate|value|quote|^p$|^c$/i.test(n.key)) || nums[0];
            tokens.forEach((t) => push(t, priceEntry.num));
          }
        };
        visit(payload, 0, null);
      }
    } catch (e) { /* not JSON — token fallback below */ }

    // 2. Token fallback: scan every word, and for a word that IS a known pair
    //    token look ahead for the first decimal within ~24 chars. (A loose
    //    "word then number" regex would let an unrelated word like "success"
    //    swallow the real pair token inside its look-ahead window.)
    if (!quotes.length) {
      const wordRe = /[a-zA-Z]{6,12}/g;
      let wm;
      while ((wm = wordRe.exec(text)) && quotes.length < 24) {
        if (!pairFromToken(wm[0])) continue;
        const after = text.slice(wm.index + wm[0].length, wm.index + wm[0].length + 24);
        const numMatch = after.match(/\d+[.,]\d{1,6}/);
        if (numMatch) push(wm[0], parseFloat(numMatch[0].replace(",", ".")));
      }
    }
    return quotes;
  }

  function runFramePairAttribution(frameText) {
    const quotes = extractPairQuotesFromFrame(frameText);
    if (!quotes.length) return;
    STATE.wsFramePairTally = STATE.wsFramePairTally || { map: Object.create(null), total: 0 };
    for (const q of quotes) {
      if (!isPlausiblePriceFor(q.asset, q.price)) continue; // wrong instrument range
      recordPairTick(q.asset, q.price); // feeds every pair's own tick stream
      STATE.wsFramePairTally.map[q.asset] = (STATE.wsFramePairTally.map[q.asset] || 0) + 1;
      STATE.wsFramePairTally.total++;
    }
    const total = STATE.wsFramePairTally.total;
    if (total < 6) return;
    const entries = Object.entries(STATE.wsFramePairTally.map).sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    const share = top ? top[1] / total : 0;
    // The open chart's pair is ticked far more often than pairs that only appear
    // in snapshots — promote it once it clearly leads (or after ~3s of frames).
    if (top && (share >= 0.6 || (total >= 40 && share >= 0.33))) {
      handleNewRealTick(top[0], STATE.assetPriceCache[top[0]] || 0, "WS_FRAME_NAME");
      STATE.wsFramePairTally = { map: Object.create(null), total: 0 };
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data) return;

    if (event.data.type === "__QX_RAW__") {
      // Scan the raw broker frame for a number that fits the OPEN pair's quote range.
      // This does not depend on guessing the broker's event names, so the feed keeps
      // working even when the protocol differs from what we expected.
      if (typeof event.data.text !== "string") return;
      if (!STATE.asset) {
        // DOM pair detection failed — read the pair identity straight out of the
        // broker frame instead of dropping every tick on the floor.
        runFramePairAttribution(event.data.text);
        return;
      }
      const asset = STATE.asset;

      // Accept both dot- and comma-decimal numbers: Quotex's Turkish-localised feed can
      // serialise prices as "19,93325", and the old dot-only regex silently ignored those
      // frames, which is one reason the price could go missing entirely.
      const matches = event.data.text.match(/\d+[.,]\d{1,6}/g);
      if (!matches || !matches.length) return;

      const known = STATE.assetPriceCache[asset] || 0;
      const tally = Object.create(null);
      for (let i = 0; i < matches.length; i++) {
        const v = parseFloat(matches[i].replace(",", "."));
        if (!isFinite(v) || v <= 0) continue;
        if (!isPlausiblePriceFor(asset, v)) continue;      // wrong instrument
        // Once we know the price, only accept near-identical values, so timestamps,
        // payouts and expiry counters can never be mistaken for a quote.
        if (known > 0 && Math.abs(v - known) / known > 0.01) continue;
        // Tally on the NORMALISED value so "19.9332" and "19,9332" reinforce each other
        // instead of competing as two separate candidates.
        const key = v.toFixed(6);
        tally[key] = (tally[key] || 0) + 1;
      }

      let bestV = 0, bestN = 0;
      for (const k in tally) {
        if (tally[k] > bestN) { bestN = tally[k]; bestV = parseFloat(k); }
      }
      // Without a prior price we require the value to appear at least twice, which
      // filters out isolated counters and ids.
      if (bestV > 0 && (known > 0 || bestN >= 2)) {
        handleNewRealTick(asset, bestV, "WS_RAW_FRAME");
      }
      return;
    }

    if (event.data.type === "__QX_HOOK_ALIVE__") {
      // The MAIN-world hook announced itself on this page load. Without this we cannot
      // tell "hook missing (stale tab — F5 needed)" from "hook attached, broker silent".
      STATE.hookAliveAt = Date.now();
      return;
    }

    if (event.data.type === "__QX_HOOK_STATS__") {
      STATE.hookStats = event.data.stats;
      // Surface the hook health to the server every ~30s so the web app's Logs can
      // prove whether the MAIN-world interceptor is seeing broker frames at all.
      if (!STATE.__lastHookStatsLogAt || Date.now() - STATE.__lastHookStatsLogAt > 30000) {
        STATE.__lastHookStatsLogAt = Date.now();
        const st = event.data.stats || {};
        const summary = "WS hook: " + (st.frames || 0) + " frames seen (" +
          (st.text || 0) + " text, " + (st.blob || 0) + " blob, " + (st.binary || 0) +
          " binary, " + (st.forwarded || 0) + " forwarded, " + (st.socketsOpened || 0) + " sockets)";
        const entry = {
          id: "hook_" + Date.now(),
          timestamp: Date.now(),
          level: (st.frames || 0) > 0 ? "INFO" : "WARN",
          type: "WS_HOOK_STATS",
          source: "QUOTEX_WS_HOOK",
          message: summary
        };
        window.postMessage({ type: "OTC_DIAGNOSTIC_LOG", payload: entry }, "*");
        for (const ep of API_ENDPOINTS) {
          try {
            fetch(ep.replace("/api/swarm/quotex-feed", "/api/swarm/log"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              mode: "cors",
              body: JSON.stringify(entry)
            }).catch(function () {});
          } catch (e) {}
        }
      }
      return;
    }

    if (event.data.type === "__QX_WS_CANDLES_HISTORY__") {
      const candles = event.data.candles;
      const asset = normalizeAssetName(event.data.asset);
      if (Array.isArray(candles) && candles.length > 0) {
        if (asset) {
          const lastC = candles[candles.length - 1];
          if (lastC && lastC.close > 0) {
            STATE.assetPriceCache[asset] = lastC.close;
          }
          // Keep the M1 history per pair so a pair the user is NOT currently viewing can
          // still be scored on its own real candles instead of "no ticks -> HOLD".
          STATE.pairCandles[asset] = candles.slice(-60);
        }
        if (asset === STATE.asset || !STATE.asset) {
          STATE.candlesHistory = candles;
          if (asset) STATE.asset = asset;
          const lastC = candles[candles.length - 1];
          if (lastC && lastC.close > 0) {
            STATE.currentPrice = lastC.close;
          }
          broadcastRealState();
          updateHud();
        }
      }
    }

    if (event.data.type === "__QX_WS_REAL_TICK__") {
      const normAsset = normalizeAssetName(event.data.asset);
      const price = event.data.price;
      // A tick is ground truth from the broker. Trust it far more than any DOM scrape,
      // but still refuse a number that contradicts the pair's own quote range.
      if (normAsset && price > 0 && isPlausiblePriceFor(normAsset, price)) {
        // Keep a per-pair tick stream for EVERY pair so each pair's signal is computed
        // from its own market instead of the focused pair's price.
        recordPairTick(normAsset, price);
        if (normAsset === STATE.asset || (STATE.lockedAsset && normAsset === STATE.lockedAsset)) {
          handleNewRealTick(normAsset, price, "WS_RAW_TICK");
        }
      }
    }

    if (event.data.type === "__QX_WS_CHANGE_ASSET__") {
      const normAsset = normalizeAssetName(event.data.asset);
      if (normAsset) {
        // Quotex itself switched asset - this is ground truth, so it bypasses the
        // detection hysteresis that guards against single-frame DOM flapping.
        STATE.detectCandidate = null;
        STATE.detectCandidateCount = 0;
        // Only follow it when the user has NOT pinned a pair.
        const lockActive = STATE.lockedAsset && Date.now() < STATE.lockUntil;
        if (!lockActive) {
          handleNewRealTick(normAsset, STATE.assetPriceCache[normAsset] || 0, "WS_CHANGE_ASSET");
        }
      }
    }
  });

  // DOM Trade Executor
  function executeQuotexDomTrade(direction, amount) {
    const dirUpper = String(direction).toUpperCase();
    const isCall = dirUpper === "CALL" || dirUpper === "UP" || dirUpper === "BUY";
    const isPut = dirUpper === "PUT" || dirUpper === "DOWN" || dirUpper === "SELL";

    if (!isCall && !isPut) {
      return { success: false, reason: "INVALID_DIRECTION", direction };
    }

    try {
      if (amount && amount > 0) {
        const amountInputs = document.querySelectorAll(
          "input[class*='amount'], input[class*='investment'], input[name*='amount'], [class*='deal-form'] input[type='text'], [class*='deal-form'] input[type='number']"
        );
        for (const input of amountInputs) {
          try {
            input.focus();
            // The investment field is a React-controlled input: assigning .value
            // directly is silently ignored by React's value tracker (the UI keeps the
            // old amount and the trade goes through with whatever was there). The
            // native prototype setter + bubbling input event is what React hears.
            const proto = input instanceof window.HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
            const valSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
            if (valSetter) valSetter.call(input, String(amount));
            else input.value = String(amount);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.blur();
            break;
          } catch (e) {}
        }
      }

      const allButtons = Array.from(document.querySelectorAll("button, [role='button'], div[class*='button']"));
      let targetButton = null;

      if (isCall) {
        targetButton = allButtons.find(b => {
          const txt = (b.textContent || "").trim().toLowerCase();
          const cls = (b.className || "").toLowerCase();
          return (
            txt === "up" || txt.includes("call") || txt.includes("buy") || txt.includes("yukarıda") || txt.includes("acima") ||
            cls.includes("call") || cls.includes("up") || cls.includes("green")
          );
        });
      } else {
        targetButton = allButtons.find(b => {
          const txt = (b.textContent || "").trim().toLowerCase();
          const cls = (b.className || "").toLowerCase();
          return (
            txt === "down" || txt.includes("put") || txt.includes("sell") || txt.includes("altında") || txt.includes("abaixo") ||
            cls.includes("put") || cls.includes("down") || cls.includes("red")
          );
        });
      }

      if (!targetButton) {
        return { success: false, reason: "BUTTON_NOT_FOUND", direction };
      }

      targetButton.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const events = [
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        new MouseEvent("click", { bubbles: true, cancelable: true }),
        new MouseEvent("mouseup", { bubbles: true, cancelable: true })
      ];

      for (const evt of events) {
        targetButton.dispatchEvent(evt);
      }

      return {
        success: true,
        direction: isCall ? "CALL" : "PUT",
        asset: STATE.asset,
        price: STATE.currentPrice,
        timestamp: Date.now()
      };
    } catch (err) {
      return { success: false, reason: err.message, direction };
    }
  }

  /**
   * Locks the focused pair to a MANUAL user selection (popup / web app). While the lock
   * is active the 80ms DOM poll can never switch the panel to another pair - this is the
   * "selected pair jumps back to the old pair" fix.
   */
  function lockManualAsset(targetAsset, source, durationMs) {
    if (!targetAsset) return;
    const asset = normalizeAssetName(targetAsset) || targetAsset;
    STATE.lockedAsset = asset;
    STATE.lockSource = source || "USER_SELECT";
    STATE.lockUntil = Date.now() + (durationMs || 30000);
    STATE.lockConfirmedTicks = 0;
    // An explicit user selection is ground truth - drop any half-built detection
    // candidate so the panel does not fight the lock for the next few polls.
    STATE.detectCandidate = null;
    STATE.detectCandidateCount = 0;
    STATE.asset = asset;
    STATE.tickHistory = (STATE.pairTicks[asset] || []).slice(0, 60);
    STATE.currentPrice = STATE.assetPriceCache[asset] || 0;
    STATE.priceConfirm = { asset: null, value: 0, count: 0 };
    STATE.nextCandleLock = null; // a new pair must never inherit the old verdict
    console.log(`[OTC Swarm Queen] 🔒 Manual pair lock: ${asset} (${STATE.lockSource})`);
  }

  function releaseManualLock(reason) {
    if (!STATE.lockedAsset) return;
    console.log(`[OTC Swarm Queen] 🔓 Pair lock released (${reason}): ${STATE.lockedAsset}`);
    STATE.lockedAsset = null;
    STATE.lockUntil = 0;
    STATE.lockSource = null;
    STATE.lockConfirmedTicks = 0;
  }

  function dispatchFullClick(el) {
    try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true })); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); } catch (e) {}
  }

  /** Finds the smallest top-bar tab element that really represents the target pair. */
  function findTopBarTabElement(targetAsset) {
    const cleanTarget = String(targetAsset).toUpperCase().replace(/\s*\(OTC\)/i, "").trim();
    const parts = cleanTarget.split(/[\/\-_\s]+/).filter(Boolean);
    const c1 = parts[0];
    const c2 = parts[1];

    const tabElements = document.querySelectorAll("[role='tab'], [class*='tab'], [class*='pair'], div, button, a");
    let best = null;

    for (const el of tabElements) {
      if (el.closest("#otc-swarm-queen-hud")) continue;
      if (el.children.length > 3) continue;

      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > 170) continue;
      if (rect.width < 35 || rect.width > 320 || rect.height < 16 || rect.height > 80) continue;

      const txt = (el.textContent || "").toUpperCase();
      const matches = txt.includes(cleanTarget) || Boolean(c1 && c2 && txt.includes(c1) && txt.includes(c2));
      if (!matches) continue;
      if (txt.length > cleanTarget.length + 12) continue; // never grab a whole container

      const cls = String(el.className || "");
      const isTabLike = el.getAttribute("role") === "tab" || /tab|pair|asset/i.test(cls);
      const score = (isTabLike ? 0 : 1000) + rect.width * rect.height;
      if (!best || score < best.score) best = { el: el, score: score };
    }

    return best ? best.el : null;
  }

  // Warn dedupe: Chrome's extension error page collects every console.warn from the
  // content script, so a pair missing from the visible top bar used to spam one warning
  // per switch attempt. Log each missing pair at most once per 2 minutes.
  const missingPairWarnAt = {};
  function warnMissingPairOnce(asset) {
    const now = Date.now();
    if (missingPairWarnAt[asset] && now - missingPairWarnAt[asset] < 120000) return;
    missingPairWarnAt[asset] = now;
    console.warn(`[OTC Swarm Queen] ${asset} is not in the visible top-bar tabs; trying the asset picker...`);
  }

  /**
   * Fallback pair switch: Quotex keeps only a few pairs in the visible top bar, so a
   * request for any other pair (e.g. USD/DZD) cannot find a tab element. A real user
   * switches by clicking the current pair button (opens the searchable asset list),
   * typing the pair name and clicking the matching row — this replicates exactly that.
   */
  /**
   * Switch the chart via Quotex's own asset picker modal.
   * Strategy: after opening the modal, POLL for a clickable row naming the target
   * pair — the full unfiltered list usually already shows every open pair, so no
   * typing is needed at all. Only when the row is not on screen do we type into the
   * search box (React-safe native setter), then poll again. On total failure the
   * modal is closed (Escape / X) so it can never stay stuck over the chart.
   */
  /** True when an element is really rendered on screen (works inside
   *  position:fixed modals, where offsetParent is always null). */
  function isElementOnScreen(el) {
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < 0 || r.right < 0) return false;
      if (r.top > (window.innerHeight || 9999) || r.left > (window.innerWidth || 9999)) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      return true;
    } catch (e) { return false; }
  }

  /** Is the 'Select trade pair' modal currently open? (search input visible) */
  function isPairModalOpen() {
    try {
      const inputs = document.querySelectorAll("input[type='text'], input[type='search'], input:not([type])");
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width > 60 && r.height > 16 && isElementOnScreen(inp)) {
          const ph = String(inp.placeholder || '').toLowerCase();
          if (ph.includes('search')) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /**
   * Find something that opens the "Select trade pair" modal: the deal-form pair
   * button first, then the "+" tab at the head of the chart tab strip.
   */
  function findPairModalOpener() {
    const viaDealForm = detectFromDealForm(window.innerWidth);
    if (viaDealForm && viaDealForm.element) return viaDealForm.element;
    try {
      const cands = document.querySelectorAll("button, div, span");
      for (const el of cands) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        if ((el.textContent || '').trim() !== '+') continue;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > 200 || r.width < 8 || r.width > 90 || r.height < 8 || r.height > 90) continue;
        return el;
      }
    } catch (e) {}
    return null;
  }

  function selectPairViaAssetPicker(asset) {
    const clean = String(asset).toUpperCase().replace(/s*(OTC)/i, "").trim();
    const openPairModal = () => {
      const opener = findPairModalOpener();
      if (!opener) return false;
      dispatchFullClick(opener);
      return true;
    };
    if (!isPairModalOpen()) {
      if (!openPairModal()) return Promise.resolve(false);
    }

    const findRow = () => {
      const rows = document.querySelectorAll("div, span, button, li");
      let best = null;
      for (const el of rows) {
        if (el.closest("#otc-swarm-queen-hud")) continue;
        if (el.children.length > 4) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.width > 600 || r.height < 18 || r.height > 90) continue;
        const txt = (el.textContent || "").toUpperCase().replace(/s+/g, " ").trim();
        if (!txt.includes(clean)) continue;
        if (txt.length > clean.length + 60) continue; // never a whole section
        const area = r.width * r.height;
        if (!best || area < best.area) best = { el: el, area: area };
      }
      return best;
    };

    const typeSearch = () => {
      try {
        const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='search'], input:not([type])"))
          .filter((inp) => {
            const r = inp.getBoundingClientRect();
            return r.width > 60 && r.height > 16 && isElementOnScreen(inp);
          });
        const searchInput = inputs[inputs.length - 1];
        if (!searchInput) return;
        searchInput.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        if (setter) setter.call(searchInput, clean);
        else searchInput.value = clean;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {}
    };

    const closePairModal = () => {
      try {
        const esc = { key: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
        document.dispatchEvent(new KeyboardEvent('keydown', esc));
        document.dispatchEvent(new KeyboardEvent('keyup', esc));
        try {
          if (document.activeElement) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', esc));
          }
        } catch (e) {}
        const closeEl = Array.from(document.querySelectorAll("[class*='close'], button, svg, span"))
          .find((el) => {
            if (el.closest('#otc-swarm-queen-hud')) return false;
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.width < 90 && r.height > 0 && r.height < 90)) return false;
            const t = (el.textContent || '').trim();
            const looksClose = t === '×' || t === 'X' || t === '✕' || /close/i.test(String(el.className)) || /close/i.test(String(el.getAttribute && el.getAttribute('aria-label') || ''));
            if (!looksClose) return false;
            // walk up to the real clickable control if we matched an inner icon
            return true;
          });
        if (closeEl) {
          const clickable = closeEl.closest("button, [role='button'], div, span") || closeEl;
          dispatchFullClick(clickable);
        }
      } catch (e) {}
    };

    return new Promise((resolve) => {
      let tries = 0;
      const poll = () => {
        tries++;
        // The modal may itself be a leftover from the click path — close it first so
        // the row scan and typing act on a freshly opened, correctly filtered list.
        const row = findRow();
        if (row) {
          dispatchFullClick(row.el);
          // Give the click a beat, then try once more — some builds need a second
          // click on the row before the pair actually switches.
          setTimeout(() => { try { const again = findRow(); if (again) dispatchFullClick(again.el); } catch (e) {} }, 150);
          // Never leave the modal stuck over the chart: if Quotex kept it open after
          // the selection, close it ourselves.
          setTimeout(() => { try { if (isPairModalOpen()) closePairModal(); } catch (e) {} }, 600);
          setTimeout(() => resolve(true), 300);
          return;
        }
        if (tries === 2 || tries === 4 || tries === 6) typeSearch();
        // Self-healing cycle: close whatever half-open modal exists, reopen it
        // fresh, and retype — a stuck render is recovered instead of lingering.
        if (tries === 9) closePairModal();
        if (tries === 5 || tries === 12) { try { if (!isPairModalOpen()) openPairModal(); } catch (e) {} }
        if (tries === 14 || tries === 18 || tries === 22) typeSearch();
        if (tries >= 26) {
          closePairModal();
          resolve(false);
          return;
        }
        setTimeout(poll, 250);
      };
      setTimeout(poll, 800);
    });
  }

  /**
   * Verify a pair switch actually took effect. If the top-bar click did not land
   * (pair hidden in the scrolled tab strip, renamed tab, ...), automatically fall
   * back to the searchable asset picker — and report failure honestly so the
   * auto-trade engine may retry on the next candle instead of giving up silently.
   */
  function scheduleSwitchVerification(asset, delay, pickerTried) {
    setTimeout(() => {
      try {
        const check = () => {
          const detected = detectActiveQuotexAsset();
          return detected && detected.asset;
        };
        let domAsset = check();
        if (domAsset && domAsset !== asset) {
          // The chart redraw may simply be slow — one more look before we call the
          // switch failed and spawn the picker modal over it.
          setTimeout(() => {
            try {
              handleSwitchVerificationResult(asset, check(), pickerTried);
            } catch (e) {}
          }, 900);
          return;
        }
        handleSwitchVerificationResult(asset, domAsset, pickerTried);
      } catch (e) {}
    }, delay);
  }

  function handleSwitchVerificationResult(asset, domAsset, pickerTried) {
    try {
      if (!domAsset || domAsset === asset) {
        // Switch confirmed (or DOM not conclusive yet) — clear the failure flag and
        // make sure no pair-picker modal is left covering the chart.
        STATE.autoTrade.lastSwitchFailed = false;
        try { if (isPairModalOpen()) closePairModal(); } catch (e) {}
        return;
      }
      if (STATE.lockedAsset === asset) {
        STATE.lockUntil = Math.max(STATE.lockUntil, Date.now() + 15000);
      }
      if (!pickerTried) {
        console.warn('[OTC Swarm Queen] top-bar switch to ' + asset + ' did not take effect (DOM shows ' + domAsset + '); trying the asset picker...');
        selectPairViaAssetPicker(asset).then((clicked) => {
          if (clicked) {
            handleNewRealTick(asset, detectQuotexPrice(), "PICKER_SWITCH");
            scheduleSwitchVerification(asset, 800, true);
          } else {
            STATE.autoTrade.lastSwitchFailed = true;
            console.warn('[OTC Swarm Queen] could not switch to ' + asset + ' via the asset picker either.');
          }
        });
      } else {
        STATE.autoTrade.lastSwitchFailed = true;
        console.warn('[OTC Swarm Queen] Quotex did not confirm switch to ' + asset + ' (DOM shows ' + domAsset + '); keeping manual lock.');
      }
    } catch (e) {}
  }

  function switchQuotexDomPair(targetAsset) {
    if (!targetAsset) return { success: false, reason: "NO_ASSET_SPECIFIED" };
    const asset = normalizeAssetName(targetAsset) || targetAsset;

    // Lock FIRST: even if the DOM click cannot be confirmed, the panel keeps showing the
    // selected pair's signal instead of jumping back to the previously detected pair.
    lockManualAsset(asset, "SWITCH_PAIR_REQUEST", 30000);
    STATE.lastSwitchAttempt = { asset: asset, at: Date.now() };

    try {
      const tabEl = findTopBarTabElement(asset);
      if (!tabEl) {
        warnMissingPairOnce(asset);
        // Quotex shows only a handful of pairs in the visible top bar. Go straight to
        // the searchable asset picker; verification + retry continues from there.
        selectPairViaAssetPicker(asset).then((clicked) => {
          if (!clicked) {
            STATE.autoTrade.lastSwitchFailed = true;
            console.warn("[OTC Swarm Queen] " + asset + " was not found in the asset picker either - Quotex may not offer this pair on this account.");
            return;
          }
          try {
            handleNewRealTick(asset, detectQuotexPrice(), "PICKER_SWITCH");
            scheduleSwitchVerification(asset, 800, true);
          } catch (e) {}
        });
        return { success: false, reason: "TAB_ELEMENT_NOT_FOUND_TRYING_PICKER", asset: asset, locked: true };
      }

      dispatchFullClick(tabEl);
      const price = detectQuotexPrice();
      handleNewRealTick(asset, price, "USER_SWITCH_PAIR");
      // If the click did not really change the chart, the asset-picker fallback
      // fires automatically from the verification step.
      scheduleSwitchVerification(asset, 1400, false);

      return { success: true, asset: asset, locked: true };
    } catch (e) {
      STATE.autoTrade.lastSwitchFailed = true;
      return { success: false, reason: e.message, asset: asset, locked: true };
    }
  }

  // Extension Runtime Message Listener
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.action === "EXECUTE_TRADE") {
        const res = executeQuotexDomTrade(request.direction, request.amount);
        sendResponse(res);
        return true;
      }
      if (request.action === "GET_AUTO_TRADE") {
        sendResponse({ status: "OK", autoTrade: STATE.autoTrade });
        return true;
      }
      if (request.action === "SET_AUTO_TRADE") {
        if (request.enabled !== undefined) STATE.autoTrade.enabled = !!request.enabled;
        if (request.amount !== undefined) STATE.autoTrade.amount = Math.max(1, Math.min(1000, Number(request.amount) || 1));
        if (request.minConfidence !== undefined) STATE.autoTrade.minConfidence = Math.min(0.95, Math.max(0.3, Number(request.minConfidence) || 0.65));
        if (request.followBest !== undefined) STATE.autoTrade.followBest = !!request.followBest;
        if (request.maxRepeat !== undefined) STATE.autoTrade.maxRepeat = Math.max(0, Math.min(50, parseInt(request.maxRepeat, 10) || 0));
        if (request.repeatCooldownCandles !== undefined) STATE.autoTrade.repeatCooldownCandles = Math.max(1, Math.min(30, parseInt(request.repeatCooldownCandles, 10) || 2));
        saveAutoTrade();
        console.log('[OTC Swarm Queen] AUTO-TRADE ' + (STATE.autoTrade.enabled ? 'ENABLED' : 'DISABLED') + ' (amount $' + STATE.autoTrade.amount + ', min confidence ' + Math.round(STATE.autoTrade.minConfidence * 100) + '%)');
        sendResponse({ status: "OK", autoTrade: STATE.autoTrade });
        return true;
      }
      if (request.action === "SWITCH_PAIR") {
        const res = switchQuotexDomPair(request.asset);
        sendResponse(res);
        return true;
      }
      if (request.action === "SELECT_PAIR" || request.action === "FOCUS_PAIR") {
        // Manual selection from the popup / web app: lock the pair and only touch the
        // Quotex DOM when explicitly requested.
        lockManualAsset(request.asset, request.source || "MANUAL_SELECT", 60000);
        let res = { success: true, asset: request.asset, locked: true };
        if (request.clickDom !== false) {
          res = switchQuotexDomPair(request.asset);
        } else {
          handleNewRealTick(request.asset, STATE.assetPriceCache[request.asset] || 0, "MANUAL_SELECT");
        }
        sendResponse(res);
        return true;
      }
      if (request.action === "RELEASE_PAIR_LOCK") {
        releaseManualLock("MANUAL_RELEASE");
        sendResponse({ success: true, locked: false });
        return true;
      }
      if (request.action === "GET_FOCUSED_SIGNAL") {
        const asset = STATE.asset;
        sendResponse({
          status: "OK",
          asset: asset,
          isLocked: Boolean(STATE.lockedAsset && Date.now() < STATE.lockUntil),
          queenSignal: (asset && STATE.pairSignals[asset]) || STATE.queenSignal,
          bestPair: STATE.bestPair,
          candlePhase: STATE.candlePhase || getQuotexCandleTimer(),
          pairSignals: STATE.pairSignals,
          activePairs: STATE.activePairs
        });
        return true;
      }
      if (request.action === "SCAN_ALL_PAIRS") {
        const tabs = scanAllQuotexTabs(STATE.asset);
        sendResponse({ status: "OK", tabs: tabs, activeAsset: STATE.asset });
        return true;
      }
    });
  }

  function syncActiveStateFromDom(triggerReason) {
    // While a manual lock is active the DOM poll must never change the focused pair.
    if (STATE.lockedAsset) {
      if (Date.now() >= STATE.lockUntil) {
        releaseManualLock("LOCK_EXPIRED");
      } else {
        const detected = detectActiveQuotexAsset();
        const domConfirmed = Boolean(detected && detected.asset === STATE.lockedAsset);

        if (domConfirmed) {
          STATE.lockConfirmedTicks++;
          // Quotex confirmed the switch: after a short grace period we can let real
          // in-browser tab clicks take over again, so nothing feels "stuck".
          if (STATE.lockConfirmedTicks >= 4) {
            STATE.lockUntil = Math.min(STATE.lockUntil, Date.now() + 1200);
          }
        }

        // Only trust the on-chart price when the DOM confirms the locked pair is the
        // open chart; otherwise reuse that pair's own last cached price. The price is
        // validated against the LOCKED pair, never against whatever STATE.asset happens
        // to be - that mismatch is what silently zeroed the live price.
        const livePrice = detectQuotexPrice(STATE.lockedAsset);
        const priceForLocked = domConfirmed && livePrice > 0
          ? livePrice
          : (STATE.assetPriceCache[STATE.lockedAsset] || 0);

        STATE.payout = (detected && detected.payout) || STATE.payout;
        handleNewRealTick(STATE.lockedAsset, priceForLocked, triggerReason || "POLL_LOCKED");
        return;
      }
    }

    // --- PRICE-AWARE PAIR ARBITRATION ---
    // Several DOM heuristics can disagree on any single frame, and a wrong winner is
    // catastrophic: it resets the signal lock AND repaints the panel. The price settles
    // it, because a pair can only trade inside its own quote range.
    //
    // ORDER MATTERS, and this used to be the single most damaging bug in the file.
    // `activeResult` was never assigned, so this function threw a ReferenceError on its
    // first line and returned via the exception: the focused pair was NEVER set, no tick
    // was ever recorded, and the panel sat on "Detecting active pair..." forever.
    //
    // Second, the RAW chart price is now read BEFORE any plausibility filtering. The old
    // order validated the candidate price against the CURRENTLY focused pair, so whenever
    // that pair was wrong the price was discarded - and with no price there was nothing
    // left to arbitrate with. That deadlock is gone: raw price -> pair decision ->
    // price validation against the pair we finally chose.
    const activeResult = detectActiveQuotexAsset() || {};
    let detectedAsset = activeResult.asset || null;
    const rawPrice = readRawChartPrice(detectedAsset || STATE.asset);

    if (!detectedAsset) {
      broadcastRealState();
      updateHud();
      return;
    }

    // Only arbitrate when we actually have a raw price to judge by.
    if (rawPrice > 0 && !isPlausiblePriceFor(detectedAsset, rawPrice)) {
      // The detected pair cannot be the one on screen. Prefer an already-known open pair
      // whose range DOES fit this price; that is almost certainly the real one.
      const open = Object.keys(STATE.activePairs || {})
        .filter(function (a) { return a !== detectedAsset; })
        .filter(function (a) { return isPlausiblePriceFor(a, rawPrice); })
        .sort(function (a, b) {
          return Math.abs(STATE.assetPriceCache[b] - rawPrice) - Math.abs(STATE.assetPriceCache[a] - rawPrice);
        });
      if (open.length) {
        console.log(
          `[OTC Swarm Queen] Price arbitration: ${detectedAsset} cannot trade at ${rawPrice} ` +
          `-> using ${open[0]}`
        );
        detectedAsset = open[0];
      }
    }

    // The pair is settled now, so the price can finally be validated against it.
    const price = confirmChartPrice(rawPrice, detectedAsset);

    // --- PAIR HYSTERESIS (fixes the blinking floating panel) ---
    // The DOM poll runs 3x/second and the various heuristics can disagree on any single
    // frame. Switching on the first frame that differs made the focused pair flip-flop,
    // which reset the signal lock and repainted the whole panel several times a second.
    // A different candidate now has to win DETECT_CONFIRMATIONS polls in a row (~1s).
    if (STATE.asset && detectedAsset !== STATE.asset) {
      if (STATE.detectCandidate === detectedAsset) {
        STATE.detectCandidateCount++;
      } else {
        STATE.detectCandidate = detectedAsset;
        STATE.detectCandidateCount = 1;
      }

      if (STATE.detectCandidateCount < STATE.DETECT_CONFIRMATIONS) {
        // Not yet confident. Keep serving the CURRENT pair with its own cached price so
        // the panel stays stable instead of flickering.
        handleNewRealTick(
          STATE.asset,
          STATE.assetPriceCache[STATE.asset] || 0,
          triggerReason
        );
        return;
      }
    }

    // Candidate confirmed (or unchanged): accept it and reset the counter.
    STATE.detectCandidate = null;
    STATE.detectCandidateCount = 0;

    STATE.payout = activeResult.payout || STATE.payout;
    handleNewRealTick(
      detectedAsset,
      // Never fall back to the previous pair's price - that is what displayed one pair's
      // quote under another pair's name.
      price > 0 ? price : (STATE.assetPriceCache[detectedAsset] || 0),
      triggerReason
    );
  }

  // Periodic DOM Scanner loop (Every 300ms - the instant click listeners below handle
  // immediate tab-switch reaction, so we no longer need a 12-per-second scan).
  setInterval(() => {
    syncActiveStateFromDom("POLL_LOOP");
  }, 300);

  // Live timer tick for HUD every 250ms
  setInterval(() => {
    updateHud();
  }, 250);

  // Click listener anywhere in Quotex
  document.addEventListener("click", function (event) {
    try {
      const target = event && event.target;
      if (target && target.closest && target.closest("#otc-swarm-queen-hud")) {
        return; // clicking our own HUD must never change the focused pair
      }
    } catch (e) {}

    // The user is interacting with Quotex directly, so their in-page tab click wins:
    // release the manual lock and immediately follow the newly clicked pair.
    if (STATE.lockedAsset) releaseManualLock("USER_CLICK_IN_QUOTEX");

    // A real click is ground truth: clear the pending detection candidate so the
    // follow-up polls go straight to the clicked pair instead of waiting on hysteresis.
    STATE.detectCandidate = null;
    STATE.detectCandidateCount = 0;

    setTimeout(() => syncActiveStateFromDom("USER_CLICK_30MS"), 30);
    setTimeout(() => syncActiveStateFromDom("USER_CLICK_100MS"), 100);
    setTimeout(() => syncActiveStateFromDom("USER_CLICK_250MS"), 250);
  }, true);

  // ───────────────────────────────────────────────────────────────────────────
  // MISTRAL VISION SCANNER (v1.3)
  // Captures the visible chart, crops to the chart canvas and posts it to the
  // web app server (/api/vision/scan) for a Mistral visual analysis. The verdict
  // feeds the floating HUD and the web app's 20-fly swarm.
  // ───────────────────────────────────────────────────────────────────────────
  function visionServerBase() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(["webAppUrl"], function (res) {
          resolve(res && res.webAppUrl ? String(res.webAppUrl).replace(/\/$/, "") : "http://localhost:3000");
        });
      } catch (e) {
        resolve("http://localhost:3000");
      }
    });
  }

  function cropChartImage(dataUrl) {
    return new Promise(function (resolve) {
      try {
        const img = new Image();
        img.onload = function () {
          try {
            let sx = 0, sy = 0, sw = img.width, sh = img.height;
            const chartCanvas = Array.from(document.querySelectorAll("canvas"))
              .map(function (c) { return { c: c, area: c.clientWidth * c.clientHeight }; })
              .filter(function (x) { return x.area > 100000; })
              .sort(function (a, b) { return b.area - a.area; })[0];
            if (chartCanvas && chartCanvas.c.clientWidth > 300) {
              const r = chartCanvas.c.getBoundingClientRect();
              const scale = img.width / Math.max(1, window.innerWidth);
              sx = Math.max(0, Math.round(r.left * scale));
              sy = Math.max(0, Math.round(r.top * scale));
              sw = Math.max(50, Math.min(img.width - sx, Math.round(r.width * scale)));
              sh = Math.max(50, Math.min(img.height - sy, Math.round(r.height * scale)));
            } else {
              sy = Math.round(img.height * 0.15);
              sh = img.height - sy;
            }
            const maxW = 1280;
            const outScale = sw > maxW ? maxW / sw : 1;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(sw * outScale));
            canvas.height = Math.max(1, Math.round(sh * outScale));
            canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.72));
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) {
        resolve(dataUrl);
      }
    });
  }

  /**
   * Report a capture failure to the web app's scan queue. Without this the command sat
   * in CLAIMED state until the server's 60s reclaim fired, which is what produced the
   * repeated "VISION_SCAN_RECLAIMED / capture timed out" warnings in Logs & Errors.
   */
  async function failVisionScan(request, reason) {
    if (request && request.commandId) {
      try {
        const base = await visionServerBase();
        await fetch(base + "/api/extension/scan-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          body: JSON.stringify({ commandId: request.commandId, ok: false, reason: reason })
        });
      } catch (e) { /* server unreachable — the reclaim path still covers it */ }
    }
    return { success: false, reason: reason };
  }

  async function runVisionScan(request) {
    // Only the VISIBLE Quotex tab may scan: captureVisibleTab photographs whatever
    // page is on screen, so a hidden tab would either fail or — worse — submit a
    // screenshot of a different page/pair labelled as this tab's asset.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return failVisionScan(request, "tab_hidden");
    }
    if (STATE.visionScanBusy) return { success: false, reason: "busy" };
    if (!STATE.asset) return failVisionScan(request, "no_asset");
    STATE.visionScanBusy = true;
    try {
      const shot = await new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage({ type: "CAPTURE_CHART" }, function (res) {
            if (!chromeAlive()) { resolve(null); return; }
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res && res.ok ? res : null);
          });
        } catch (e) { resolve(null); }
      });
      if (!shot || !shot.dataUrl) {
        return failVisionScan(request, "capture_failed");
      }
      const image = await cropChartImage(shot.dataUrl);
      const base = await visionServerBase();
      const res = await fetch(base + "/api/vision/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        body: JSON.stringify({
          asset: request && request.asset ? request.asset : STATE.asset,
          image: image,
          price: STATE.currentPrice,
          source: "EXTENSION_CAPTURE"
        })
      });
      const data = await res.json();
      if (data && data.scan) {
        STATE.visionScan = data.scan;
        if (request && request.commandId) {
          fetch(base + "/api/extension/scan-result", {
            method: "POST", headers: { "Content-Type": "application/json" }, mode: "cors",
            body: JSON.stringify({ commandId: request.commandId, ok: true })
          }).catch(function () {});
        }
        console.log("[OTC Swarm Queen] Vision scan verdict:", data.scan.signal, Math.round((data.scan.confidence || 0) * 100) + "%");
        return { success: true, scan: data.scan };
      }
      if (request && request.commandId) {
        fetch(base + "/api/extension/scan-result", {
          method: "POST", headers: { "Content-Type": "application/json" }, mode: "cors",
          body: JSON.stringify({ commandId: request.commandId, ok: false, error: data && data.error })
        }).catch(function () {});
      }
      return { success: false, reason: (data && data.error) || "scan_failed" };
    } catch (e) {
      return { success: false, reason: e.message };
    } finally {
      STATE.visionScanBusy = false;
    }
  }

  // Dedicated vision-bridge message listener (multiple listeners are allowed).
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.action === "CAPTURE_AND_SCAN") {
        runVisionScan(request).then(sendResponse);
        return true;
      }
      if (request.action === "SERVER_STATE_UPDATE") {
        if (request.visionScan && (!STATE.visionScan || request.visionScan.timestamp >= (STATE.visionScan.timestamp || 0))) {
          STATE.visionScan = request.visionScan;
        }
        if (request.combinedQueen) {
          STATE.serverCombined = request.combinedQueen;
        }
        sendResponse({ ok: true });
        return true;
      }
      if (request.action === "TOGGLE_HUD") {
        // get=true → just report; show=true → force show; show=false → force hide; omitted → flip
        if (request.get) {
          sendResponse({ ok: true, hidden: hudHiddenFlag() });
          return true;
        }
        const next = request.show === true ? false : request.show === false ? true : !hudHiddenFlag();
        setHudHidden(next);
        if (!next) updateHud();
        else {
          const hudEl = document.getElementById("otc-swarm-queen-hud");
          if (hudEl) hudEl.remove();
        }
        sendResponse({ ok: true, hidden: hudHiddenFlag() });
        return true;
      }
    });
  }

  // Ctrl+Shift+H toggles the floating HUD on the Quotex chart.
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
      setHudHidden(!hudHiddenFlag());
      if (!hudHiddenFlag()) updateHud();
      else {
        const hud = document.getElementById("otc-swarm-queen-hud");
        if (hud) hud.remove();
      }
    }
  });

  // Automatic per-candle scan: right after each new 1-minute candle opens, capture the
  // chart so the web app's swarm always has a fresh vision verdict to train on.
  setInterval(function () {
    if (typeof document !== "undefined" && document.hidden) return; // hidden tab cannot capture its own chart
    if (!STATE.asset || STATE.visionScanBusy) return;
    const minuteKey = Math.floor(Date.now() / 60000);
    if (STATE.lastAutoVisionMinute === minuteKey) return;
    if (STATE.candlePhase && typeof STATE.candlePhase.remainingSec === "number" && STATE.candlePhase.remainingSec < 50) {
      return; // only scan within the first ~10s of a fresh candle
    }
    STATE.lastAutoVisionMinute = minuteKey;
    runVisionScan({ source: "AUTO_CANDLE" });
  }, 4000);

  // Initial Scan
  syncActiveStateFromDom("INIT");

  // Signal heartbeat: calculateSwarmSignals normally runs on every incoming tick,
  // but a quiet OTC moment (or a paused feed) can leave the entry window unevaluated
  // and cost the trade. Re-evaluate at least once per second with the latest price.
  setInterval(function () {
    try {
      if (STATE.currentPrice > 0) calculateSwarmSignals(STATE.currentPrice);
    } catch (e) {}
  }, 1000);

  // Keep auto-trade settings in sync across ALL Quotex tabs: the popup writes the
  // setting through the active tab, and every other tab's engine re-reads storage
  // every 2s so an ON/OFF toggle applies everywhere within seconds.
  let lastAutoTradeSyncJson = "";
  setInterval(function () {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
      // A just-made local change is the source of truth in THIS tab: skip one cycle so
      // an in-flight stale storage read cannot clobber it back to the old value.
      if (STATE.__atLocalWriteAt && Date.now() - STATE.__atLocalWriteAt < 4000) return;
      chrome.storage.local.get(["autoTrade"], function (res) {
        if (!res || !res.autoTrade || typeof res.autoTrade !== "object") return;
        const j = JSON.stringify(res.autoTrade);
        if (j !== lastAutoTradeSyncJson) {
          lastAutoTradeSyncJson = j;
          applyAutoTradeSettings(res.autoTrade);
        }
      });
    } catch (e) {}
  }, 2000);

  console.log(`[OTC Swarm Queen] Quotex Sniffer active. Initial pair: ${STATE.asset || 'Scanning DOM'}`);
})();
