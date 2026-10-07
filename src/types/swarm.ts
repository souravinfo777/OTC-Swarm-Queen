import { SMCFeatureVector, MarketRegime } from './market';

export interface WorkerDNA {
  version: number;
  liquidityWeight: number;
  orderBlockWeight: number;
  fvgWeight: number;
  structureWeight: number;
  candleWeight: number;
  trendWeight: number;
  displacementWeight: number;
  /** How much this fly trusts the Mistral vision verdict (trained by outcomes, 0.05–1.0). */
  visionWeight: number;
  minConfluence: number;
  preferredRegime: string;
  maxRiskScore: number;
  confirmationRequired: boolean;
}

export interface WorkerDecision {
  workerId: number;
  decision: 'UP' | 'DOWN' | 'HOLD';
  confidence: number;
  evidence: string[];
  dnaVersion: number;
  reason: string;
}

export interface WorkerFly {
  id: number;
  generation: number;
  health: number; // 0 to 100
  fitness: number; // 0 to 1
  status: 'ACTIVE' | 'WEAK' | 'DEAD' | 'REBIRTH_PENDING';
  totalSignals: number;
  wins: number;
  losses: number;
  holds: number;
  consecutiveLosses: number;
  consecutiveHolds: number;
  winRate: number;
  dna: WorkerDNA;
  lastDecision: WorkerDecision | null;
  recentOutcomes: string[];
  failurePatterns: string[];
  consensusVotes: number;
  totalVotes: number;
  consensusRate: number;
  replacementCount: number;
  efficiencyScore: number;
  archetype?: string;
}

export interface QueenSignal {
  timestamp: number;
  asset: string;
  direction: 'UP' | 'DOWN' | 'HOLD';
  confidence: number;
  consensus: number; // 0.0 to 1.0
  status:
    | 'NO_SIGNAL'
    | 'WATCH'
    | 'PAPER_SIGNAL'
    | 'VALIDATED_SIGNAL'
    | 'QUICK_SIGNAL'
    | 'FEED_OFFLINE_HOLD'
    | 'ACCUMULATING_REAL_CANDLES'
    | 'FEED_ERROR_NO_REAL_DATA'
    | 'ACTIVE_SMC'
    // Live per-pair statuses emitted by the Quotex extension
    | 'LIVE_CONSENSUS_SIGNAL'
    | 'SAFE_HOLD_NEUTRAL_MARKET'
    | 'AWAITING_LIVE_TICKS'
    | 'STREAMING_REAL_TICKS'
    | 'SCANNING_MARKET'
    // Not enough real samples yet to judge the market (never a real HOLD verdict).
    | 'WARMING_UP'
    // Higher-timeframe filter suppressed a countertrend signal (deliberate HOLD).
    | 'MTF_CONFLICT_HOLD';
  upVotes: number;
  downVotes: number;
  holdVotes: number;
  totalWorkers: number;
  evidence: string[];
  cooldownRemaining: number;
  reasons: string[];
  nextCandleDirection?: 'CALL (UP)' | 'PUT (DOWN)' | 'HOLD';
  candleExpirySeconds?: number;
  candleExpiryTimer?: string;
  /** Epoch ms when the current 1-minute Quotex candle expires (shared expiry clock). */
  candleCloseAt?: number;
  /** True when the trade entry window (last seconds of the M1 candle) is open. */
  isEntryZone?: boolean;
  optimalRoundNumber?: string;
  roundLevels?: {
    lowerRound: string;
    upperRound: string;
    label: string;
    pipsDiff: string;
    optimalRound: string;
  };
  /** Signal POWER 0..1 reported by the Quotex engine (distance from a coin flip). */
  power?: number;
  /** True while the extension has too few real samples to judge the market. */
  warmingUp?: boolean;
  /** How many samples (M1 candles or live ticks) the live verdict was built from. */
  dataPoints?: number;
  /** Quotex M1 candle key the verdict is locked to — one alert per candle. */
  candleKey?: number;
}

export interface PaperTrade {
  id: string;
  asset: string;
  direction: 'UP' | 'DOWN';
  entryPrice: number;
  exitPrice?: number;
  expirySeconds: number;
  timestamp: number;
  expiryTimestamp: number;
  queenConfidence: number;
  workerVotes: { up: number; down: number; hold: number };
  smcEvidence: string[];
  regime: MarketRegime;
  /** Which Queen tier dispatched this trade — QUICK_SIGNAL trades get DNA
   *  attribution on settlement so the flies that agreed with the quick evidence
   *  learn from the outcome. */
  signalStatus: QueenSignal['status'];
  status: 'OPEN' | 'WIN' | 'LOSS' | 'DRAW' | 'INVALID';
  pnl: number;
}

export interface GraveyardRecord {
  recordId: string;
  workerId: number;
  generation: number;
  fitness: number;
  winRate: number;
  totalTrades: number;
  deathTimestamp: number;
  dna: WorkerDNA;
  failurePatterns: string[];
  notes?: string;
}

export interface PatternMemoryItem {
  signature: string;
  occurrences: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  preferredRegime: string;
  asset: string;
}

export interface PaperStatistics {
  totalTrades: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  netPnl: number;
  rolling50: number;
  rolling100: number;
  rolling200: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
}
