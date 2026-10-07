import {
  Candle,
  SwingPoint,
  LiquidityZone,
  OrderBlock,
  FairValueGap,
  CandlePatternResult,
  SMCFeatureVector,
  SMCRawDetails,
  MarketRegime
} from '../../types/market';
import { computeQuickFire } from './quickFire';

export class SMCEngine {
  private swingWindow = 3;
  private tolerancePct = 0.0003;
  private minDisplacementRatio = 1.5;
  private minGapPct = 0.00012;

  public process(candles: Candle[], asset: string, timeframe = 60): { fv: SMCFeatureVector; raw: SMCRawDetails } {
    // Zero look-ahead policy: every SCORED field (structure, sweeps, OBs, FVGs,
    // patterns, regime, trend) is computed from CLOSED candles only. The still-forming
    // candle flickers — a "sweep" can appear and vanish again within seconds — so it is
    // used exclusively for the candle-age timing gate at the bottom of this method.
    const lastCandle = candles && candles.length ? candles[candles.length - 1] : null;
    const analysisCandles =
      lastCandle && lastCandle.closed === false ? candles.slice(0, -1) : candles || [];

    if (!candles || analysisCandles.length < 5) {
      const emptyFv: SMCFeatureVector = {
        asset,
        timestamp: Date.now(),
        timeframe,
        trend: 'UNCERTAIN',
        bos: false,
        choch: false,
        liquiditySweep: false,
        liquidityType: null,
        bullishOB: false,
        bearishOB: false,
        bullishFVG: false,
        bearishFVG: false,
        fvgFresh: false,
        obFresh: false,
        candlePattern: 'NONE',
        displacement: 1.0,
        wickRatio: 0.0,
        volatility: 0.0,
        regime: 'UNCERTAIN',
        confluenceScore: 0,
        evidence: []
      };
      // QuickFire: even with 1–4 candles the last closed candle's wick/body,
      // sweep and round-number evidence can drive an immediate signal.
      const qfThin = computeQuickFire(candles || [], (candles && candles.length ? candles[candles.length - 1].close : 0) || 0, asset);
      if (qfThin.direction !== 'NONE') {
        emptyFv.bootstrapMode = true;
        emptyFv.quickDirection = qfThin.direction;
        emptyFv.quickScore = qfThin.score;
        emptyFv.roundNumberLevel = qfThin.roundLevel;
        emptyFv.candlePattern = qfThin.direction === 'UP' ? 'BULLISH_QUICKFIRE' : 'BEARISH_QUICKFIRE';
        emptyFv.trend = qfThin.direction === 'UP' ? 'BULLISH' : 'BEARISH';
        emptyFv.regime = qfThin.direction === 'UP' ? 'TREND_UP' : 'TREND_DOWN';
        emptyFv.confluenceScore = Math.min(85, Math.round(qfThin.score * 40));
        emptyFv.evidence = ['QUICKFIRE_MODE', ...qfThin.evidence];
      }
      const emptyRaw: SMCRawDetails = {
        structure: { trend: 'UNCERTAIN', bos: false, choch: false, lastSwingHigh: null, lastSwingLow: null, swings: [] },
        liquidity: { activeZones: [], sweep: false, sweepType: null, sweepPrice: null, rejectionAfterSweep: false },
        orderBlocks: { allOBs: [], activeBullishOB: null, activeBearishOB: null, hasFreshBullishOB: false, hasFreshBearishOB: false },
        fvg: { allFVGs: [], activeBullish: null, activeBearish: null, bullishCount: 0, bearishCount: 0 },
        pattern: { pattern: 'NONE', direction: 'NEUTRAL', bodyRatio: 0, upperWickRatio: 0, lowerWickRatio: 0, range: 0, closeLocation: 0.5, confidence: 0 },
        regime: 'UNCERTAIN',
        trend: 'UNCERTAIN',
        confluenceScore: 0,
        evidence: []
      };
      return { fv: emptyFv, raw: emptyRaw };
    }

    const curr = analysisCandles[analysisCandles.length - 1];
    const structure = this.analyzeStructure(analysisCandles);
    const liquidity = this.analyzeLiquidity(analysisCandles);
    const orderBlocks = this.analyzeOrderBlocks(analysisCandles);
    const fvg = this.analyzeFVG(analysisCandles);
    const pattern = this.analyzeCandlePatterns(analysisCandles);
    const regime = this.classifyRegime(analysisCandles);
    const trend = this.evaluateTrend(analysisCandles, structure.trend);

    // Confluence calculation
    let score = 0;
    const evidence: string[] = [];

    if (liquidity.sweep) {
      score += 20;
      evidence.push(`LIQUIDITY_SWEEP (${liquidity.sweepType})`);
      if (liquidity.rejectionAfterSweep) {
        evidence.push('REJECTION_AFTER_SWEEP');
      }
    }

    const hasBullOB = !!orderBlocks.activeBullishOB;
    const hasBearOB = !!orderBlocks.activeBearishOB;
    if (hasBullOB || hasBearOB) {
      score += 20;
      if (hasBullOB) evidence.push('BULLISH_ORDER_BLOCK');
      if (hasBearOB) evidence.push('BEARISH_ORDER_BLOCK');
    }

    const hasBullFVG = !!fvg.activeBullish;
    const hasBearFVG = !!fvg.activeBearish;
    if (hasBullFVG || hasBearFVG) {
      score += 15;
      if (hasBullFVG) evidence.push('BULLISH_FVG');
      if (hasBearFVG) evidence.push('BEARISH_FVG');
    }

    if (structure.bos) {
      score += 15;
      evidence.push('BREAK_OF_STRUCTURE (BOS)');
    } else if (structure.choch) {
      score += 15;
      evidence.push('CHANGE_OF_CHARACTER (CHoCH)');
    }

    if (pattern.pattern !== 'NONE' && pattern.pattern !== 'DOJI') {
      score += 10;
      evidence.push(`CANDLE_PATTERN (${pattern.pattern})`);
    }

    if (trend === 'BULLISH' || trend === 'BEARISH') {
      score += 10;
      evidence.push(`TREND_ALIGNMENT (${trend})`);
    }

    const obFresh = orderBlocks.hasFreshBullishOB || orderBlocks.hasFreshBearishOB;
    const fvgFresh =
      (fvg.activeBullish ? (fvg.activeBullish as FairValueGap).fresh : false) ||
      (fvg.activeBearish ? (fvg.activeBearish as FairValueGap).fresh : false);
    if (obFresh || fvgFresh) {
      score += 10;
      evidence.push('FRESH_RETEST_ZONE');
    }

    const confluenceScore = Math.min(100, score);
    const wickRatio = Math.max(pattern.upperWickRatio, pattern.lowerWickRatio);
    const dispBull = orderBlocks.activeBullishOB ? (orderBlocks.activeBullishOB as OrderBlock).displacementScore : 1.0;
    const dispBear = orderBlocks.activeBearishOB ? (orderBlocks.activeBearishOB as OrderBlock).displacementScore : 1.0;
    const displacement = Math.max(1.0, dispBull, dispBear);
    const volatility = curr.close > 0 ? Number((((curr.high - curr.low) / curr.close) * 100).toFixed(4)) : 0;

    const fv: SMCFeatureVector = {
      asset,
      timestamp: curr.timestamp,
      timeframe,
      trend: trend as any,
      bos: structure.bos,
      choch: structure.choch,
      liquiditySweep: liquidity.sweep,
      liquidityType: liquidity.sweepType,
      bullishOB: hasBullOB,
      bearishOB: hasBearOB,
      bullishFVG: hasBullFVG,
      bearishFVG: hasBearFVG,
      fvgFresh: !!fvgFresh,
      obFresh: !!obFresh,
      candlePattern: pattern.pattern,
      displacement: Number(displacement.toFixed(2)),
      wickRatio: Number(wickRatio.toFixed(3)),
      volatility,
      regime,
      confluenceScore,
      evidence
    };

    const raw: SMCRawDetails = {
      structure,
      liquidity,
      orderBlocks,
      fvg,
      pattern,
      regime,
      trend,
      confluenceScore,
      evidence
    };

    // QuickFire: always compute the immediate candle-level evidence (last closed
    // candle wick/body, quick sweep, round numbers, momentum). On thin charts
    // (<20 candles) it also carries the trend/regime fallback, and the Queen can
    // act on strong quick evidence at any candle count.
    {
      const qf = computeQuickFire(analysisCandles, curr.close || curr.open, asset);
      fv.bootstrapMode = analysisCandles.length < 20;
      fv.quickDirection = qf.direction;
      fv.quickScore = qf.score;
      fv.roundNumberLevel = qf.roundLevel;
      // Signal timing gate input: how old the RUNNING candle is (the real last element,
      // which may still be open). The open candle started at its timestamp, so age =
      // now - timestamp.
      fv.candleAgeSec = Math.max(0, Math.round((Date.now() - ((lastCandle && lastCandle.timestamp) || Date.now())) / 1000));
      if (qf.evidence.length) fv.evidence.push('QUICKFIRE_MODE', ...qf.evidence);
      // Map the QuickFire findings into the SCORED fields so the 20 worker flies
      // evaluate the same immediate evidence the Queen sees — without this the
      // workers never vote on quick sweeps/patterns/FVGs and stay in HOLD forever.
      if (!fv.liquiditySweep && qf.sweep) {
        fv.liquiditySweep = true;
        fv.liquidityType = qf.sweep;
      }
      if ((fv.candlePattern === 'NONE' || fv.candlePattern === 'DOJI') && qf.pattern) {
        fv.candlePattern = qf.pattern;
      }
      if (fv.bootstrapMode && qf.fvg === 'BULLISH') fv.bullishFVG = true;
      if (fv.bootstrapMode && qf.fvg === 'BEARISH') fv.bearishFVG = true;
      if (fv.bootstrapMode) {
        fv.confluenceScore = Math.min(85, fv.confluenceScore + Math.round(qf.score * 30));
        raw.confluenceScore = fv.confluenceScore;
        raw.evidence = [...raw.evidence, 'QUICKFIRE_MODE', ...qf.evidence];
        if ((fv.trend === 'UNCERTAIN' || fv.trend === 'RANGE') && qf.direction !== 'NONE') {
          fv.trend = qf.direction === 'UP' ? 'BULLISH' : 'BEARISH';
          raw.trend = fv.trend;
        }
        if ((fv.regime === 'UNCERTAIN' || fv.regime === 'RANGE') && qf.direction !== 'NONE') {
          fv.regime = qf.direction === 'UP' ? 'TREND_UP' : 'TREND_DOWN';
          raw.regime = fv.regime;
        }
      }
    }

    return { fv, raw };
  }

