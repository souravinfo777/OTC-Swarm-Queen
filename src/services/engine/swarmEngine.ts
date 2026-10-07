import {
  WorkerDNA,
  WorkerFly,
  WorkerDecision,
  QueenSignal,
  GraveyardRecord,
  PatternMemoryItem,
  PaperStatistics
} from '../../types/swarm';
import { SMCFeatureVector, SMCRawDetails, MarketRegime } from '../../types/market';

export class SwarmEngine {
  public workers: WorkerFly[] = [];
  public graveyard: GraveyardRecord[] = [];
  public patterns: Map<string, PatternMemoryItem> = new Map();
  public lastQueenSignal: QueenSignal | null = null;
  public minConsensus = 0.60;
  public minQueenConfidence = 0.70;
  public minPaperTradesValidation = 200;
  public cooldownSeconds = 45;
  private lastSignalTime = 0;

  constructor(populationSize = 20) {
    this.initializeSwarm(populationSize);
  }

  public initializeSwarm(size = 20) {
    const ARCHETYPES = [
      'Liquidity Hunter',
      'OB Specialist',
      'FVG Scalper',
      'Structure Breakout',
      'Conservative Guard',
      'Reversal Pin Bar',
      'Momentum Impulse'
    ];

    this.workers = [];
    for (let i = 1; i <= size; i++) {
      const arch = ARCHETYPES[(i - 1) % ARCHETYPES.length];
      const baseVotes = 15 + ((i * 3) % 10);
      const baseAgree = Math.floor(baseVotes * (0.50 + ((i * 7) % 35) / 100));
      const cRate = Number((baseAgree / baseVotes).toFixed(2));
      const repCount = i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      const gen = 1 + repCount;
      const eff = Math.max(15, Math.min(98, Math.round(cRate * 55 + 30 - repCount * 10)));

      this.workers.push({
        id: i,
        generation: gen,
        health: Math.max(30, 100 - repCount * 25),
        fitness: Number((0.45 + (cRate * 0.4)).toFixed(3)),
        status: 'ACTIVE',
        totalSignals: baseVotes,
        wins: Math.floor(baseAgree * 0.65),
        losses: Math.floor(baseAgree * 0.35),
        holds: 0,
        consecutiveLosses: 0,
        consecutiveHolds: 0,
        winRate: Number((0.55 + ((i % 4) * 0.05)).toFixed(2)),
        dna: this.createDiverseDNA(i),
        lastDecision: null,
        recentOutcomes: [],
        failurePatterns: [],
        consensusVotes: baseAgree,
        totalVotes: baseVotes,
        consensusRate: cRate,
        replacementCount: repCount,
        efficiencyScore: eff,
        archetype: arch
      });

      // Stagger initial vision trust so the swarm starts with diverse opinions about
      // the Mistral vision layer; outcome training individualizes it per fly.
      this.workers[i - 1].dna.visionWeight = Number((0.35 + ((i * 13) % 40) / 100).toFixed(2));
    }
  }

