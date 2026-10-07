// Behaviour smoke test: extracts the REAL engine from the shipped content.js and checks
// the round-number math, the warming-up state and the signal decisions.
//   Run: node scripts/engine-smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "extension/dist/content.js"), "utf8");

function grab(a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error("marker not found: " + a);
  return src.slice(i, j);
}

const quant = grab("  function emaOf(series, period) {", "  /**\n   * Picks the strongest CALL/PUT");
const smcSrc = grab("  function analyzeSMC(rawCandles) {", "  function calculateSwarmSignals");
const calc = grab("  function calculateSwarmSignals(price) {", "  function handleNewRealTick");
const roundSrc = grab("  function calculateOptimalRoundNumber(price, asset, direction) {", "\n  /**");

// Pull the REAL quote-range table out of the shipped file so this test can never
// drift away from what the extension actually enforces.
const rangeStart = src.indexOf("const QUOTE_CURRENCY_RANGE = {");
const rangeBody = src.indexOf("{", rangeStart);
const rangeEnd = src.indexOf("\n  };", rangeBody) + 4;
const RANGES = new Function(
  "return (" + src.slice(rangeBody, rangeEnd) + ")"
)();

const evalRound = new Function(
  "price", "asset", "direction",
  roundSrc + "\nreturn calculateOptimalRoundNumber(price, asset, direction);"
);

const STATE = {
  asset: "T/P (OTC)", pairTicks: { "T/P (OTC)": [] }, pairSignals: {}, activePairs: {},
  candlesHistory: [], candlePhase: null, signalCandleKey: 0, signalLockedDirection: null,
  announcedSignals: {}, lastToastAt: 0, bestPair: null, noSetupPair: null, assetPriceCache: {},
  workers: Array.from({ length: 24 }, (_, i) => ({ id: i + 1, weight: 0.85 }))
};
let phase = 0;
// NOTE: `calc` already contains the complete `function calculateSwarmSignals(...) {...}`
// declaration, so it must be concatenated as-is - wrapping it in another declaration
// would nest (and shadow) the real function.
const engine = new Function("o", `
  const STATE = o.S;
  function getQuotexCandleTimer(){ return o.timer(); }
  function calculateOptimalRoundNumber(p,a,d){ return o.round(p,a,d); }
  function announceSignal(){} function updateBestPairSignal(){ return null; }
${smcSrc}
${quant}
${calc}
  return calculateSwarmSignals;`)({
  S: STATE,
  timer: () => ({ remainingSec: 45, totalSec: 60, candleKey: ++phase,
                  timeFormatted: "00:45s", isEntryZone: false, startAt: 0, closeAt: 0 }),
  round: (p, a, d) => evalRound(p, a, d)
});