  /**
   * Higher-timeframe trend confirmation. Buckets the closed candles into `factor`x
   * larger candles (M1 → M5, M5 → M15, ...) and derives a simple EMA trend from the
   * bucket closes. Returns NEUTRAL when there is not enough data, so callers can keep
   * the filter silent instead of guessing.
   */
  public higherTimeframeTrend(candles: Candle[], factor = 5): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const closed = (candles || []).filter((c) => c.closed !== false);
    if (factor < 2 || closed.length < 25) return 'NEUTRAL';

    const tfSec = closed[0].timeframe && closed[0].timeframe > 0 ? closed[0].timeframe : 60;
    const bucketMs = tfSec * factor * 1000;

    // Merge into higher-timeframe candles (assumes chronological order).
    const buckets: Candle[] = [];
    let bucketStart = Math.floor(closed[0].timestamp / bucketMs) * bucketMs;
    closed.forEach((c) => {
      const cStart = Math.floor(c.timestamp / bucketMs) * bucketMs;
      if (cStart > bucketStart || buckets.length === 0) {
        bucketStart = cStart;
        buckets.push({ ...c, timestamp: cStart });
      } else {
        const b = buckets[buckets.length - 1];
        b.high = Math.max(b.high, c.high);
        b.low = Math.min(b.low, c.low);
        b.close = c.close;
        b.volume = (b.volume || 0) + (c.volume || 0);
      }
    });

