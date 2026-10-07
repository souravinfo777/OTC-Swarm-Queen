const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function insertBefore(anchor, block) {
  const i = s.indexOf(anchor);
  if (i === -1) throw new Error('anchor not found: ' + anchor.slice(0, 60));
  s = s.slice(0, i) + block + s.slice(i);
}

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 60));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// ── 1. analyzeSMC: full SMC confluence on the real M1 candles ────────────────
const smcModule = [
"  /**",
"   * SMC CONFLUENCE ENGINE (in-extension, zero look-ahead):",
"   * Runs on the pair's REAL M1 candles (fully closed ones only) and returns four",
"   * directional sub-scores consumed by swarm lenses 21-24:",
"   *   structure - market structure: swing trend, BOS, CHoCH",
"   *   sweep     - liquidity: equal highs/lows pools + stop-run sweep + rejection",
"   *   zone      - order blocks + fair value gaps (freshness-weighted, proximity boost)",
"   *   reaction  - candle reaction: pin bars, engulfing, rejection wicks",
"   * bullScore/bearScore are the raw confluence weights; score is the 0-100 readout.",
"   */",
"  function analyzeSMC(rawCandles) {",
"    const empty = { structure: 0, sweep: 0, zone: 0, reaction: 0, bullScore: 0, bearScore: 0, score: 50, evidence: [] };",
"    const candles = (rawCandles || [])",
"      .filter((c) => c && c.close > 0 && c.high >= c.low && c.open > 0)",
"      .slice()",
"      .sort((a, b) => (a.time || 0) - (b.time || 0));",
"    // Drop the still-forming candle: every SMC judgement is made on CLOSED data.",
"    const curMinute = Math.floor(Date.now() / 60000);",
"    if (candles.length && Math.floor((candles[candles.length - 1].time || 0) / 60000) === curMinute) candles.pop();",
"    if (candles.length < 12) return empty;",
"",
"    const evidence = [];",
"    let bullScore = 0;",
"    let bearScore = 0;",
"",
"    // 1. MARKET STRUCTURE: swings, trend, BOS, CHoCH",
"    const W = 2;",
"    const swings = [];",
"    for (let i = W; i < candles.length - W; i++) {",
"      let isH = true, isL = true;",
"      for (let w = 1; w <= W; w++) {",
"        if (candles[i - w].high >= candles[i].high || candles[i + w].high > candles[i].high) isH = false;",
"        if (candles[i - w].low <= candles[i].low || candles[i + w].low < candles[i].low) isL = false;",
"      }",
"      if (isH) swings.push({ price: candles[i].high, type: 'H' });",
"      else if (isL) swings.push({ price: candles[i].low, type: 'L' });",
"    }",
"    const sh = swings.filter((x) => x.type === 'H');",
"    const sl = swings.filter((x) => x.type === 'L');",
"    let structure = 0;",
"    if (sh.length >= 2 && sl.length >= 2) {",
"      const h2 = sh[sh.length - 1].price, h1 = sh[sh.length - 2].price;",
"      const l2 = sl[sl.length - 1].price, l1 = sl[sl.length - 2].price;",
"      if (h2 > h1 && l2 > l1) { structure = 0.9; evidence.push('BULLISH_STRUCTURE (HH+HL)'); }",
"      else if (h2 < h1 && l2 < l1) { structure = -0.9; evidence.push('BEARISH_STRUCTURE (LH+LL)'); }",
"    }",
"    const lastClosed = candles[candles.length - 1];",
"    const prevClosed = candles[candles.length - 2];",
"    const lastSwingHigh = sh.length ? sh[sh.length - 1].price : null;",
"    const lastSwingLow = sl.length ? sl[sl.length - 1].price : null;",
"    if (lastSwingHigh !== null && lastClosed.close > lastSwingHigh) {",
"      if (structure > 0) { structure = 1.25; evidence.push('BULLISH_BOS'); }",
"      else if (structure < 0) { structure = 1.15; evidence.push('BULLISH_CHOCH'); }",
"      else { structure = 0.85; evidence.push('BULLISH_STRUCTURE_BREAK'); }",
"    } else if (lastSwingLow !== null && lastClosed.close < lastSwingLow) {",
"      if (structure < 0) { structure = -1.25; evidence.push('BEARISH_BOS'); }",
"      else if (structure > 0) { structure = -1.15; evidence.push('BEARISH_CHOCH'); }",
"      else { structure = -0.85; evidence.push('BEARISH_STRUCTURE_BREAK'); }",
"    }",
"    if (structure > 0) bullScore += structure;",
"    else if (structure < 0) bearScore += -structure;",
"",
"    // 2. LIQUIDITY: equal highs/lows pools + stop-run sweep + rejection",
"    const recent = candles.slice(-30);",
"    const tol = 0.0006;",
"    const levels = [];",
"    for (let i = 0; i < recent.length - 2; i++) {",
"      for (let j = i + 2; j < recent.length; j++) {",
"        const midH = (recent[i].high + recent[j].high) / 2;",
"        if (Math.abs(recent[i].high - recent[j].high) / midH <= tol) levels.push({ price: midH, kind: 'EQH' });",
"        const midL = (recent[i].low + recent[j].low) / 2;",
"        if (Math.abs(recent[i].low - recent[j].low) / midL <= tol) levels.push({ price: midL, kind: 'EQL' });",
"      }",
"    }",
"    let poolHigh = recent[0], poolLow = recent[0];",
"    for (const c of recent) {",
"      if (c.high > poolHigh.high) poolHigh = c;",
"      if (c.low < poolLow.low) poolLow = c;",
"    }",
"    levels.push({ price: poolHigh.high, kind: 'BSL' });",
"    levels.push({ price: poolLow.low, kind: 'SSL' });",
"    const rng = Math.max(1e-9, lastClosed.high - lastClosed.low);",
"    const body = Math.abs(lastClosed.close - lastClosed.open);",
"    const upWick = (lastClosed.high - Math.max(lastClosed.open, lastClosed.close)) / rng;",
"    const loWick = (Math.min(lastClosed.open, lastClosed.close) - lastClosed.low) / rng;",
"    let sweep = 0;",
"    for (const lv of levels) {",
"      if (lv.kind === 'EQH' || lv.kind === 'BSL') {",
"        if (lastClosed.high > lv.price && lastClosed.close < lv.price) {",
"          sweep = -1.2 - (upWick > body * 1.2 ? 0.35 : 0);",
"          evidence.push('BUY_SIDE_LIQUIDITY_SWEEP' + (upWick > body * 1.2 ? ' + REJECTION' : ''));",
"        }",
"      } else {",
"        if (lastClosed.low < lv.price && lastClosed.close > lv.price) {",
"          sweep = 1.2 + (loWick > body * 1.2 ? 0.35 : 0);",
"          evidence.push('SELL_SIDE_LIQUIDITY_SWEEP' + (loWick > body * 1.2 ? ' + REJECTION' : ''));",
"        }",
"      }",
"    }",
"    if (sweep > 0) bullScore += sweep;",
"    else if (sweep < 0) bearScore += -sweep;",
"",
"    // 3. ORDER BLOCKS + FAIR VALUE GAPS (freshness + proximity weighted)",
"    const scan = candles.slice(-30);",
"    let avgBody = 0, cnt = 0;",
"    for (let i = Math.max(1, scan.length - 10); i < scan.length - 1; i++) { avgBody += Math.abs(scan[i].close - scan[i].open); cnt++; }",
"    avgBody = cnt ? avgBody / cnt : 1e-9;",
"    let bullOB = null, bearOB = null;",
"    for (let i = 2; i < scan.length - 1; i++) {",
"      const c = scan[i], p = scan[i - 1];",
"      const disp = Math.abs(c.close - c.open) / avgBody;",
"      if (disp >= 1.6 && c.close > c.open && c.close > p.high) {",
"        bullOB = { high: Math.max(p.open, p.high), low: p.low, fresh: true, at: i };",
"      } else if (disp >= 1.6 && c.close < c.open && c.close < p.low) {",
"        bearOB = { high: p.high, low: Math.min(p.open, p.low), fresh: true, at: i };",
"      }",
"    }",
"    const mitigatedOB = (ob, isBull) => {",
"      for (let k = ob.at + 1; k < scan.length; k++) {",
"        const c = scan[k];",
"        if (isBull && c.close < ob.low) return true;",
"        if (!isBull && c.close > ob.high) return true;",
"        if (isBull && c.low <= ob.high) ob.fresh = false;",
"        if (!isBull && c.high >= ob.low) ob.fresh = false;",
"      }",
"      return false;",
"    };",
"    if (bullOB && mitigatedOB(bullOB, true)) bullOB = null;",
"    if (bearOB && mitigatedOB(bearOB, false)) bearOB = null;",
"    let bullFVG = null, bearFVG = null;",
"    for (let i = 2; i < scan.length; i++) {",
"      const c1 = scan[i - 2], c3 = scan[i];",
"      if (c3.low > c1.high) bullFVG = { upper: c3.low, lower: c1.high, fresh: true, at: i };",
"      else if (c1.low > c3.high) bearFVG = { upper: c1.low, lower: c3.high, fresh: true, at: i };",
"    }",
"    const mitigatedFVG = (g, isBull) => {",
"      for (let k = g.at + 1; k < scan.length; k++) {",
"        const c = scan[k];",
"        if (isBull && c.close <= g.lower) return true;",
"        if (!isBull && c.close >= g.upper) return true;",
"        if (isBull && c.low <= g.upper) g.fresh = false;",
"        if (!isBull && c.high >= g.lower) g.fresh = false;",
"      }",
"      return false;",
"    };",
"    if (bullFVG && mitigatedFVG(bullFVG, true)) bullFVG = null;",
"    if (bearFVG && mitigatedFVG(bearFVG, false)) bearFVG = null;",
"    let zone = 0;",
"    if (bullOB) { zone += bullOB.fresh ? 1.25 : 0.8; evidence.push('BULLISH_ORDER_BLOCK' + (bullOB.fresh ? ' (FRESH)' : '')); }",
"    if (bearOB) { zone -= bearOB.fresh ? 1.25 : 0.8; evidence.push('BEARISH_ORDER_BLOCK' + (bearOB.fresh ? ' (FRESH)' : '')); }",
"    if (bullFVG) { zone += bullFVG.fresh ? 1.0 : 0.6; evidence.push('BULLISH_FVG' + (bullFVG.fresh ? ' (FRESH)' : '')); }",
"    if (bearFVG) { zone -= bearFVG.fresh ? 1.0 : 0.6; evidence.push('BEARISH_FVG' + (bearFVG.fresh ? ' (FRESH)' : '')); }",
"    if (bullOB && lastClosed.low <= bullOB.high && lastClosed.close >= bullOB.low) { zone += 0.4; evidence.push('PRICE_AT_BULLISH_OB'); }",
"    if (bearOB && lastClosed.high >= bearOB.low && lastClosed.close <= bearOB.high) { zone -= 0.4; evidence.push('PRICE_AT_BEARISH_OB'); }",
"    if (zone > 0) bullScore += zone;",
"    else if (zone < 0) bearScore += -zone;",
"",
"    // 4. CANDLE REACTION / WICK READ on the last closed candle",
"    let reaction = 0;",
"    if (loWick >= 0.55 && body / rng <= 0.35) { reaction = 1.25; evidence.push('BULLISH_PIN_BAR'); }",
"    else if (upWick >= 0.55 && body / rng <= 0.35) { reaction = -1.25; evidence.push('BEARISH_PIN_BAR'); }",
"    else if (lastClosed.close > lastClosed.open && prevClosed && prevClosed.close < prevClosed.open && lastClosed.close > prevClosed.open && lastClosed.open <= prevClosed.close) { reaction = 1.15; evidence.push('BULLISH_ENGULFING'); }",
"    else if (lastClosed.close < lastClosed.open && prevClosed && prevClosed.close > prevClosed.open && lastClosed.close < prevClosed.open && lastClosed.open >= prevClosed.close) { reaction = -1.15; evidence.push('BEARISH_ENGULFING'); }",
"    else if (upWick >= 0.45) { reaction = -0.8; evidence.push('UPPER_WICK_REJECTION'); }",
"    else if (loWick >= 0.45) { reaction = 0.8; evidence.push('LOWER_WICK_REJECTION'); }",
"    if (reaction > 0) bullScore += reaction;",
"    else if (reaction < 0) bearScore += -reaction;",
"",
"    const score = Math.max(5, Math.min(95, Math.round(50 + (bullScore - bearScore) * 22)));",
"    return { structure: structure, sweep: sweep, zone: zone, reaction: reaction, bullScore: bullScore, bearScore: bearScore, score: score, evidence: evidence };",
"  }",
"",
""].join('\n');
insertBefore('  function calculateSwarmSignals(price) {', smcModule);
ok++;

