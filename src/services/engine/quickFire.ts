import { Candle } from '../../types/market';

/**
 * QuickFire — immediate candle-level evidence for the Queen when the chart has
 * fewer candles than the full SMC engine needs (structure/OB want 20+).
 *
 * It reads exactly what a discretionary 1-minute trader reads in the first
 * minutes of a stream:
 *   1. the last closed candle's wick/body anatomy (rejection vs absorption)
 *   2. the previous candle at half weight
 *   3. a liquidity sweep of the last 5 candles' extremes
 *   4. round-number (psychological) levels — breaks and wick rejections
 *   5. 3-candle closing momentum
 *
 * The Mistral vision verdict is merged separately by visionEngine (visionWeight DNA);
 * the Queen combines both pools of evidence in bootstrap mode.
 */

export interface QuickFireResult {
  direction: 'UP' | 'DOWN' | 'NONE';
  /** 0..1 conviction derived from how one-sided the quick evidence is. */
  score: number;
  bullScore: number;
  bearScore: number;
  evidence: string[];
  roundLevel: number | null;
  roundSide: 'ABOVE' | 'BELOW' | null;
  /** Mapped findings so the 20 worker flies can score the same evidence:
   *  sweep → fv.liquiditySweep/liquidityType, pattern → fv.candlePattern,
   *  fvg → fv.bullishFVG/bearishFVG. */
  sweep: 'SELL_SIDE_SWEPT' | 'BUY_SIDE_SWEPT' | null;
  pattern: string | null;
  fvg: 'BULLISH' | 'BEARISH' | null;
}

const SWEEP_LOOKBACK = 5;

function pipSize(asset: string, price: number): number {
  if (asset.includes('JPY')) return 0.01;
  if (price >= 1000) return 0.5;   // indices / high-priced instruments
  if (price >= 100) return 0.05;   // mid-priced pairs without JPY
  return 0.0001;
}

/** Round-number (psychological) level handling: breaks and wick rejections. */
function analyzeRoundNumbers(
  candles: Candle[],
  price: number,
  asset: string
): { bull: number; bear: number; evidence: string[]; level: number | null; side: 'ABOVE' | 'BELOW' | null } {
  const pip = pipSize(asset, price);
  const last = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : null;
  let bull = 0;
  let bear = 0;
  const evidence: string[] = [];
  let level: number | null = null;
  let side: 'ABOVE' | 'BELOW' | null = null;

  // Nearest round level: 100-pip and 50-pip grids (e.g. 208.00 / 207.50 on GBP/JPY)
  for (const stepPips of [100, 50]) {
    const step = stepPips * pip;
    const grid = Math.round(price / step) * step;
    if (Math.abs(price - grid) <= 3 * pip) {
      level = Number(grid.toFixed(5));
      side = price >= grid ? 'ABOVE' : 'BELOW';
      break;
    }
  }

  if (level !== null && last) {
    const piercedUp = last.high >= level && last.open < level;
    const piercedDown = last.low <= level && last.open > level;
    if (last.close > level && prev && prev.close <= level) {
      bull += 1;
      evidence.push(`ROUND_NUMBER_BREAK_UP (${level})`);
    } else if (last.close < level && prev && prev.close >= level) {
      bear += 1;
      evidence.push(`ROUND_NUMBER_BREAK_DOWN (${level})`);
    } else if (piercedUp && last.close < level) {
      // wick poked through the round level and got rejected — sellers defend it
      bear += 0.75;
      evidence.push(`ROUND_NUMBER_REJECTION (${level})`);
    } else if (piercedDown && last.close > level) {
      bull += 0.75;
      evidence.push(`ROUND_NUMBER_SUPPORT_HOLD (${level})`);
    } else {
      evidence.push(`AT_ROUND_NUMBER (${level})`);
    }
  }

  return { bull, bear, evidence, level, side };
}