    if (buckets.length < 5) return 'NEUTRAL';
    const closes = buckets.map((b) => b.close);

    const ema = (period: number): number => {
      const k = 2 / (period + 1);
      let e = closes[0];
      for (let i = 1; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
      return e;
    };
    const emaFast = ema(3);
    const emaSlow = ema(6);
    const lastClose = closes[closes.length - 1];

    if (emaFast > emaSlow && lastClose >= emaFast) return 'BULLISH';
    if (emaFast < emaSlow && lastClose <= emaFast) return 'BEARISH';
    return 'NEUTRAL';
  }

  private analyzeStructure(candles: Candle[]) {
    if (candles.length < this.swingWindow * 2 + 3) {
      return { trend: 'UNCERTAIN', bos: false, choch: false, lastSwingHigh: null, lastSwingLow: null, swings: [] };
    }

    const swings: SwingPoint[] = [];
    const n = candles.length;
    const evalLimit = n - this.swingWindow;

    for (let i = this.swingWindow; i < evalLimit; i++) {
      const curr = candles[i];
      let isHigh = true;
      let isLow = true;

      for (let w = 1; w <= this.swingWindow; w++) {
        if (candles[i - w].high >= curr.high || candles[i + w].high > curr.high) isHigh = false;
        if (candles[i - w].low <= curr.low || candles[i + w].low < curr.low) isLow = false;
      }

      if (isHigh) {
        swings.push({ index: i, timestamp: curr.timestamp, price: curr.high, type: 'HIGH' });
      } else if (isLow) {
        swings.push({ index: i, timestamp: curr.timestamp, price: curr.low, type: 'LOW' });
      }
    }

    let lastHigh: SwingPoint | null = null;
    let lastLow: SwingPoint | null = null;

    swings.forEach((sp) => {
      if (sp.type === 'HIGH') {
        if (!lastHigh) sp.classification = 'HIGH';
        else if (sp.price > lastHigh.price) sp.classification = 'HH';
        else sp.classification = 'LH';
        lastHigh = sp;
      } else {
        if (!lastLow) sp.classification = 'LOW';
        else if (sp.price < lastLow.price) sp.classification = 'LL';
        else sp.classification = 'HL';
        lastLow = sp;
      }
    });

    const highs = swings.filter((s) => s.type === 'HIGH');
    const lows = swings.filter((s) => s.type === 'LOW');
    let prevTrend = 'RANGE';

    if (highs.length >= 2 && lows.length >= 2) {
      const h2 = highs[highs.length - 1];
      const h1 = highs[highs.length - 2];
      const l2 = lows[lows.length - 1];
      const l1 = lows[lows.length - 2];
      if (h2.price > h1.price && l2.price > l1.price) prevTrend = 'BULLISH';
      else if (h2.price < h1.price && l2.price < l1.price) prevTrend = 'BEARISH';
    }

    const latest = candles[n - 1];
    let bos = false;
    let choch = false;
    let currentTrend = prevTrend;

    if (lastHigh && latest.close > (lastHigh as SwingPoint).price) {
      if (prevTrend === 'BULLISH') {
        bos = true;
        currentTrend = 'BULLISH';
      } else if (prevTrend === 'BEARISH') {
        choch = true;
        currentTrend = 'BULLISH';
      }
    }

    if (lastLow && latest.close < (lastLow as SwingPoint).price) {
      if (prevTrend === 'BEARISH') {
        bos = true;
        currentTrend = 'BEARISH';
      } else if (prevTrend === 'BULLISH') {
        choch = true;
        currentTrend = 'BEARISH';
      }
    }

    return {
      trend: currentTrend,
      bos,
      choch,
      lastSwingHigh: lastHigh ? (lastHigh as SwingPoint).price : null,
      lastSwingLow: lastLow ? (lastLow as SwingPoint).price : null,
      swings: swings.slice(-10)
    };
  }