// ── 2. four SMC worker flies ─────────────────────────────────────────────────
replaceOnce(
  '    "Double Reversal", "Fib 61.8% Golden", "Candle Exhaustion", "Macro Confluence"\n  ];',
  '    "Double Reversal", "Fib 61.8% Golden", "Candle Exhaustion", "Macro Confluence",\n    "Structure BOS/CHoCH", "Liquidity Sweep", "OB/FVG Zone", "Candle Reaction/Wick"\n  ];'
);
ok++;

// ── 3. compute SMC inside calculateSwarmSignals ─────────────────────────────
replaceOnce(
  '    const closedLen = Math.max(0, closes.length - 2); // drop the 2 forming candles\n    const useCandles = closedLen >= 4;',
  '    const closedLen = Math.max(0, closes.length - 2); // drop the 2 forming candles\n    const useCandles = closedLen >= 4;\n\n    // Real SMC confluence on the closed M1 candles (structure/liquidity/OB/FVG/wicks).\n    const smcRead = analyzeSMC(candles);'
);
ok++;

// ── 4. blend the real SMC read into the confluence score ────────────────────
replaceOnce(
  '    const smcScore = Math.max(5, Math.min(95, 50 + m.z3 * 16 + m.trendZ * 10 - m.rsiZ * 8));',
  '    // Confluence is now grounded in real SMC structure (50/50 blend with the\n    // statistical read) instead of oscillator proxies alone.\n    const smcScore = Math.max(5, Math.min(95, Math.round(50 + ((smcRead.bullScore - smcRead.bearScore) * 22 + m.z3 * 16 + m.trendZ * 10 - m.rsiZ * 8) / 2)));'
);
ok++;