let pass = 0, fail = 0;
const check = (n, c, x) => {
  if (c) { pass++; console.log("  PASS  " + n + (x ? "  [" + x + "]" : "")); }
  else { fail++; console.log("  FAIL  " + n + (x ? "  [" + x + "]" : "")); }
};
const mul = (seed) => function () {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
function series(base, tick, n, drift, rnd) {
  const o = new Array(n); let p = base;
  for (let i = n - 1; i >= 0; i--) { o[i] = p; p = p + drift + (rnd() - 0.5) * tick; }
  return o;
}
function load(s) {
  const old = s.slice().reverse();
  STATE.candlesHistory = old.map((c, i) => ({
    time: 1700000000000 + i * 60000, open: c, high: c, low: c, close: c, volume: 100
  }));
  return s[0];
}
const fresh = (k) => { phase = k; STATE.signalCandleKey = 0; STATE.signalLockedDirection = null; };

console.log("Round numbers must follow each pair's own quote precision:");
{
  const r1 = evalRound(0.59151, "EUR/GBP", "HOLD");
  check("EUR/GBP 0.59151 keeps 5 decimals", /0\.\d{5}$/.test(r1.optimalRound), r1.optimalRound + " (" + r1.pipsDiff + " pips)");
  const r2 = evalRound(17864.52, "USD/IDR", "HOLD");
  check("USD/IDR 17864.52 keeps 2 decimals", /^178\d\d\.\d{2}$/.test(r2.optimalRound), r2.optimalRound + " (" + r2.pipsDiff + " pips)");
  const r3 = evalRound(19.93257, "USD/MXN", "HOLD");
  check("USD/MXN 19.93257 keeps 5 decimals", /^19\.\d{5}$/.test(r3.optimalRound), r3.optimalRound + " (" + r3.pipsDiff + " pips)");
  check("no price -> '--', not '0.0000'", evalRound(0, "NONE", "HOLD").optimalRound === "--");
}

console.log("\nQuote-range prior (a pair can only trade inside its own range):");
{
  const ev = new Function("known, range", `
    const QUOTE_CURRENCY_RANGE = known, GENERIC_RANGE = [0.0001, 100000];
    function isPlausiblePriceFor(asset, price) {
      if (!asset || !(price > 0)) return false;
      const quote = String(asset).slice(4, 7);
      const r = QUOTE_CURRENCY_RANGE[quote] || GENERIC_RANGE;
      return price >= r[0] / 3 && price <= r[1] * 3;
    }
    return isPlausiblePriceFor;`)(RANGES);

  check("USD/MXN accepts 19.93257", ev("USD/MXN (OTC)", 19.93257));
  check("USD/MXN rejects 17864.52", !ev("USD/MXN (OTC)", 17864.52));
  check("USD/IDR accepts 17864.52", ev("USD/IDR (OTC)", 17864.52));
  check("USD/IDR rejects 1.21495", !ev("USD/IDR (OTC)", 1.21495));
  check("USD/BRL accepts 5.42", ev("USD/BRL (OTC)", 5.42));
  check("USD/BRL rejects 17864.52", !ev("USD/BRL (OTC)", 17864.52));
  check("EUR/GBP accepts 0.59151", ev("EUR/GBP (OTC)", 0.59151));
  check("EUR/GBP rejects 19.93", !ev("EUR/GBP (OTC)", 19.93));
  check("USD/JPY accepts 149.30", ev("USD/JPY (OTC)", 149.30));
}

console.log("\nPrice-axis LADDER detection (no prior price needed - no deadlock):");
{
  // The old axis fallback required an already-known price, so a miss left the panel
  // stuck on "GATHERING DATA" forever. A ladder is self-identifying.
  const detect = new Function("nums", `
    const cols = [];
    for (const n of nums) {
      const col = cols.find(function (c) { return Math.abs(c.x - n.x) < 24; });
      if (col) { col.items.push(n); col.x = (col.x + n.x) / 2; }
      else cols.push({ x: n.x, items: [n] });
    }
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
    if (!ladders.length) return 0;
    const sorted = ladders[0].slice().sort(function (a, b) { return a.v - b.v; });
    return sorted[sorted.length - 1].v;`);

  // A real USD/MXN axis: evenly spaced 20-tick levels.
  const axis = [
    { v: 19.93140, x: 1650, y: 540 }, { v: 19.93160, x: 1650, y: 480 },
    { v: 19.93180, x: 1650, y: 420 }, { v: 19.93200, x: 1650, y: 360 },
    { v: 19.93220, x: 1650, y: 300 }
  ];
  check("ladder found with NO known price", detect(axis) === 19.93220, String(detect(axis)));

  // Page furniture (unrelated numbers) must be rejected.
  const junk = [
    { v: 3.86, x: 1800, y: 400 }, { v: 255.92, x: 1800, y: 300 },
    { v: 93, x: 1800, y: 200 }, { v: 7, x: 1800, y: 100 }
  ];
  check("random page numbers rejected", detect(junk) === 0, String(detect(junk)));
}

console.log("\nWarming up must NOT masquerade as a HOLD verdict:");
{
  fresh(10);
  STATE.candlesHistory = [];
  STATE.assetPriceCache = {};
  STATE.pairTicks = { "T/P (OTC)": [] };
  engine(0);
  const q = STATE.queenSignal;
  check("status = WARMING_UP", q.status === "WARMING_UP", q.status);
  check("warmingUp flag set", q.warmingUp === true, String(q.warmingUp));
  check("confidence = 0 (not a fake 50%)", q.confidence === 0, String(q.confidence));
  check("power = 0 (not a fake reading)", q.power === 0, String(q.power));
}

console.log("\nA real trend still produces a directional signal:");
{
  fresh(20);
  engine(load(series(1.1650, 0.00030, 30, 0.00040, mul(42))));
  const q = STATE.queenSignal;
  check("direction = CALL", q.direction === "CALL", q.direction);
  check("not warming up", q.warmingUp === false);
  // 24 lenses now (20 statistical + 4 SMC); trap lenses abstain in a clean trend, so
  // the normalized power floor sits a bit lower than the old 20-lens engine.
  check("real power", q.power >= 0.35, Math.round(q.power * 100) + "%");
  check("votes honest (sum = flies)", q.upVotes + q.downVotes + q.holdVotes === 24,
        "u" + q.upVotes + "/d" + q.downVotes + "/h" + q.holdVotes);
}

console.log("\nA dead-flat range is a REAL hold (we do have data):");
{
  fresh(30);
  engine(load(series(0.8540, 0.00008, 30, 0, mul(3))));
  const q = STATE.queenSignal;
  check("direction = HOLD", q.direction === "HOLD", q.direction);
  check("not warming up", q.warmingUp === false);
  check("status = real verdict", q.status === "SAFE_HOLD_NEUTRAL_MARKET", q.status);
}

// ============================================================================
// REGRESSION SUITE for the "no signal / no open pairs" outage.
// Each test maps to a specific bug that shipped and left the HUD stuck on
// "Detecting active pair...". They exercise the REAL shipped functions.
// ============================================================================

console.log("\n--- Polling pipeline integrity (the outage root causes) ---");
{
  // BUG 1: `activeResult` was READ but never ASSIGNED. The ReferenceError fired on the
  // first line of the 300ms poll, so the focused pair was never set and no tick was ever
  // recorded - the panel sat on "Detecting active pair..." forever.
  check("activeResult is assigned from detectActiveQuotexAsset()",
        /const\s+activeResult\s*=\s*detectActiveQuotexAsset\(\)/.test(src));
  check("no bare undeclared 'activeResult &&' read remains",
        !/[^.\w]activeResult\s*&&/.test(src));

  // BUG 2 (the deadlock): the raw price must be read BEFORE the plausibility filter.
  // Otherwise a wrong focused pair discards the price, and pair arbitration - which
  // needs that price - can never run to correct it.
  const sync = src.slice(src.indexOf("function syncActiveStateFromDom"));
  const rawAt = sync.indexOf("readRawChartPrice(");
  const confirmAt = sync.indexOf("confirmChartPrice(");
  const arbitrateAt = sync.indexOf("isPlausiblePriceFor(detectedAsset, rawPrice)");
  check("raw price is read before it is validated", rawAt > 0 && confirmAt > rawAt,
        "raw@" + rawAt + " confirm@" + confirmAt);
  check("arbitration sits between reading and validating",
        arbitrateAt > rawAt && arbitrateAt < confirmAt);
}

console.log("\n--- confirmChartPrice gates ---");
{
  const confirmSrc = grab("  function confirmChartPrice(value, asset) {", "\n  /**");
  // confirmChartPrice calls the real plausibility check, so extract that too rather than
  // stubbing it - otherwise this test would pass even if the range prior broke.
  const rangeStart = src.indexOf("  function isPlausiblePriceFor(asset, price) {");
  const plausibilitySrc = src.slice(rangeStart, src.indexOf("  /**", rangeStart));
  const S = { priceConfirm: { asset: null, value: 0, count: 0 },
              assetPriceCache: {}, PRICE_CONFIRMATIONS: 2, PRICE_MAX_JUMP: 0.25,
              asset: "USD/MXN (OTC)" };
  const confirm = new Function("STATE", "QUOTE_CURRENCY_RANGE", "GENERIC_RANGE",
    plausibilitySrc + confirmSrc + "\nreturn confirmChartPrice;")(S, RANGES, [0.0001, 100000]);

  // With no pair supplied there is no range filter, so the value survives the gate on
  // the SECOND confirming read (the gate is pair-independent, by design).
  const raw1 = confirm(17864.52, null);
  const raw2 = confirm(17864.52, null);
  check("no range filter when no pair is supplied", raw1 === 0 && raw2 === 17864.52,
        raw1 + " then " + raw2);
  check("implausible price for its pair is rejected",
        confirm(17864.52, "USD/BRL (OTC)") === 0);
  check("first read is held back by the confirmation gate",
        confirm(19.9332, "USD/MXN (OTC)") === 0);
  check("second agreeing read is accepted",
        confirm(19.9332, "USD/MXN (OTC)") === 19.9332);

  S.assetPriceCache["USD/MXN (OTC)"] = 19.9332;
  S.priceConfirm = { asset: "USD/MXN (OTC)", value: 19.9332, count: 5 };
  check("25%+ jump on a trusted pair is rejected", confirm(99.5, "USD/MXN (OTC)") === 0);

  // The regression that mattered: a WRONG focused pair must not veto a valid chart price.
  S.assetPriceCache = {}; S.priceConfirm = { asset: null, value: 0, count: 0 };
  S.asset = "AUD/CHF (OTC)";
  const first = confirm(19.9332, "USD/MXN (OTC)");
  const second = confirm(19.9332, "USD/MXN (OTC)");
  check("valid USD/MXN price survives a wrong focused pair",
        first === 0 && second === 19.9332, first + " then " + second);
}

console.log("\n--- Open-pair discovery (the 'pairs are not shown' bug) ---");
{
  // BUG 3: the scanner's hard-coded window (top<=140, left>=50, width<=250) did not match
  // the real Quotex tab strip, so EVERY open pair was filtered out and the panel reported
  // "Scanning Open Tabs..." forever. These are realistic tab-strip rectangles.
  const scanSrc = grab("  function scanAllQuotexTabs(resolvedActiveAsset) {", "\n  /**");
  const el = (text, left, top, width, height) => ({
    textContent: text, children: [], className: "", closest: () => null,
    getBoundingClientRect: () => ({ left, top, width, height,
                                    right: left + width, bottom: top + height })
  });
  const S = { asset: "AUD/CHF (OTC)", pairTicks: {}, assetPriceCache: {}, pairSignals: {},
              pairCandles: {}, candlesHistory: [], candlePhase: null, payout: 0.85 };
  const strip = () => ([
    el("EUR/USD (OTC) 92%", 8, 178, 180, 40),
    el("AUD/NZD (OTC) 86%", 200, 178, 180, 40),
    el("USD/MXN (OTC) 92%", 392, 178, 180, 40),
    el("AUD/CHF (OTC) 92%", 584, 178, 180, 40),
    el("USD/IDR (OTC) 92%", 776, 178, 180, 40),
    el("EUR/GBP (OTC) 86%", 968, 178, 180, 40)
  ]);
  const fakeNormalize = (raw) => {
    const m = String(raw).match(/([A-Z]{3})\s*\/\s*([A-Z]{3})/);
    return m ? m[1] + "/" + m[2] + " (OTC)" : null;
  };
  const fakeSignal = (asset) => ({ asset, direction: "HOLD", status: "AWAITING_LIVE_TICKS" });
  const build = (body) => new Function("document", "window", "STATE", "normalizeAssetName",
    "generatePairQueenSignal", "announceSignal", body + "\nreturn scanAllQuotexTabs;")(
    { querySelectorAll: strip }, { innerWidth: 1400, innerHeight: 900 }, S,
    fakeNormalize, fakeSignal, () => {});

  const scan = build(scanSrc);
  const tabs = scan("AUD/CHF (OTC)");
  check("all 6 open pairs are discovered", tabs.length === 6, tabs.length + " found");
  check("payout parsed from the tab", tabs[0] && tabs[0].payoutPct === 92,
        tabs[0] && String(tabs[0].payoutPct));
  check("the active pair is flagged", tabs.some(t => t.isActive));
  check("left-most tab is no longer cut off",
        tabs[0] && tabs[0].asset === "EUR/USD (OTC)", tabs[0] && tabs[0].asset);

  // Re-run with the OLD bounds restored. This proves the bug was real rather than
  // theoretical: the identical strip yields nothing under the previous window.
  const oldScan = build(scanSrc
    .replace("rect.top > 260", "rect.top > 140")
    .replace("rect.left < 4 ||", "rect.left < 50 ||")
    .replace("rect.width < 40 || rect.width > 320", "rect.width < 45 || rect.width > 250")
    .replace("const rightBoundary = windowWidth - 40;", "const rightBoundary = windowWidth - 250;"));
  check("the previous bounds found 0 pairs (proves the bug)", oldScan(null).length === 0,
        oldScan(null).length + " found");
}
{
  const hookSrc = fs.readFileSync(path.join(root, "extension/dist/injected_ws_hook.js"), "utf8");
  // NOTE: the trailing `()` is required - new Function returns the wrapper, so an extra
  // call is what actually yields toNumber.
  const toNumber = new Function(
    hookSrc.slice(hookSrc.indexOf("  function toNumber(v) {"),
                  hookSrc.indexOf("  function parseCandlesList")) + "\nreturn toNumber;"
  )();
  check("dot decimal still parses", toNumber("19.93325") === 19.93325);
  check("comma decimal parses", toNumber("19,93325") === 19.93325, String(toNumber("19,93325")));
  check("bare comma decimal parses", Math.abs(toNumber(",93325") - 0.93325) < 1e-9);
  check("thousands separators dropped", toNumber("17,864.52") === 17864.52);
  check("European format parsed", toNumber("1.234,56") === 1234.56);
  check("numeric input passes through", toNumber(19.93325) === 19.93325);
  check("garbage yields 0, never NaN", toNumber("abc") === 0 && toNumber(null) === 0);
  check("empty string yields 0", toNumber("") === 0);
}

console.log("\n--- Raw WebSocket frame quote extraction ---");
{
  // The raw-frame scanner used a dot-only regex, so comma-decimal frames were dropped
  // entirely - another way the live price could disappear.
  check("raw-frame scanner accepts comma decimals",
        src.includes("event.data.text.match(/\\d+[.,]\\d{1,6}/g)"));
  check("raw-frame scanner normalises the tally key",
        /const key = v\.toFixed\(6\)/.test(src));
}

console.log("\n--- HUD stability (no subtree replacement) ---");
{
  const hudSrc = src.slice(src.indexOf("function updateHud()"));
  const shellWrites = (hudSrc.match(/hud\.innerHTML\s*=\s*HUD_SHELL/g) || []).length;
  check("HUD shell is written at most twice (scan state + first build)",
        shellWrites <= 2, shellWrites + " write(s)");
  check("every innerHTML write is guarded by __sqShellBuilt",
        /if \(!hud\.__sqShellBuilt\)/.test(hudSrc) && shellWrites === 2);
  check("tick counter is patched, not rebuilt",
        /const tf = hud\.querySelector\("#sq-footTicks"\)/.test(hudSrc));
  // Scope the check to the signature ARRAY literal only: further down the function there
  // is a legitimate STATE.tickCount read used to patch the counter in place.
  const sigBlock = hudSrc.slice(hudSrc.indexOf("const hudSignature = ["));
  const sigArray = sigBlock.slice(0, sigBlock.indexOf("].join"));
  check("repaint signature excludes tickCount", !/STATE\.tickCount/.test(sigArray));
  check("repaint signature includes price + candle countdown",
        /STATE\.currentPrice/.test(sigArray) && /timer\.remainingSec/.test(sigArray));
}

console.log(`\n===== ${pass} passed, ${fail} failed =====\n`);
process.exit(fail ? 1 : 0);