  private analyzeLiquidity(candles: Candle[]) {
    if (candles.length < 15) {
      return { activeZones: [], sweep: false, sweepType: null, sweepPrice: null, rejectionAfterSweep: false };
    }

    const recent = candles.slice(-60);
    const n = recent.length;
    const zones: LiquidityZone[] = [];
    const seenZoneIds = new Set<string>();

    for (let i = Math.max(0, n - 25); i < n - 2; i++) {
      for (let j = i + 2; j < n - 1; j++) {
        const diffHigh = Math.abs(recent[i].high - recent[j].high);
        const avgHigh = (recent[i].high + recent[j].high) / 2;
        if (diffHigh / avgHigh <= this.tolerancePct) {
          const zoneId = `EQH_${recent[i].timestamp}_${recent[j].timestamp}`;
          if (!seenZoneIds.has(zoneId)) {
            seenZoneIds.add(zoneId);
            zones.push({
              id: zoneId,
              type: 'EQUAL_HIGH',
              price: avgHigh,
              timestamp: recent[j].timestamp,
              strength: 0.85,
              swept: false
            });
          }
        }

        const diffLow = Math.abs(recent[i].low - recent[j].low);
        const avgLow = (recent[i].low + recent[j].low) / 2;
        if (diffLow / avgLow <= this.tolerancePct) {
          const zoneId = `EQL_${recent[i].timestamp}_${recent[j].timestamp}`;
          if (!seenZoneIds.has(zoneId)) {
            seenZoneIds.add(zoneId);
            zones.push({
              id: zoneId,
              type: 'EQUAL_LOW',
              price: avgLow,
              timestamp: recent[j].timestamp,
              strength: 0.85,
              swept: false
            });
          }
        }
      }
    }

    const highest = recent.slice(0, -1).reduce((prev, curr) => (curr.high > prev.high ? curr : prev), recent[0]);
    const lowest = recent.slice(0, -1).reduce((prev, curr) => (curr.low < prev.low ? curr : prev), recent[0]);

    const bslId = `BSL_${highest.timestamp}`;
    if (!seenZoneIds.has(bslId)) {
      seenZoneIds.add(bslId);
      zones.push({
        id: bslId,
        type: 'BUY_SIDE',
        price: highest.high,
        timestamp: highest.timestamp,
        strength: 0.75,
        swept: false
      });
    }

    const sslId = `SSL_${lowest.timestamp}`;
    if (!seenZoneIds.has(sslId)) {
      seenZoneIds.add(sslId);
      zones.push({
        id: sslId,
        type: 'SELL_SIDE',
        price: lowest.low,
        timestamp: lowest.timestamp,
        strength: 0.75,
        swept: false
      });
    }

    const current = recent[n - 1];
    let sweep = false;
    let sweepType: string | null = null;
    let sweepPrice: number | null = null;
    let rejection = false;

    zones.forEach((z) => {
      if (z.type === 'BUY_SIDE' || z.type === 'EQUAL_HIGH') {
        if (current.high > z.price && current.close < z.price) {
          z.swept = true;
          z.sweepDirection = 'BEARISH_SWEEP';
          sweep = true;
          sweepType = 'BUY_SIDE_SWEPT';
          sweepPrice = z.price;
          const upperWick = current.high - Math.max(current.open, current.close);
          const body = Math.abs(current.close - current.open);
          if (upperWick > body * 1.2) rejection = true;
        }
      } else if (z.type === 'SELL_SIDE' || z.type === 'EQUAL_LOW') {
        if (current.low < z.price && current.close > z.price) {
          z.swept = true;
          z.sweepDirection = 'BULLISH_SWEEP';
          sweep = true;
          sweepType = 'SELL_SIDE_SWEPT';
          sweepPrice = z.price;
          const lowerWick = Math.min(current.open, current.close) - current.low;
          const body = Math.abs(current.close - current.open);
          if (lowerWick > body * 1.2) rejection = true;
        }
      }
    });

    return {
      activeZones: zones.slice(-12),
      sweep,
      sweepType,
      sweepPrice,
      rejectionAfterSweep: rejection
    };
  }