  private createDiverseDNA(index: number): WorkerDNA {
    const archetype = index % 7;
    const r = (min: number, max: number) => Number((min + Math.random() * (max - min)).toFixed(2));

    if (archetype === 0) { // Liquidity Hunter
      return {
        version: 1,
        liquidityWeight: r(0.85, 0.98),
        orderBlockWeight: r(0.60, 0.75),
        fvgWeight: r(0.40, 0.60),
        structureWeight: r(0.65, 0.80),
        candleWeight: r(0.70, 0.85),
        trendWeight: r(0.40, 0.60),
        displacementWeight: r(0.50, 0.70),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.55, 0.70),
        preferredRegime: index % 2 === 0 ? 'RANGE' : 'ALL',
        maxRiskScore: 0.85,
        confirmationRequired: true
      };
    } else if (archetype === 1) { // Order Block Purist
      return {
        version: 1,
        liquidityWeight: r(0.50, 0.65),
        orderBlockWeight: r(0.85, 0.98),
        fvgWeight: r(0.60, 0.75),
        structureWeight: r(0.70, 0.85),
        candleWeight: r(0.55, 0.70),
        trendWeight: r(0.70, 0.90),
        displacementWeight: r(0.80, 0.95),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.60, 0.75),
        preferredRegime: 'TREND',
        maxRiskScore: 0.85,
        confirmationRequired: true
      };
    } else if (archetype === 2) { // FVG Scalper
      return {
        version: 1,
        liquidityWeight: r(0.55, 0.70),
        orderBlockWeight: r(0.60, 0.75),
        fvgWeight: r(0.88, 0.98),
        structureWeight: r(0.60, 0.75),
        candleWeight: r(0.60, 0.75),
        trendWeight: r(0.65, 0.80),
        displacementWeight: r(0.70, 0.85),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.55, 0.70),
        preferredRegime: 'TREND',
        maxRiskScore: 0.85,
        confirmationRequired: false
      };
    } else if (archetype === 3) { // Structure / BOS Breakout
      return {
        version: 1,
        liquidityWeight: r(0.60, 0.75),
        orderBlockWeight: r(0.65, 0.80),
        fvgWeight: r(0.50, 0.65),
        structureWeight: r(0.90, 0.99),
        candleWeight: r(0.65, 0.80),
        trendWeight: r(0.85, 0.98),
        displacementWeight: r(0.75, 0.90),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.65, 0.78),
        preferredRegime: 'TREND',
        maxRiskScore: 0.85,
        confirmationRequired: true
      };
    } else if (archetype === 4) { // Conservative Queen Guard
      return {
        version: 1,
        liquidityWeight: r(0.75, 0.88),
        orderBlockWeight: r(0.80, 0.92),
        fvgWeight: r(0.75, 0.88),
        structureWeight: r(0.80, 0.92),
        candleWeight: r(0.75, 0.88),
        trendWeight: r(0.80, 0.92),
        displacementWeight: r(0.75, 0.88),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.72, 0.85),
        preferredRegime: 'ALL',
        maxRiskScore: 0.85,
        confirmationRequired: true
      };
    } else if (archetype === 5) { // Reversal & Pin Bar
      return {
        version: 1,
        liquidityWeight: r(0.85, 0.95),
        orderBlockWeight: r(0.55, 0.70),
        fvgWeight: r(0.45, 0.60),
        structureWeight: r(0.55, 0.70),
        candleWeight: r(0.90, 0.99),
        trendWeight: r(0.35, 0.55),
        displacementWeight: r(0.50, 0.65),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.55, 0.68),
        preferredRegime: 'RANGE',
        maxRiskScore: 0.85,
        confirmationRequired: true
      };
    } else { // Momentum / Displacement
      return {
        version: 1,
        liquidityWeight: r(0.60, 0.75),
        orderBlockWeight: r(0.70, 0.85),
        fvgWeight: r(0.70, 0.85),
        structureWeight: r(0.70, 0.85),
        candleWeight: r(0.70, 0.85),
        trendWeight: r(0.75, 0.90),
        displacementWeight: r(0.88, 0.98),
        visionWeight: r(0.35, 0.60),
        minConfluence: r(0.60, 0.72),
        preferredRegime: 'HIGH_VOLATILITY',
        maxRiskScore: 0.85,
        confirmationRequired: false
      };
    }
  }

  public evaluateWorker(worker: WorkerFly, fv: SMCFeatureVector): WorkerDecision {
    const holdDecision = (decision: WorkerDecision): WorkerDecision => {
      // Early-return HOLDs must still update lastDecision, otherwise training
      // (adaptVisionWeights / settleTradeOutcomes) and the UI attribute this round's
      // outcome to a stale vote from a previous candle.
      worker.lastDecision = decision;
      return decision;
    };

    if (worker.health <= 0 || worker.status === 'DEAD') {
      worker.status = 'DEAD';
      return holdDecision({
        workerId: worker.id,
        decision: 'HOLD',
        confidence: 0,
        evidence: ['WORKER_DEAD'],
        dnaVersion: worker.dna.version,
        reason: 'Worker is dead awaiting rebirth.'
      });
    }

    // Regime mismatch filter
    if (worker.dna.preferredRegime !== 'ALL') {
      if (worker.dna.preferredRegime === 'TREND' && fv.regime !== 'TREND_UP' && fv.regime !== 'TREND_DOWN') {
        worker.holds++;
        worker.consecutiveHolds++;
        return holdDecision({
          workerId: worker.id,
          decision: 'HOLD',
          confidence: 0.35,
          evidence: ['REGIME_MISMATCH_NON_TREND'],
          dnaVersion: worker.dna.version,
          reason: `Regime ${fv.regime} does not match worker preferred TREND regime.`
        });
      }
      if (worker.dna.preferredRegime === 'RANGE' && fv.regime !== 'RANGE') {
        worker.holds++;
        worker.consecutiveHolds++;
        return holdDecision({
          workerId: worker.id,
          decision: 'HOLD',
          confidence: 0.35,
          evidence: ['REGIME_MISMATCH_NON_RANGE'],
          dnaVersion: worker.dna.version,
          reason: `Regime ${fv.regime} does not match worker preferred RANGE regime.`
        });
      }
    }

    // Confluence threshold filter
    const normConf = fv.confluenceScore / 100;
    // Thin-chart (QuickFire bootstrap) mode scales the DNA confluence gate down:
    // on a chart with <20 candles the full SMC score can never reach the 55-85%
    // thresholds the flies evolved with, so they would HOLD forever and the
    // swarm would never actually participate in the signal.
    const minConfNeeded = fv.bootstrapMode
      ? worker.dna.minConfluence * 0.55
      : worker.dna.minConfluence;
    if (normConf < minConfNeeded) {
      worker.holds++;
      worker.consecutiveHolds++;
      return holdDecision({
        workerId: worker.id,
        decision: 'HOLD',
        confidence: Number(normConf.toFixed(2)),
        evidence: [`CONFLUENCE_BELOW_MIN_${Math.round(minConfNeeded * 100)}`],
        dnaVersion: worker.dna.version,
        reason: `Confluence ${fv.confluenceScore} is below worker threshold of ${Math.round(minConfNeeded * 100)}.`
      });
    }

    let bullScore = 0;
    let bearScore = 0;
    const bullEv: string[] = [];
    const bearEv: string[] = [];

    // Liquidity Sweeps
    if (fv.liquiditySweep) {
      if (fv.liquidityType === 'SELL_SIDE_SWEPT') {
        bullScore += worker.dna.liquidityWeight * 25;
        bullEv.push('SELL_SIDE_LIQUIDITY_SWEEP');
      } else if (fv.liquidityType === 'BUY_SIDE_SWEPT') {
        bearScore += worker.dna.liquidityWeight * 25;
        bearEv.push('BUY_SIDE_LIQUIDITY_SWEEP');
      }
    }

    // Order Blocks
    if (fv.bullishOB) {
      bullScore += worker.dna.orderBlockWeight * 25 * (fv.obFresh ? 1.2 : 0.8);
      bullEv.push('BULLISH_ORDER_BLOCK');
    }
    if (fv.bearishOB) {
      bearScore += worker.dna.orderBlockWeight * 25 * (fv.obFresh ? 1.2 : 0.8);
      bearEv.push('BEARISH_ORDER_BLOCK');
    }

    // FVGs
    if (fv.bullishFVG) {
      bullScore += worker.dna.fvgWeight * 20 * (fv.fvgFresh ? 1.2 : 0.8);
      bullEv.push('BULLISH_FVG');
    }
    if (fv.bearishFVG) {
      bearScore += worker.dna.fvgWeight * 20 * (fv.fvgFresh ? 1.2 : 0.8);
      bearEv.push('BEARISH_FVG');
    }

    // Market Structure
    if (fv.trend === 'BULLISH') {
      bullScore += worker.dna.trendWeight * 15;
      bullEv.push('BULLISH_TREND');
      if (fv.bos) {
        bullScore += worker.dna.structureWeight * 15;
        bullEv.push('BULLISH_BOS');
      }
    } else if (fv.trend === 'BEARISH') {
      bearScore += worker.dna.trendWeight * 15;
      bearEv.push('BEARISH_TREND');
      if (fv.bos) {
        bearScore += worker.dna.structureWeight * 15;
        bearEv.push('BEARISH_BOS');
      }
    }

    // Candle patterns
    if (fv.candlePattern.includes('BULLISH')) {
      bullScore += worker.dna.candleWeight * 15;
      bullEv.push(`CANDLE_${fv.candlePattern}`);
    } else if (fv.candlePattern.includes('BEARISH')) {
      bearScore += worker.dna.candleWeight * 15;
      bearEv.push(`CANDLE_${fv.candlePattern}`);
    }

    // Mistral vision scan verdict — every fly receives the same vision data but weighs
    // it through its own trained dna.visionWeight.
    if (fv.visionSignal && fv.visionSignal !== 'NONE' && (fv.visionConfidence ?? 0) > 0.30) {
      const vScore = worker.dna.visionWeight * 22 * Math.min(1, fv.visionConfidence ?? 0.5);
      if (fv.visionSignal === 'UP') {
        bullScore += vScore;
        bullEv.push('MISTRAL_VISION_UP');
        (fv.visionEvidence || []).forEach((e) => e !== 'VISION_UP' && bullEv.push(e));
      } else {
        bearScore += vScore;
        bearEv.push('MISTRAL_VISION_DOWN');
        (fv.visionEvidence || []).forEach((e) => e !== 'VISION_DOWN' && bearEv.push(e));
      }
    }

    const diff = Math.abs(bullScore - bearScore);
    const threshold = 30 * worker.dna.minConfluence;

    let decision: 'UP' | 'DOWN' | 'HOLD' = 'HOLD';
    let confidence = 0.40;
    let evidence = ['INDECISIVE_SMC_TALLY'];
    let reason = `Bull (${bullScore.toFixed(1)}) and Bear (${bearScore.toFixed(1)}) balanced.`;

    if (bullScore > bearScore && diff >= threshold) {
      decision = 'UP';
      confidence = Math.min(0.95, Number((0.55 + bullScore / 160).toFixed(2)));
      evidence = bullEv;
      reason = `Bullish evidence (${bullScore.toFixed(1)}) significantly outweighed bearish (${bearScore.toFixed(1)}).`;
      worker.totalSignals++;
      worker.consecutiveHolds = 0;
    } else if (bearScore > bullScore && diff >= threshold) {
      decision = 'DOWN';
      confidence = Math.min(0.95, Number((0.55 + bearScore / 160).toFixed(2)));
      evidence = bearEv;
      reason = `Bearish evidence (${bearScore.toFixed(1)}) significantly outweighed bullish (${bullScore.toFixed(1)}).`;
      worker.totalSignals++;
      worker.consecutiveHolds = 0;
    } else {
      worker.holds++;
      worker.consecutiveHolds++;
    }

    const result: WorkerDecision = {
      workerId: worker.id,
      decision,
      confidence,
      evidence,
      dnaVersion: worker.dna.version,
      reason
    };
    worker.lastDecision = result;
    return result;
  }

  public evaluateSwarm(
    fv: SMCFeatureVector,
    raw: SMCRawDetails,
    paperStats?: PaperStatistics,
    isDataStale = false
  ): { queen: QueenSignal; decisions: WorkerDecision[] } {
    const decisions = this.workers.map((w) => this.evaluateWorker(w, fv));
    // Signal timing gate: in the closing seconds of the running candle the quick
    // evidence is about to be replaced by a fresh candle — hold the signal and
    // re-arm at the next candle open so entries always target a full candle.
    // Scale the gate with the actual candle duration (60s M1, 300s M5, 900s M15).
    const candleSeconds = fv.timeframe && fv.timeframe > 0 ? fv.timeframe : 60;
    const lateInCandle = typeof fv.candleAgeSec === 'number' && fv.candleAgeSec > candleSeconds * (52 / 60);
    const now = Date.now();

    const quickFireActive = !!(
      fv.quickDirection && fv.quickDirection !== 'NONE' &&
      !isDataStale && (fv.bootstrapMode || (fv.quickScore ?? 0) >= 0.6)
    );
    if (isDataStale || (fv.trend === 'UNCERTAIN' && fv.confluenceScore < 20 && !quickFireActive)) {
      const q: QueenSignal = {
        timestamp: now,
        asset: fv.asset,
        direction: 'HOLD',
        confidence: 0,
        consensus: 0,
        status: 'NO_SIGNAL',
        upVotes: 0,
        downVotes: 0,
        holdVotes: this.workers.length,
        totalWorkers: this.workers.length,
        evidence: ['DATA_STALE_OR_INCOMPLETE'],
        cooldownRemaining: 0,
        reasons: ['Market data is stale or incomplete. Queen fails safely with NO_SIGNAL.']
      };
      this.lastQueenSignal = q;
      return { queen: q, decisions };
    }

    const upVotes = decisions.filter((d) => d.decision === 'UP');
    const downVotes = decisions.filter((d) => d.decision === 'DOWN');
    const holdVotes = decisions.filter((d) => d.decision === 'HOLD');

    // Reliability-weighted score
    let weightedUp = 0;
    let weightedDown = 0;

    upVotes.forEach((d) => {
      const w = this.workers.find((x) => x.id === d.workerId);
      const weight = w ? w.fitness * 0.6 + (w.health / 100) * 0.4 : 0.5;
      weightedUp += weight * d.confidence;
    });

    downVotes.forEach((d) => {
      const w = this.workers.find((x) => x.id === d.workerId);
      const weight = w ? w.fitness * 0.6 + (w.health / 100) * 0.4 : 0.5;
      weightedDown += weight * d.confidence;
    });

    const totalWeight = weightedUp + weightedDown;
    const consUp = upVotes.length / this.workers.length;
    const consDown = downVotes.length / this.workers.length;

    let dominantDir: 'UP' | 'DOWN' | 'HOLD' = 'HOLD';
    let consensus = 0;
    let confidence = 0;
    const reasons: string[] = [];
    const queenEv: string[] = [];

    if (weightedUp > weightedDown && consUp >= this.minConsensus) {
      dominantDir = 'UP';
      consensus = consUp;
      const ratio = totalWeight > 0 ? weightedUp / totalWeight : 0.5;
      confidence = Number((0.5 * ratio + 0.5 * (fv.confluenceScore / 100)).toFixed(2));
      upVotes.forEach((d) => d.evidence.forEach((e) => !queenEv.includes(e) && queenEv.push(e)));
      reasons.push(`${upVotes.length} of ${this.workers.length} workers voted UP with consensus ${Math.round(consUp * 100)}%.`);
      reasons.push(`SMC Confluence Score is ${fv.confluenceScore}/100.`);
    } else if (weightedDown > weightedUp && consDown >= this.minConsensus) {
      dominantDir = 'DOWN';
      consensus = consDown;
      const ratio = totalWeight > 0 ? weightedDown / totalWeight : 0.5;
      confidence = Number((0.5 * ratio + 0.5 * (fv.confluenceScore / 100)).toFixed(2));
      downVotes.forEach((d) => d.evidence.forEach((e) => !queenEv.includes(e) && queenEv.push(e)));
      reasons.push(`${downVotes.length} of ${this.workers.length} workers voted DOWN with consensus ${Math.round(consDown * 100)}%.`);
      reasons.push(`SMC Confluence Score is ${fv.confluenceScore}/100.`);
    } else {
      dominantDir = 'HOLD';
      consensus = Math.max(consUp, consDown);
      confidence = Number(((fv.confluenceScore / 100) * 0.4).toFixed(2));
      reasons.push(`Consensus threshold (${Math.round(this.minConsensus * 100)}%) not met: UP=${upVotes.length}, DOWN=${downVotes.length}, HOLD=${holdVotes.length}.`);
    }

    // QuickFire verdict: the Queen acts on immediate candle evidence (last candle
    // wick/body, quick sweep, round numbers, momentum) plus the Mistral vision
    // verdict — on thin charts whenever a direction forms, and on full charts when
    // the quick evidence is strong (score >= 0.6, e.g. sweep + rejection candle).
    if (
      dominantDir === 'HOLD' &&
      fv.quickDirection &&
      fv.quickDirection !== 'NONE' &&
      !isDataStale &&
      !lateInCandle &&
      (fv.bootstrapMode || (fv.quickScore ?? 0) >= 0.6)
    ) {
      const visionAgrees = fv.visionSignal === fv.quickDirection && (fv.visionConfidence ?? 0) > 0.3;
      const visionDisagrees = fv.visionSignal && fv.visionSignal !== 'NONE' && fv.visionSignal !== fv.quickDirection;
      const quickConf = Math.max(0.55, Math.min(
        0.85,
        0.5 + (fv.quickScore ?? 0) * 0.25 + (visionAgrees ? 0.2 : visionDisagrees ? -0.1 : 0)
      ));
      dominantDir = fv.quickDirection;
      consensus = Number(Math.min(0.95, 0.35 + (fv.quickScore ?? 0) * 0.4 + (visionAgrees ? 0.15 : 0)).toFixed(2));
      confidence = Number(quickConf.toFixed(2));
      reasons.push(`QUICKFIRE: immediate ${dominantDir} from thin-chart evidence (quick score ${(fv.quickScore ?? 0).toFixed(2)}${visionAgrees ? ', Mistral vision agrees' : visionDisagrees ? ', Mistral vision disagrees — confidence reduced' : ''}).`);
      // Surface the exact candle factors that drove this verdict so the user can
      // see WHAT confirmed the signal (wick/body, sweep, round numbers, momentum).
      (fv.evidence || []).forEach((e) => {
        if (e && e !== 'QUICKFIRE_MODE' && !queenEv.includes(e)) queenEv.push(e);
      });
      if (fv.visionEvidence?.length) {
        fv.visionEvidence.forEach((e) => !queenEv.includes(e) && queenEv.push(e));
      }
    } else if (
      dominantDir === 'HOLD' &&
      lateInCandle &&
      fv.quickDirection &&
      fv.quickDirection !== 'NONE' &&
      (fv.bootstrapMode || (fv.quickScore ?? 0) >= 0.6)
    ) {
      // QuickFire had a direction but the candle is about to close — hold it.
      reasons.push(`Candle timing: only ${60 - (fv.candleAgeSec ?? 0)}s left in this candle — QuickFire ${fv.quickDirection} re-arms at the next candle open.`);
    }

    const elapsed = (now - this.lastSignalTime) / 1000;
    const cooldownRemaining = Math.max(0, Math.round(this.cooldownSeconds - elapsed));

    let status: 'NO_SIGNAL' | 'WATCH' | 'PAPER_SIGNAL' | 'VALIDATED_SIGNAL' | 'QUICK_SIGNAL' = 'NO_SIGNAL';
    if (dominantDir !== 'HOLD') {
      if (cooldownRemaining > 0) {
        status = 'WATCH';
        reasons.push(`In signal cooldown (${cooldownRemaining}s remaining).`);
      } else if (lateInCandle) {
        status = 'WATCH';
      } else if (confidence < this.minQueenConfidence) {
        if (fv.bootstrapMode && confidence >= 0.55) {
          // Bootstrap tier: thin chart, immediate candle+vision evidence — emit the
          // signal now at a lower confidence instead of waiting 20 minutes.
          status = 'QUICK_SIGNAL';
          reasons.push(`QuickFire tier: confidence ${Math.round(confidence * 100)}% (full Queen tier needs ${Math.round(this.minQueenConfidence * 100)}%).`);
        } else {
          status = 'WATCH';
          reasons.push(`Confidence (${Math.round(confidence * 100)}%) below Queen threshold (${Math.round(this.minQueenConfidence * 100)}%).`);
        }
      } else {
        status = 'PAPER_SIGNAL';
        const totalTrades = paperStats?.totalTrades || 0;
        const winRate = paperStats?.winRate || 0;
        if (totalTrades >= this.minPaperTradesValidation && winRate >= 0.60) {
          status = 'VALIDATED_SIGNAL';
          reasons.push(`Swarm achieved validated status with ${totalTrades} paper trades and ${Math.round(winRate * 100)}% win rate.`);
        } else {
          reasons.push(`Paper trade signal ready. Total paper trades (${totalTrades}/${this.minPaperTradesValidation}) needed for validated tier.`);
        }
      }
    }

    const queen: QueenSignal = {
      timestamp: now,
      asset: fv.asset,
      direction: dominantDir,
      confidence,
      consensus: Number(consensus.toFixed(2)),
      status,
      upVotes: upVotes.length,
      downVotes: downVotes.length,
      holdVotes: holdVotes.length,
      totalWorkers: this.workers.length,
      evidence: queenEv.slice(0, 8),
      cooldownRemaining,
      reasons
    };

    // Update worker consensus contribution and efficiency metrics
    this.workers.forEach((w) => {
      const dec = decisions.find((d) => d.workerId === w.id);
      if (dominantDir !== 'HOLD') {
        w.totalVotes = (w.totalVotes || 0) + 1;
        if (dec && dec.decision === dominantDir) {
          w.consensusVotes = (w.consensusVotes || 0) + 1;
        }
        w.consensusRate = w.totalVotes > 0 ? Number((w.consensusVotes / w.totalVotes).toFixed(2)) : 0.5;
      }
      const churnPenalty = Math.min(30, (w.replacementCount || 0) * 8);
      const healthBonus = (w.health / 100) * 20;
      const agreementScore = (w.consensusRate || 0.5) * 50;
      const winScore = (w.winRate || 0.5) * 30;
      w.efficiencyScore = Math.max(5, Math.min(100, Math.round(agreementScore + winScore + healthBonus - churnPenalty)));
    });

    this.lastQueenSignal = queen;
    return { queen, decisions };
  }

  private lastDispatchFv: SMCFeatureVector | null = null;

  public recordSignalDispatched(fv?: SMCFeatureVector) {
    this.lastSignalTime = Date.now();
    // Snapshot the feature vector that produced the dispatched signal — QuickFire
    // signals have no directional worker votes, so the outcome is later attributed
    // by re-scoring every fly's DNA against THIS vector.
    if (fv) this.lastDispatchFv = fv;
  }

  public getLastDispatchFv(): SMCFeatureVector | null {
    return this.lastDispatchFv;
  }

  /**
   * DNA-weighted effective vote of a fly against a stored feature vector — used for
   * QuickFire outcome attribution where the flies' actual lastDecision was HOLD.
   * Mirrors evaluateWorker's scoring (liquidity, OB, FVG, trend/BOS, candle
   * pattern, vision) without the entry gates or side effects.
   */
  private scoreWorkerDNAEffective(worker: WorkerFly, fv: SMCFeatureVector): 'UP' | 'DOWN' | 'HOLD' {
    let bull = 0;
    let bear = 0;
    if (fv.liquiditySweep) {
      if (fv.liquidityType === 'SELL_SIDE_SWEPT') bull += worker.dna.liquidityWeight * 25;
      else if (fv.liquidityType === 'BUY_SIDE_SWEPT') bear += worker.dna.liquidityWeight * 25;
    }
    if (fv.bullishOB) bull += worker.dna.orderBlockWeight * 25 * (fv.obFresh ? 1.2 : 0.8);
    if (fv.bearishOB) bear += worker.dna.orderBlockWeight * 25 * (fv.obFresh ? 1.2 : 0.8);
    if (fv.bullishFVG) bull += worker.dna.fvgWeight * 20 * (fv.fvgFresh ? 1.2 : 0.8);
    if (fv.bearishFVG) bear += worker.dna.fvgWeight * 20 * (fv.fvgFresh ? 1.2 : 0.8);
    if (fv.trend === 'BULLISH') {
      bull += worker.dna.trendWeight * 15;
      if (fv.bos) bull += worker.dna.structureWeight * 15;
    } else if (fv.trend === 'BEARISH') {
      bear += worker.dna.trendWeight * 15;
      if (fv.bos) bear += worker.dna.structureWeight * 15;
    }
    if (fv.candlePattern.includes('BULLISH')) bull += worker.dna.candleWeight * 15;
    else if (fv.candlePattern.includes('BEARISH')) bear += worker.dna.candleWeight * 15;
    if (fv.visionSignal && fv.visionSignal !== 'NONE' && (fv.visionConfidence ?? 0) > 0.30) {
      const vScore = worker.dna.visionWeight * 22 * Math.min(1, fv.visionConfidence ?? 0.5);
      if (fv.visionSignal === 'UP') bull += vScore;
      else bear += vScore;
    }
    if (bull > bear * 1.15) return 'UP';
    if (bear > bull * 1.15) return 'DOWN';
    return 'HOLD';
  }

  /**
   * Per-fly vision training: when a candle closes, every fly that actually followed the
   * Mistral vision cue adjusts its own dna.visionWeight — reinforced when the vision was
   * right, penalized when it was wrong. Flies that ignored the vision cue keep their weight.
   */
  public adaptVisionWeights(visionSignal: 'UP' | 'DOWN' | null, actual: 'UP' | 'DOWN' | 'DRAW'): number {
    if (!visionSignal || actual === 'DRAW') return 0;
    const visionWasRight = visionSignal === actual;
    let trained = 0;
    this.workers.forEach((w) => {
      if (w.status === 'DEAD') return;
      const followed = w.lastDecision && w.lastDecision.decision === visionSignal;
      if (!followed) return;
      const cur = w.dna.visionWeight ?? 0.5;
      const delta = visionWasRight ? 0.03 : -0.04;
      w.dna.visionWeight = Number(Math.max(0.05, Math.min(1.0, cur + delta)).toFixed(3));
      trained++;
    });
    return trained;
  }

  /** Snapshot of trained worker states for persistence across reloads. */
  public exportState(): string {
    return JSON.stringify({
      savedAt: Date.now(),
      workers: this.workers.map((w) => ({
        id: w.id,
        generation: w.generation,
        health: w.health,
        fitness: w.fitness,
        status: w.status,
        totalSignals: w.totalSignals,
        wins: w.wins,
        losses: w.losses,
        holds: w.holds,
        winRate: w.winRate,
        consensusVotes: w.consensusVotes,
        totalVotes: w.totalVotes,
        replacementCount: w.replacementCount,
        dna: w.dna
      }))
    });
  }

  /** Restore trained worker states (DNA weights, health, fitness) from a snapshot. */
  public importState(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.workers)) return false;
      parsed.workers.forEach((saved: any) => {
        const w = this.workers.find((x) => x.id === saved.id);
        if (!w) return;
        w.generation = saved.generation ?? w.generation;
        w.health = typeof saved.health === 'number' ? saved.health : w.health;
        w.fitness = typeof saved.fitness === 'number' ? saved.fitness : w.fitness;
        w.status = saved.status === 'DEAD' ? 'ACTIVE' : saved.status || w.status;
        w.totalSignals = saved.totalSignals ?? w.totalSignals;
        w.wins = saved.wins ?? w.wins;
        w.losses = saved.losses ?? w.losses;
        w.holds = saved.holds ?? w.holds;
        w.winRate = saved.winRate ?? w.winRate;
        w.consensusVotes = saved.consensusVotes ?? w.consensusVotes;
        w.totalVotes = saved.totalVotes ?? w.totalVotes;
        w.replacementCount = saved.replacementCount ?? w.replacementCount;
        if (saved.dna && typeof saved.dna.visionWeight === 'number') {
          w.dna = { ...saved.dna };
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  public settleTradeOutcomes(direction: 'UP' | 'DOWN', result: 'WIN' | 'LOSS' | 'DRAW', regime: MarketRegime, asset: string, evidence: string[], attributionFv?: SMCFeatureVector | null) {
    // Record into Pattern Memory
    const sigKey = evidence.length > 0 ? evidence.slice(0, 4).join('+') : 'UNSTRUCTURED';
    if (!this.patterns.has(sigKey)) {
      this.patterns.set(sigKey, {
        signature: sigKey,
        occurrences: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        preferredRegime: regime,
        asset
      });
    }
    const pat = this.patterns.get(sigKey)!;
    pat.occurrences++;
    if (result === 'WIN') pat.wins++;
    else if (result === 'LOSS') pat.losses++;
    else pat.draws++;
    const tot = pat.wins + pat.losses;
    pat.winRate = tot > 0 ? Number((pat.wins / tot).toFixed(3)) : 0;

    const deadWorkers: WorkerFly[] = [];
    // QuickFire signals carry no directional worker votes (everyone held), so on
    // their settlement each fly's DNA is re-scored against the dispatch-time
    // feature vector: the flies whose DNA AGREED with the signal win/lose with it.
    const useAttribution = Boolean(attributionFv);

    this.workers.forEach((w) => {
      if (w.status === 'DEAD') return;
      const lastD = w.lastDecision;
      let outcome = 'HOLD';
      let effectiveDecision: string | null = lastD ? lastD.decision : null;

      if (useAttribution && attributionFv) {
        effectiveDecision = this.scoreWorkerDNAEffective(w, attributionFv);
      }

      if (effectiveDecision) {
        if (effectiveDecision === direction) outcome = result;
        else if (effectiveDecision === 'HOLD') outcome = 'HOLD';
        else outcome = result === 'WIN' ? 'LOSS' : 'WIN';
      }

      w.recentOutcomes.push(outcome);
      if (w.recentOutcomes.length > 20) w.recentOutcomes.shift();

      if (outcome === 'WIN') {
        w.wins++;
        w.consecutiveLosses = 0;
        w.health = Math.min(100, w.health + 8.0);
      } else if (outcome === 'LOSS') {
        w.losses++;
        w.consecutiveLosses++;
        const penalty = 12.0 + w.consecutiveLosses * 3.0;
        w.health = Math.max(0, w.health - penalty);
        w.failurePatterns.push(`${regime}_${evidence.slice(0, 2).join('-')}`);
        if (w.failurePatterns.length > 10) w.failurePatterns.shift();
      } else if (outcome === 'HOLD') {
        if (w.consecutiveHolds > 15 && w.totalSignals > 5) {
          w.health = Math.max(0, w.health - 1.5);
        }
      }

      // Bayesian smoothed fitness
      const totalTrades = w.wins + w.losses;
      w.winRate = totalTrades > 0 ? Number((w.wins / totalTrades).toFixed(3)) : 0;
      const smoothed = (w.wins + 5) / (totalTrades + 10);
      const recentWins = w.recentOutcomes.filter((o) => o === 'WIN').length;
      const recentRate = w.recentOutcomes.length > 0 ? recentWins / w.recentOutcomes.length : 0.5;
      const streakPen = Math.min(0.25, w.consecutiveLosses * 0.05);
      const healthFactor = w.health / 100;

      w.fitness = Number(Math.max(0.05, Math.min(0.99, 0.45 * smoothed + 0.25 * recentRate + 0.20 * healthFactor - streakPen)).toFixed(3));

      if (w.health <= 0) {
        w.status = 'DEAD';
        deadWorkers.push(w);
      } else if (w.health < 35) {
        w.status = 'WEAK';
      } else {
        w.status = 'ACTIVE';
      }
    });

    // Rebirth & Mutation
    deadWorkers.forEach((dw) => {
      this.rebirthWorker(dw);
    });
  }

  private rebirthWorker(deadWorker: WorkerFly) {
    // 1. Bury in Graveyard
    const graveRecord: GraveyardRecord = {
      recordId: `GRAVE_${deadWorker.id}_${deadWorker.generation}_${Date.now()}`,
      workerId: deadWorker.id,
      generation: deadWorker.generation,
      fitness: deadWorker.fitness,
      winRate: deadWorker.winRate,
      totalTrades: deadWorker.wins + deadWorker.losses,
      deathTimestamp: Date.now(),
      dna: { ...deadWorker.dna },
      failurePatterns: [...deadWorker.failurePatterns],
      notes: `Deceased in Gen ${deadWorker.generation} after consecutive losses.`
    };
    this.graveyard.unshift(graveRecord);
    if (this.graveyard.length > 500) this.graveyard.pop();

    // 2. Tournament selection of fit parent
    const healthy = this.workers.filter((w) => w.health > 40 && w.status !== 'DEAD');
    const parent = healthy.length > 0 ? healthy.reduce((p, c) => (c.fitness > p.fitness ? c : p), healthy[0]) : null;
    const parentDNA = parent ? parent.dna : this.createDiverseDNA(deadWorker.id);

    // 3. Mutate DNA
    const perturb = (val: number, min = 0.1, max = 1.0) => {
      const delta = (Math.random() - 0.5) * 0.16;
      return Number(Math.max(min, Math.min(max, val + delta)).toFixed(2));
    };

    deadWorker.dna = {
      version: parentDNA.version + 1,
      liquidityWeight: perturb(parentDNA.liquidityWeight),
      orderBlockWeight: perturb(parentDNA.orderBlockWeight),
      fvgWeight: perturb(parentDNA.fvgWeight),
      structureWeight: perturb(parentDNA.structureWeight),
      candleWeight: perturb(parentDNA.candleWeight),
      trendWeight: perturb(parentDNA.trendWeight),
      displacementWeight: perturb(parentDNA.displacementWeight),
      visionWeight: perturb(parentDNA.visionWeight ?? 0.5, 0.05, 1.0),
      minConfluence: perturb(parentDNA.minConfluence, 0.40, 0.85),
      preferredRegime: Math.random() < 0.15 ? ['ALL', 'TREND', 'RANGE', 'HIGH_VOLATILITY'][Math.floor(Math.random() * 4)] : parentDNA.preferredRegime,
      maxRiskScore: perturb(parentDNA.maxRiskScore, 0.50, 0.95),
      confirmationRequired: Math.random() < 0.10 ? !parentDNA.confirmationRequired : parentDNA.confirmationRequired
    };

    // 4. Rebirth
    deadWorker.generation++;
    deadWorker.replacementCount = (deadWorker.replacementCount || 0) + 1;
    deadWorker.health = 100;
    deadWorker.fitness = 0.50;
    deadWorker.totalSignals = 0;
    deadWorker.wins = 0;
    deadWorker.losses = 0;
    deadWorker.holds = 0;
    deadWorker.consecutiveLosses = 0;
    deadWorker.consecutiveHolds = 0;
    deadWorker.winRate = 0;
    deadWorker.status = 'ACTIVE';
    deadWorker.recentOutcomes = [];
    deadWorker.failurePatterns = [];
    deadWorker.lastDecision = null;
    const churnPenalty = Math.min(40, deadWorker.replacementCount * 12);
    deadWorker.efficiencyScore = Math.max(10, Math.round((deadWorker.consensusRate || 0.5) * 50 + 20 - churnPenalty));
  }
}
