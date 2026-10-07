import { PaperTrade, QueenSignal, PaperStatistics } from '../../types/swarm';
import { MarketRegime } from '../../types/market';

export class PaperTradingEngine {
  public activeTrades: PaperTrade[] = [];
  public closedTrades: PaperTrade[] = [];
  public expirySeconds = 60;
  public payoutPct = 0.85;
  public isRunning = true;

  public openTrade(queenSignal: QueenSignal, currentPrice: number, regime: MarketRegime): PaperTrade | null {
    if (!this.isRunning) return null;
    if (queenSignal.direction !== 'UP' && queenSignal.direction !== 'DOWN') return null;
    // QUICK_SIGNAL included: without paper trades on the QuickFire tier the swarm
    // never learns whether the immediate candle signals were right or wrong.
    if (queenSignal.status !== 'PAPER_SIGNAL' && queenSignal.status !== 'VALIDATED_SIGNAL' && queenSignal.status !== 'QUICK_SIGNAL') return null;
    // Never enter on an unknown/stale price (zero-simulation policy).
    if (!(currentPrice > 0)) return null;
    // One open contract per asset: a persistent signal would otherwise stack a new
    // trade on every engine tick and skew the win-rate statistics.
    if (this.activeTrades.some((t) => t.asset === queenSignal.asset)) return null;

    const now = Date.now();
    const trade: PaperTrade = {
      id: `PT_${queenSignal.asset}_${now}_${Math.floor(Math.random() * 1000)}`,
      asset: queenSignal.asset,
      direction: queenSignal.direction,
      entryPrice: currentPrice,
      expirySeconds: this.expirySeconds,
      timestamp: now,
      expiryTimestamp: now + this.expirySeconds * 1000,
      queenConfidence: queenSignal.confidence,
      workerVotes: {
        up: queenSignal.upVotes,
        down: queenSignal.downVotes,
        hold: queenSignal.holdVotes
      },
      smcEvidence: queenSignal.evidence,
      signalStatus: queenSignal.status,
      regime,
      status: 'OPEN',
      pnl: 0
    };

    this.activeTrades.push(trade);
    return trade;
  }

  public checkExpiries(currentPrice: number, timestampMs?: number): PaperTrade[] {
    const now = timestampMs || Date.now();
    const settled: PaperTrade[] = [];
    const remaining: PaperTrade[] = [];

    this.activeTrades.forEach((t) => {
      if (now >= t.expiryTimestamp) {
        t.exitPrice = currentPrice;
        if (t.direction === 'UP') {
          if (t.exitPrice > t.entryPrice) {
            t.status = 'WIN';
            t.pnl = 100 * this.payoutPct;
          } else if (t.exitPrice < t.entryPrice) {
            t.status = 'LOSS';
            t.pnl = -100;
          } else {
            t.status = 'DRAW';
            t.pnl = 0;
          }
        } else if (t.direction === 'DOWN') {
          if (t.exitPrice < t.entryPrice) {
            t.status = 'WIN';
            t.pnl = 100 * this.payoutPct;
          } else if (t.exitPrice > t.entryPrice) {
            t.status = 'LOSS';
            t.pnl = -100;
          } else {
            t.status = 'DRAW';
            t.pnl = 0;
          }
        }
        this.closedTrades.push(t);
        settled.push(t);
      } else {
        remaining.push(t);
      }
    });

    this.activeTrades = remaining;
    return settled;
  }

  public getStatistics(): PaperStatistics {
    const total = this.closedTrades.length;
    if (total === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        netPnl: 0,
        rolling50: 0,
        rolling100: 0,
        rolling200: 0,
        longestWinStreak: 0,
        longestLossStreak: 0,
        currentStreak: 0
      };
    }

    const wins = this.closedTrades.filter((t) => t.status === 'WIN').length;
    const losses = this.closedTrades.filter((t) => t.status === 'LOSS').length;
    const draws = this.closedTrades.filter((t) => t.status === 'DRAW').length;
    const netPnl = this.closedTrades.reduce((acc, t) => acc + t.pnl, 0);

    const calcRolling = (window: number) => {
      const slice = this.closedTrades.slice(-window);
      const w = slice.filter((t) => t.status === 'WIN').length;
      const dec = slice.filter((t) => t.status === 'WIN' || t.status === 'LOSS').length;
      return dec > 0 ? Number((w / dec).toFixed(3)) : 0;
    };

    let longestWin = 0;
    let longestLoss = 0;
    let currStreak = 0;
    let currType: string | null = null;

    this.closedTrades.forEach((t) => {
      if (t.status === 'WIN') {
        if (currType === 'WIN') currStreak++;
        else {
          currStreak = 1;
          currType = 'WIN';
        }
        longestWin = Math.max(longestWin, currStreak);
      } else if (t.status === 'LOSS') {
        if (currType === 'LOSS') currStreak++;
        else {
          currStreak = 1;
          currType = 'LOSS';
        }
        longestLoss = Math.max(longestLoss, currStreak);
      } else {
        currStreak = 0;
        currType = null;
      }
    });

    const winRate = (wins + losses) > 0 ? Number((wins / (wins + losses)).toFixed(3)) : 0;

    return {
      totalTrades: total,
      wins,
      losses,
      draws,
      winRate,
      netPnl: Number(netPnl.toFixed(2)),
      rolling50: calcRolling(50),
      rolling100: calcRolling(100),
      rolling200: calcRolling(200),
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      currentStreak: currType === 'WIN' ? currStreak : -currStreak
    };
  }
}