  private analyzeOrderBlocks(candles: Candle[]) {
    if (candles.length < 20) {
      return { allOBs: [], activeBullishOB: null, activeBearishOB: null, hasFreshBullishOB: false, hasFreshBearishOB: false };
    }

    const obs: OrderBlock[] = [];
    const seenOBIds = new Set<string>();
    const n = candles.length;
    const start = Math.max(10, n - 40);

    for (let i = start; i < n - 1; i++) {
      const priorBodies = candles.slice(i - 10, i).map((c) => Math.abs(c.close - c.open));
      const avgBody = priorBodies.reduce((a, b) => a + b, 0) / priorBodies.length || 0.0001;

      const curr = candles[i];
      const prev = candles[i - 1];
      const currBody = Math.abs(curr.close - curr.open);
      const ratio = currBody / avgBody;

      if (ratio >= this.minDisplacementRatio) {
        if (curr.close > curr.open && curr.close > prev.high) {
          if (prev.close <= prev.open || prev.low < curr.low) {
            const obId = `BULL_OB_${prev.timestamp}_${i}`;
            if (!seenOBIds.has(obId)) {
              seenOBIds.add(obId);
              obs.push({
                id: obId,
                type: 'BULLISH',
                high: Math.max(prev.open, prev.high),
                low: prev.low,
                timestamp: prev.timestamp,
                strength: Math.min(1.0, 0.6 + ratio * 0.1),
                fresh: true,
                mitigated: false,
                displacementScore: Number(ratio.toFixed(2))
              });
            }
          }
        } else if (curr.close < curr.open && curr.close < prev.low) {
          if (prev.close >= prev.open || prev.high > curr.high) {
            const obId = `BEAR_OB_${prev.timestamp}_${i}`;
            if (!seenOBIds.has(obId)) {
              seenOBIds.add(obId);
              obs.push({
                id: obId,
                type: 'BEARISH',
                high: prev.high,
                low: Math.min(prev.open, prev.low),
                timestamp: prev.timestamp,
                strength: Math.min(1.0, 0.6 + ratio * 0.1),
                fresh: true,
                mitigated: false,
                displacementScore: Number(ratio.toFixed(2))
              });
            }
          }
        }
      }
    }

    let activeBullish: OrderBlock | null = null;
    let activeBearish: OrderBlock | null = null;

    obs.forEach((ob) => {
      candles.forEach((c) => {
        if (c.timestamp > ob.timestamp) {
          if (ob.type === 'BULLISH') {
            if (c.low <= ob.high) ob.fresh = false;
            if (c.close < ob.low) ob.mitigated = true;
          } else {
            if (c.high >= ob.low) ob.fresh = false;
            if (c.close > ob.high) ob.mitigated = true;
          }
        }
      });

      if (!ob.mitigated) {
        if (ob.type === 'BULLISH') {
          if (!activeBullish || ob.timestamp > activeBullish.timestamp) activeBullish = ob;
        } else {
          if (!activeBearish || ob.timestamp > activeBearish.timestamp) activeBearish = ob;
        }
      }
    });

    return {
      allOBs: obs.slice(-15),
      activeBullishOB: activeBullish,
      activeBearishOB: activeBearish,
      hasFreshBullishOB: !!(activeBullish && (activeBullish as OrderBlock).fresh),
      hasFreshBearishOB: !!(activeBearish && (activeBearish as OrderBlock).fresh)
    };
  }