/** Wick/body anatomy of a single candle: rejection wicks and body conviction. */
function analyzeCandleAnatomy(c: Candle): { bull: number; bear: number; evidence: string[]; pattern: string | null } {
  const range = c.high - c.low;
  if (range <= 0) return { bull: 0, bear: 0, evidence: [], pattern: null };
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const bull = 0;
  const bear = 0;
  const evidence: string[] = [];
  let b = bull;
  let r = bear;

  if (range > 0 && lowerWick / range >= 0.5 && c.close >= c.low + range * 0.6) {
    b += 1;
    evidence.push('LOWER_WICK_REJECTION (buyers defended the lows)');
  }
  if (range > 0 && upperWick / range >= 0.5 && c.close <= c.low + range * 0.4) {
    r += 1;
    evidence.push('UPPER_WICK_REJECTION (sellers defended the highs)');
  }
  if (body / range >= 0.65) {
    if (c.close > c.open) {
      b += 0.75;
      evidence.push('STRONG_BULLISH_BODY');
    } else {
      r += 0.75;
      evidence.push('STRONG_BEARISH_BODY');
    }
  }
  // Worker-fly consumable pattern label: rejection wicks read as pin-bar style
  // patterns, strong bodies as momentum candles.
  let pattern: string | null = null;
  if (lowerWick / range >= 0.5 && c.close >= c.low + range * 0.6) pattern = 'BULLISH_PIN_BAR';
  else if (upperWick / range >= 0.5 && c.close <= c.low + range * 0.4) pattern = 'BEARISH_PIN_BAR';
  else if (body / range >= 0.65) pattern = c.close > c.open ? 'BULLISH_MOMENTUM_CANDLE' : 'BEARISH_MOMENTUM_CANDLE';
  return { bull: b, bear: r, evidence, pattern };
}

/** Sweep of the visible extremes: took out prior highs/lows then closed back inside. */
function analyzeQuickSweep(candles: Candle[]): { bull: number; bear: number; evidence: string[]; type: 'SELL_SIDE_SWEPT' | 'BUY_SIDE_SWEPT' | null } {
  if (candles.length < SWEEP_LOOKBACK + 1) return { bull: 0, bear: 0, evidence: [], type: null };
  const last = candles[candles.length - 1];
  const prior = candles.slice(-(SWEEP_LOOKBACK + 1), -1);
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));
  const bull = 0;
  const bear = 0;
  let b = bull;
  let r = bear;
  const evidence: string[] = [];
  let type: 'SELL_SIDE_SWEPT' | 'BUY_SIDE_SWEPT' | null = null;

  if (last.high > priorHigh && last.close < priorHigh) {
    r += 1.5;
    evidence.push('QUICK_SWEEP_BUY_SIDE (high taken, closed back below)');
    type = 'BUY_SIDE_SWEPT';
  }
  if (last.low < priorLow && last.close > priorLow) {
    b += 1.5;
    evidence.push('QUICK_SWEEP_SELL_SIDE (low taken, closed back above)');
    type = 'SELL_SIDE_SWEPT';
  }
  return { bull: b, bear: r, evidence, type };
}

