import { SMCFeatureVector, VisionOutcomeRecord, VisionScan } from '../../types/market';

const MAX_SCANS_PER_ASSET = 20;
const SCAN_FRESH_MS = 90 * 1000;
const ACCURACY_ALPHA = 0.25;
const TRUST_MIN = 0.30;
const TRUST_MAX = 0.90;
const STORAGE_KEY = 'otc_queen_vision_state_v1';

interface AssetVisionState {
  scans: VisionScan[];
  outcomes: VisionOutcomeRecord[];
  /** Exponentially weighted directional accuracy of vision scans (0..1). */
  accuracy: number;
  /** How much the Queen trusts the vision layer right now (0.30..0.90). */
  trust: number;
}

/**
 * Mistral visual chart-scan memory. Stores every scan, settles each prediction against
 * the real closed candle, and converts the running accuracy into a Queen-level trust
 * factor plus per-fly training feedback. State persists in localStorage so the swarm
 * keeps its training across reloads.
 */
export class VisionEngine {
  private assets: Record<string, AssetVisionState> = {};
  private lastOutcomeCandleKey: Record<string, string> = {};

  constructor() {
    this.load();
  }

  private stateFor(asset: string): AssetVisionState {
    if (!this.assets[asset]) {
      this.assets[asset] = { scans: [], outcomes: [], accuracy: 0.5, trust: 0.5 };
    }
    return this.assets[asset];
  }

  public recordScan(scan: VisionScan) {
    const st = this.stateFor(scan.asset);
    st.scans.unshift(scan);
    if (st.scans.length > MAX_SCANS_PER_ASSET) st.scans.pop();
    this.save();
  }

  public latestScan(asset: string): VisionScan | null {
    return this.stateFor(asset).scans[0] || null;
  }

  public isFresh(asset: string): boolean {
    const scan = this.latestScan(asset);
    return Boolean(scan && Date.now() - scan.timestamp < SCAN_FRESH_MS);
  }

  public accuracy(asset: string): number {
    return this.stateFor(asset).accuracy;
  }

  public trust(asset: string): number {
    return this.stateFor(asset).trust;
  }

  public outcomes(asset: string): VisionOutcomeRecord[] {
    return [...this.stateFor(asset).outcomes];
  }

  public scanHistory(asset: string): VisionScan[] {
    return [...this.stateFor(asset).scans];
  }

  /**
   * Settle the newest prediction made during the candle that just closed against its
   * real direction. Updates the EWMA accuracy and the Queen-level trust factor — the
   * vision layer's self-training step. Returns null when nothing was settleable.
   */
  public settleOutcome(
    asset: string,
    candleKey: string,
    actual: 'UP' | 'DOWN' | 'DRAW',
    closeTime: number = Date.now()
  ): { scan: VisionScan; correct: boolean } | null {
    if (this.lastOutcomeCandleKey[asset] === candleKey) return null;
    const st = this.stateFor(asset);
    const scan = st.scans.find((s) => s.signal !== 'NONE' && s.timestamp <= closeTime);
    if (!scan) return null;

    const correct = actual !== 'DRAW' && scan.signal === actual;
    const rec: VisionOutcomeRecord = {
      scanId: scan.id,
      asset,
      timestamp: Date.now(),
      predicted: scan.signal as 'UP' | 'DOWN',
      actual,
      correct
    };
    st.outcomes.unshift(rec);
    if (st.outcomes.length > 60) st.outcomes.pop();

    if (actual !== 'DRAW') {
      st.accuracy = st.accuracy * (1 - ACCURACY_ALPHA) + (correct ? 1 : 0) * ACCURACY_ALPHA;
      const nextTrust = TRUST_MIN + (st.accuracy - 0.5) * (TRUST_MAX - TRUST_MIN) * 2;
      st.trust = Number(Math.max(TRUST_MIN, Math.min(TRUST_MAX, nextTrust)).toFixed(3));
    }

    this.lastOutcomeCandleKey[asset] = candleKey;
    this.save();
    return { scan, correct };
  }

  /** Accuracy snapshot for the UI and the Queen trust display. */
  public accuracySnapshot(asset: string): { ewma: number; trust: number; total: number; correct: number } {
    const st = this.stateFor(asset);
    return {
      ewma: Number(st.accuracy.toFixed(3)),
      trust: st.trust,
      total: st.outcomes.length,
      correct: st.outcomes.filter((o) => o.correct).length
    };
  }

  /** Merge the freshest vision scan into an SMC feature vector (view copy, no mutation). */
  public mergeIntoFeatureVector(asset: string, fv: SMCFeatureVector): SMCFeatureVector {
    const scan = this.latestScan(asset);
    if (!scan || !this.isFresh(asset) || scan.signal === 'NONE') return fv;
    return {
      ...fv,
      visionSignal: scan.signal,
      visionConfidence: scan.confidence,
      visionEvidence: [`VISION_${scan.signal}`, ...scan.patterns.slice(0, 3).map((p) => `VISION_PATTERN_${p.toUpperCase().replace(/\s+/g, '_')}`)]
    };
  }

  public serialize(): string {
    return JSON.stringify(this.assets);
  }

  public loadSerialized(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.assets = parsed;
    } catch {
      /* corrupt state — start clean */
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, this.serialize());
    } catch {
      /* storage full/unavailable */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.loadSerialized(raw);
    } catch {
      /* ignore */
    }
  }
}