  private analyzeFVG(candles: Candle[]) {
    if (candles.length < 4) {
      return { allFVGs: [], activeBullish: null, activeBearish: null, bullishCount: 0, bearishCount: 0 };
    }

    const fvgs: FairValueGap[] = [];
    const seenFVGIds = new Set<string>();
    const n = candles.length;

    for (let i = 2; i < n; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];

      if (c3.low > c1.high) {
        const gap = c3.low - c1.high;
        const avg = (c3.low + c1.high) / 2;
        if (gap / avg >= this.minGapPct) {
          const fvgId = `BULL_FVG_${c2.timestamp}_${i}`;
          if (!seenFVGIds.has(fvgId)) {
            seenFVGIds.add(fvgId);
            fvgs.push({
              id: fvgId,
              type: 'BULLISH',
              upper: c3.low,
              lower: c1.high,
              size: gap,
              timestamp: c2.timestamp,
              fresh: true,
              touched: false,
              mitigated: false
            });
          }
        }
      } else if (c1.low > c3.high) {
        const gap = c1.low - c3.high;
        const avg = (c1.low + c3.high) / 2;
        if (gap / avg >= this.minGapPct) {
          const fvgId = `BEAR_FVG_${c2.timestamp}_${i}`;
          if (!seenFVGIds.has(fvgId)) {
            seenFVGIds.add(fvgId);
            fvgs.push({
              id: fvgId,
              type: 'BEARISH',
              upper: c1.low,
              lower: c3.high,
              size: gap,
              timestamp: c2.timestamp,
              fresh: true,
              touched: false,
              mitigated: false
            });
          }
        }
      }
    }