export function computeQuickFire(candles: Candle[], price: number, asset: string): QuickFireResult {
  const closed = candles.filter((c) => c.closed);
  const evidence: string[] = [];
  if (closed.length === 0 || !price) {
    return { direction: 'NONE', score: 0, bullScore: 0, bearScore: 0, evidence: ['NO_CLOSED_CANDLE_YET'], roundLevel: null, roundSide: null, sweep: null, pattern: null, fvg: null };
  }

  const last = closed[closed.length - 1];
  const prev = closed.length >= 2 ? closed[closed.length - 2] : null;

  let bull = 0;
  let bear = 0;

  const lastAnatomy = analyzeCandleAnatomy(last);
  bull += lastAnatomy.bull;
  bear += lastAnatomy.bear;
  evidence.push(...lastAnatomy.evidence);

  if (prev) {
    const prevAnatomy = analyzeCandleAnatomy(prev);
    bull += prevAnatomy.bull * 0.5;
    bear += prevAnatomy.bear * 0.5;
    if (prevAnatomy.evidence.length) evidence.push(`PREV_CANDLE: ${prevAnatomy.evidence[0]}`);
  }

  const sweep = analyzeQuickSweep(closed);
  bull += sweep.bull;
  bear += sweep.bear;
  evidence.push(...sweep.evidence);

  const rounds = analyzeRoundNumbers([...closed, { ...last, closed: true }], price, asset);
  bull += rounds.bull;
  bear += rounds.bear;
  evidence.push(...rounds.evidence);

  // 3-candle closing momentum
  if (closed.length >= 3) {
    const [a, b, c] = closed.slice(-3);
    if (c.close > b.close && b.close > a.close) {
      bull += 0.5;
      evidence.push('THREE_CANDLE_UP_MOMENTUM');
    } else if (c.close < b.close && b.close < a.close) {
      bear += 0.5;
      evidence.push('THREE_CANDLE_DOWN_MOMENTUM');
    }
  }

  // ── Enhancement lenses ──────────────────────────────────────────────

  // FVG (3-candle imbalance): a fresh gap acts as the nearby magnet/support zone.
  const fvg = analyzeQuickFvg(closed, price);
  bull += fvg.bull;
  bear += fvg.bear;
  evidence.push(...fvg.evidence);

  // OTC trap: a breakout that already failed means the BREAKOUT side is trapped —
  // the reversal is the tradeable edge, so this is contrarian evidence.
  const trap = detectOtcTrap(closed);
  if (trap.dir === 'UP') bull += 1.25;
  else if (trap.dir === 'DOWN') bear += 1.25;
  if (trap.evidence) evidence.push(trap.evidence);

  // OTC oscillation pattern: OTC pairs often cycle up/down in a tight range —
  // fade the extreme instead of chasing the middle.
  const osc = detectOscillation(closed);
  if (osc.reversion === 'UP') bull += 0.75;
  else if (osc.reversion === 'DOWN') bear += 0.75;
  if (osc.evidence) evidence.push(osc.evidence);

  // Slower trend context: 10-candle drift aligned with the quick direction
  // reinforces it; counter-trend quick evidence is dampened.
  const trend = trendContext(closed, price, asset);
  if (trend.dir === 'UP') bull += 0.4;
  else if (trend.dir === 'DOWN') bear += 0.4;
  if (trend.evidence) evidence.push(trend.evidence);

  const diff = bull - bear;
  const direction: 'UP' | 'DOWN' | 'NONE' = diff > 0.5 ? 'UP' : diff < -0.5 ? 'DOWN' : 'NONE';
  const score = Math.min(1, Math.abs(diff) / 3);

  return {
    direction,
    score,
    bullScore: Number(bull.toFixed(2)),
    bearScore: Number(bear.toFixed(2)),
    evidence: evidence.slice(0, 10),
    roundLevel: rounds.level,
    roundSide: rounds.side,
    sweep: sweep.type,
    pattern: lastAnatomy.pattern,
    fvg: fvg.type
  };
}

/** Fresh 3-candle Fair Value Gap near the current price. */
function analyzeQuickFvg(closed: Candle[], price: number): { bull: number; bear: number; evidence: string[]; type: 'BULLISH' | 'BEARISH' | null } {
  if (closed.length < 3 || !price) return { bull: 0, bear: 0, evidence: [], type: null };
  const c1 = closed[closed.length - 3];
  const c3 = closed[closed.length - 1];
  const bull = 0;
  const bear = 0;
  let b = bull;
  let r = bear;
  let fvgType: 'BULLISH' | 'BEARISH' | null = null;
  const evidence: string[] = [];

  // Bullish FVG: gap UP between c1.high and c3.low — gap zone sits below price as support.
  if (c3.low > c1.high && price >= c3.low) {
    const gapPct = ((c3.low - c1.high) / price) * 100;
    if (gapPct >= 0.005) {
      b += 0.75;
      fvgType = 'BULLISH';
      evidence.push(`FVG_SUPPORT_BELOW (bullish imbalance ${gapPct.toFixed(3)}%)`);
    }
  }
  // Bearish FVG: gap DOWN between c1.low and c3.high — gap zone sits above price as resistance.
  if (c3.high < c1.low && price <= c3.high) {
    const gapPct = ((c1.low - c3.high) / price) * 100;
    if (gapPct >= 0.005) {
      r += 0.75;
      fvgType = 'BEARISH';
      evidence.push(`FVG_RESISTANCE_ABOVE (bearish imbalance ${gapPct.toFixed(3)}%)`);
    }
  }
  return { bull: b, bear: r, evidence, type: fvgType };
}