// ── 5. SMC lenses 21-24 join the swarm (learn per-pair like every other lens) ─
replaceOnce(
  '      20: function () { return m.trendZ * 0.6 + m.z5 * 0.4; }        // macro confluence\n    };',
  '      20: function () { return m.trendZ * 0.6 + m.z5 * 0.4; },       // macro confluence\n      // --- SMC CONFLUENCE LENSES (21-24) --- real chart-structure evidence; each one\n      // settles against real candle closes per pair, so the swarm learns how much to\n      // trust structure/liquidity/zones/wicks on THIS pair.\n      21: function () { return smcRead.structure; },                 // structure / BOS / CHoCH\n      22: function () { return smcRead.sweep; },                     // liquidity sweep + rejection\n      23: function () { return smcRead.zone; },                      // order blocks + FVG zones\n      24: function () { return smcRead.reaction; }                   // candle reaction / wick\n    };'
);
ok++;

// ── 6. surface the SMC read in the evidence panel ────────────────────────────
replaceOnce(
  "    const evidence = [\n      `Next Candle Prediction:",
  "    const evidence = [\n      'SMC: ' + smcRead.score + '/100 ' + (smcRead.evidence.length ? smcRead.evidence.slice(0, 3).join(' | ') : '(no strong structure read)'),\n      `Next Candle Prediction:"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 6');