    let activeBullish: FairValueGap | null = null;
    let activeBearish: FairValueGap | null = null;

    fvgs.forEach((fvg) => {
      candles.forEach((c) => {
        if (c.timestamp > fvg.timestamp) {
          if (fvg.type === 'BULLISH') {
            if (c.low <= fvg.upper) {
              fvg.touched = true;
              fvg.fresh = false;
            }
            if (c.close <= fvg.lower) fvg.mitigated = true;
          } else {
            if (c.high >= fvg.lower) {
              fvg.touched = true;
              fvg.fresh = false;
            }
            if (c.close >= fvg.upper) fvg.mitigated = true;
          }
        }
      });

      if (!fvg.mitigated) {
        if (fvg.type === 'BULLISH') {
          if (!activeBullish || fvg.timestamp > activeBullish.timestamp) activeBullish = fvg;
        } else {
          if (!activeBearish || fvg.timestamp > activeBearish.timestamp) activeBearish = fvg;
        }
      }
    });

    return {
      allFVGs: fvgs.slice(-20),
      activeBullish,
      activeBearish,
      bullishCount: fvgs.filter((f) => f.type === 'BULLISH' && !f.mitigated).length,
      bearishCount: fvgs.filter((f) => f.type === 'BEARISH' && !f.mitigated).length
    };
  }

  private analyzeCandlePatterns(candles: Candle[]): CandlePatternResult {
    if (candles.length < 3) {
      return {
        pattern: 'NONE',
        direction: 'NEUTRAL',
        bodyRatio: 0,
        upperWickRatio: 0,
        lowerWickRatio: 0,
        range: 0,
        closeLocation: 0.5,
        confidence: 0
      };
    }

    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const totalRange = Math.max(0.000001, curr.high - curr.low);
    const body = Math.abs(curr.close - curr.open);
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;

    const bodyRatio = body / totalRange;
    const upperWickRatio = upperWick / totalRange;
    const lowerWickRatio = lowerWick / totalRange;
    const closeLocation = (curr.close - curr.low) / totalRange;
    const candleDir = curr.close > curr.open ? 'BULLISH' : curr.close < curr.open ? 'BEARISH' : 'DOJI';

    const prevRange = Math.max(0.000001, prev.high - prev.low);
    const prevBody = Math.abs(prev.close - prev.open);

    let pattern = 'NONE';
    let confidence = 0.5;

    if (bodyRatio < 0.1) {
      pattern = 'DOJI';
      confidence = 0.65;
    } else if (lowerWickRatio >= 0.6 && bodyRatio <= 0.3 && upperWickRatio <= 0.2) {
      pattern = 'PIN_BAR_BULLISH';
      confidence = 0.85;
    } else if (upperWickRatio >= 0.6 && bodyRatio <= 0.3 && lowerWickRatio <= 0.2) {
      pattern = 'PIN_BAR_BEARISH';
      confidence = 0.85;
    } else if (
      curr.close > curr.open &&
      prev.close < prev.open &&
      curr.open <= prev.close &&
      curr.close > prev.open &&
      body > prevBody * 1.1
    ) {
      pattern = 'BULLISH_ENGULFING';
      confidence = 0.82;
    } else if (
      curr.close < curr.open &&
      prev.close > prev.open &&
      curr.open >= prev.close &&
      curr.close < prev.open &&
      body > prevBody * 1.1
    ) {
      pattern = 'BEARISH_ENGULFING';
      confidence = 0.82;
    } else if (curr.high <= prev.high && curr.low >= prev.low) {
      pattern = 'INSIDE_BAR';
      confidence = 0.6;
    } else if (bodyRatio >= 0.75 && totalRange > prevRange * 1.5) {
      pattern = `DISPLACEMENT_${candleDir}`;
      confidence = 0.88;
    } else if (bodyRatio >= 0.65 && (closeLocation >= 0.85 || closeLocation <= 0.15)) {
      pattern = `MOMENTUM_${candleDir}`;
      confidence = 0.78;
    } else if (upperWickRatio >= 0.5) {
      pattern = 'BEARISH_REJECTION_WICK';
      confidence = 0.75;
    } else if (lowerWickRatio >= 0.5) {
      pattern = 'BULLISH_REJECTION_WICK';
      confidence = 0.75;
    }

    return {
      pattern,
      direction: candleDir as any,
      bodyRatio: Number(bodyRatio.toFixed(3)),
      upperWickRatio: Number(upperWickRatio.toFixed(3)),
      lowerWickRatio: Number(lowerWickRatio.toFixed(3)),
      range: Number(totalRange.toFixed(6)),
      closeLocation: Number(closeLocation.toFixed(3)),
      confidence: Number(confidence.toFixed(2))
    };
  }

  private classifyRegime(candles: Candle[]): MarketRegime {
    if (candles.length < 20) return 'UNCERTAIN';
    const recent = candles.slice(-20);
    const closes = recent.map((c) => c.close);
    const smaFast = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const smaSlow = closes.reduce((a, b) => a + b, 0) / 20;

    let trs: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const tr = Math.max(
        recent[i].high - recent[i].low,
        Math.abs(recent[i].high - recent[i - 1].close),
        Math.abs(recent[i].low - recent[i - 1].close)
      );
      trs.push(tr);
    }
    const atr = trs.reduce((a, b) => a + b, 0) / trs.length || 0.0001;
    const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
    const atrPct = (atr / avgPrice) * 100;

    // Linear regression slope
    const n = closes.length;
    const xMean = (n - 1) / 2;
    const yMean = avgPrice;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (closes[i] - yMean);
      den += Math.pow(i - xMean, 2);
    }
    const slope = den !== 0 ? num / den : 0;
    const slopePct = ((slope * n) / avgPrice) * 100;

    if (atrPct > 0.35) return 'HIGH_VOLATILITY';
    if (atrPct < 0.03) return 'LOW_VOLATILITY';
    if (slopePct > 0.08 && smaFast > smaSlow) return 'TREND_UP';
    if (slopePct < -0.08 && smaFast < smaSlow) return 'TREND_DOWN';
    if (Math.abs(slopePct) <= 0.05) return 'RANGE';

    return 'UNCERTAIN';
  }

  private evaluateTrend(candles: Candle[], structTrend: string): string {
    if (candles.length < 15) return 'UNCERTAIN';
    const recent10 = candles.slice(-10);
    const bullCount = recent10.filter((c) => c.close > c.open).length;
    const bearCount = recent10.filter((c) => c.close < c.open).length;

    if (structTrend === 'BULLISH' && bullCount >= 5) return 'BULLISH';
    if (structTrend === 'BEARISH' && bearCount >= 5) return 'BEARISH';
    if (structTrend === 'RANGE' || Math.abs(bullCount - bearCount) <= 1) return 'RANGE';
    return structTrend || 'UNCERTAIN';
  }
}