/**
 * OTC trap detector: the PREVIOUS closed candle broke a 5-candle extreme and
 * closed beyond it (breakout), but the LAST candle closed back inside — the
 * breakout side is trapped and the reversal is the edge.
 */
function detectOtcTrap(closed: Candle[]): { dir: 'UP' | 'DOWN' | null; evidence: string | null } {
  if (closed.length < 7) return { dir: null, evidence: null };
  const last = closed[closed.length - 1];
  const prev = closed[closed.length - 2];
  const prior = closed.slice(-7, -2);
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));

  // Bull trap: prev broke ABOVE the range and closed there, last fell back inside → trapped buyers → DOWN.
  if (prev.high > priorHigh && prev.close > priorHigh && last.close < priorHigh) {
    return { dir: 'DOWN', evidence: 'BULL_TRAP_DETECTED (breakout failed — trapped buyers fuel the drop)' };
  }
  // Bear trap: prev broke BELOW the range and closed there, last recovered inside → trapped sellers → UP.
  if (prev.low < priorLow && prev.close < priorLow && last.close > priorLow) {
    return { dir: 'UP', evidence: 'BEAR_TRAP_DETECTED (breakdown failed — trapped sellers fuel the rally)' };
  }
  return { dir: null, evidence: null };
}

/**
 * OTC oscillation pattern: OTC feeds frequently cycle in tight alternating
 * waves. Detect ≥4 direction flips in the last 6 candles; if price sits at an
 * extreme of that cycle, mean-reversion points the other way.
 */
function detectOscillation(closed: Candle[]): { reversion: 'UP' | 'DOWN' | null; evidence: string | null } {
  if (closed.length < 6) return { reversion: null, evidence: null };
  const last6 = closed.slice(-6);
  let flips = 0;
  for (let i = 1; i < last6.length; i++) {
    const prevDir = Math.sign(last6[i - 1].close - last6[i - 1].open);
    const curDir = Math.sign(last6[i].close - last6[i].open);
    if (prevDir !== 0 && curDir !== 0 && prevDir !== curDir) flips++;
  }
  if (flips < 4) return { reversion: null, evidence: null };

  const rangeHigh = Math.max(...last6.map((c) => c.high));
  const rangeLow = Math.min(...last6.map((c) => c.low));
  const span = rangeHigh - rangeLow;
  if (span <= 0) return { reversion: null, evidence: null };
  const pos = (last6[last6.length - 1].close - rangeLow) / span;

  if (pos >= 0.7) return { reversion: 'DOWN', evidence: `OTC_OSCILLATION_TOP (${Math.round(pos * 100)}% of cycle range — fade the top)` };
  if (pos <= 0.3) return { reversion: 'UP', evidence: `OTC_OSCILLATION_BOTTOM (${Math.round(pos * 100)}% of cycle range — fade the bottom)` };
  return { reversion: null, evidence: 'OTC_OSCILLATION_PATTERN (cycling — mid-range, no edge)' };
}

/** 10-candle drift: slow trend context that reinforces or dampens quick evidence. */
function trendContext(closed: Candle[], price: number, asset: string): { dir: 'UP' | 'DOWN' | null; evidence: string | null } {
  if (closed.length < 10 || !price) return { dir: null, evidence: null };
  const last10 = closed.slice(-10);
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const pip = pipSize(asset, price);
  const first3 = avg(last10.slice(0, 3).map((c) => c.close));
  const last3 = avg(last10.slice(-3).map((c) => c.close));
  const drift = last3 - first3;
  if (Math.abs(drift) < 2 * pip) return { dir: null, evidence: null };
  const dir = drift > 0 ? 'UP' : 'DOWN';
  return { dir, evidence: `TREND_CONTEXT_${dir} (10-candle drift ${(drift / pip).toFixed(1)} pips)` };
}
