export interface MarketTick {
  asset: string;
  timestamp: number;
  price: number;
  volume?: number;
}

export interface Candle {
  id: string;
  asset: string;
  timeframe: number; // in seconds (60, 300, 900)
  timestamp: number; // opening time in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export type MarketRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';

export interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HIGH' | 'LOW';
  classification?: 'HH' | 'HL' | 'LH' | 'LL' | 'HIGH' | 'LOW';
}

export interface LiquidityZone {
  id: string;
  type: 'EQUAL_HIGH' | 'EQUAL_LOW' | 'SWING_HIGH' | 'SWING_LOW' | 'BUY_SIDE' | 'SELL_SIDE';
  price: number;
  timestamp: number;
  strength: number;
  swept: boolean;
  sweepDirection?: 'BULLISH_SWEEP' | 'BEARISH_SWEEP';
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  timestamp: number;
  strength: number;
  fresh: boolean;
  mitigated: boolean;
  displacementScore: number;
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  upper: number;
  lower: number;
  size: number;
  timestamp: number;
  fresh: boolean;
  touched: boolean;
  mitigated: boolean;
}

export interface CandlePatternResult {
  pattern: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DOJI';
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  range: number;
  closeLocation: number;
  confidence: number;
}

export interface SMCFeatureVector {
  asset: string;
  timestamp: number;
  timeframe: number;
  trend: 'BULLISH' | 'BEARISH' | 'RANGE' | 'UNCERTAIN';
  bos: boolean;
  choch: boolean;
  liquiditySweep: boolean;
  liquidityType: string | null;
  bullishOB: boolean;
  bearishOB: boolean;
  bullishFVG: boolean;
  bearishFVG: boolean;
  fvgFresh: boolean;
  obFresh: boolean;
  candlePattern: string;
  displacement: number;
  wickRatio: number;
  volatility: number;
  regime: MarketRegime;
  confluenceScore: number;
  evidence: string[];
  /** Mistral vision scan verdict merged into this feature vector (absent when no fresh scan). */
  visionSignal?: 'UP' | 'DOWN' | 'NONE';
  visionConfidence?: number;
  visionEvidence?: string[];
  /** QuickFire bootstrap mode: fewer candles than the full SMC engine needs, so the
   *  feature vector carries last-candle wick/body, quick sweep, round-number and
   *  momentum evidence (plus the merged Mistral vision verdict) instead. */
  bootstrapMode?: boolean;
  quickDirection?: 'UP' | 'DOWN' | 'NONE';
  quickScore?: number;
  roundNumberLevel?: number | null;
  /** Seconds elapsed since the current (open) candle started — the signal
   *  timing gate: late-candle evidence is too stale to target the next candle. */
  candleAgeSec?: number;
}

/** Structured result of one Mistral visual chart scan. */
export interface VisionScan {
  id: string;
  asset: string;
  timestamp: number;
  source: 'EXTENSION_CAPTURE' | 'MANUAL_UPLOAD';
  /** Thumbnail of the scanned chart (small dataURL, for the UI gallery). */
  thumbnail?: string;
  priceAtScan?: number;
  model?: string;
  /* Extracted chart data */
  trend: string;
  momentum: string;
  volatility: string;
  structure: string;
  patterns: string[];
  support: number | null;
  resistance: number | null;
  candleRead: string;
  /* Verdict */
  signal: 'UP' | 'DOWN' | 'NONE';
  confidence: number;
  reasoning: string[];
}

/** Outcome bookkeeping for a settled vision prediction (self-training loop). */
export interface VisionOutcomeRecord {
  scanId: string;
  asset: string;
  timestamp: number;
  predicted: 'UP' | 'DOWN';
  actual: 'UP' | 'DOWN' | 'DRAW';
  correct: boolean;
}

export interface SMCRawDetails {
  structure: {
    trend: string;
    bos: boolean;
    choch: boolean;
    lastSwingHigh: number | null;
    lastSwingLow: number | null;
    swings: SwingPoint[];
  };
  liquidity: {
    activeZones: LiquidityZone[];
    sweep: boolean;
    sweepType: string | null;
    sweepPrice: number | null;
    rejectionAfterSweep: boolean;
  };
  orderBlocks: {
    allOBs: OrderBlock[];
    activeBullishOB: OrderBlock | null;
    activeBearishOB: OrderBlock | null;
    hasFreshBullishOB: boolean;
    hasFreshBearishOB: boolean;
  };
  fvg: {
    allFVGs: FairValueGap[];
    activeBullish: FairValueGap | null;
    activeBearish: FairValueGap | null;
    bullishCount: number;
    bearishCount: number;
  };
  pattern: CandlePatternResult;
  regime: MarketRegime;
  trend: string;
  confluenceScore: number;
  evidence: string[];
}
