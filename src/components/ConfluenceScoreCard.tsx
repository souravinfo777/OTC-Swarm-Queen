import React from 'react';
import { SMCFeatureVector, SMCRawDetails } from '../types/market';
import { Target, CheckCircle, CircleDot } from 'lucide-react';

interface ConfluenceScoreCardProps {
  featureVector: SMCFeatureVector | null;
  rawDetails: SMCRawDetails | null;
}

export const ConfluenceScoreCard: React.FC<ConfluenceScoreCardProps> = ({
  featureVector,
  rawDetails
}) => {
  const score = featureVector?.confluenceScore || 0;

  // Gauge color based on threshold
  const getScoreColor = (val: number) => {
    if (val >= 75) return 'text-emerald-400 border-emerald-500 bg-emerald-950/40';
    if (val >= 55) return 'text-sky-400 border-sky-500 bg-sky-950/40';
    if (val >= 35) return 'text-amber-400 border-amber-500 bg-amber-950/40';
    return 'text-zinc-400 border-zinc-700 bg-zinc-900/40';
  };

  const getBarColor = (val: number) => {
    if (val >= 75) return 'bg-emerald-500';
    if (val >= 55) return 'bg-sky-500';
    if (val >= 35) return 'bg-amber-500';
    return 'bg-zinc-600';
  };

  // Breakdown items
  const items = [
    {
      label: 'Liquidity Sweep',
      points: 20,
      active: !!featureVector?.liquiditySweep,
      desc: featureVector?.liquidityType || 'No sweep detected'
    },
    {
      label: 'Order Block (OB)',
      points: 20,
      active: !!featureVector?.bullishOB || !!featureVector?.bearishOB,
      desc: featureVector?.bullishOB ? 'Bullish OB in range' : featureVector?.bearishOB ? 'Bearish OB in range' : 'No active OB'
    },
    {
      label: 'Fair Value Gap (FVG)',
      points: 15,
      active: !!featureVector?.bullishFVG || !!featureVector?.bearishFVG,
      desc: featureVector?.bullishFVG ? 'Bullish FVG open' : featureVector?.bearishFVG ? 'Bearish FVG open' : 'No active gap'
    },
    {
      label: 'Structure Break (BOS / CHoCH)',
      points: 15,
      active: !!featureVector?.bos || !!featureVector?.choch,
      desc: featureVector?.bos ? 'Break of Structure (BOS)' : featureVector?.choch ? 'Change of Character (CHoCH)' : 'Structure intact'
    },
    {
      label: 'Candle Pattern Confirmation',
      points: 10,
      active: featureVector?.candlePattern !== 'NONE' && featureVector?.candlePattern !== 'DOJI',
      desc: featureVector?.candlePattern || 'No dominant pattern'
    },
    {
      label: 'Trend Regime Alignment',
      points: 10,
      active: featureVector?.trend === 'BULLISH' || featureVector?.trend === 'BEARISH',
      desc: `${featureVector?.trend || 'UNCERTAIN'} (${featureVector?.regime || 'RANGE'})`
    },
    {
      label: 'Fresh Zone Retest',
      points: 10,
      active: !!featureVector?.obFresh || !!featureVector?.fvgFresh,
      desc: featureVector?.obFresh || featureVector?.fvgFresh ? 'Unmitigated fresh level' : 'Mitigated / aged'
    }
  ];

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-400">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-100">SMC CONFLUENCE ENGINE</div>
            <div className="text-[10px] text-zinc-500">Multi-factor algorithmic validation (0 - 100)</div>
          </div>
        </div>

        {/* Score Ring */}
        <div className={`px-3 py-1 rounded-lg border font-black text-lg ${getScoreColor(score)}`}>
          {score} <span className="text-xs font-normal text-zinc-400">/ 100</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden mb-3.5 border border-zinc-800">
        <div
          style={{ width: `${score}%` }}
          className={`h-full transition-all duration-500 ${getBarColor(score)}`}
        />
      </div>

      {/* Factor Breakdown List */}
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between p-1.5 rounded-lg border text-xs transition-colors ${
              item.active
                ? 'bg-zinc-900/90 border-zinc-700/80 text-zinc-200'
                : 'bg-zinc-950/50 border-zinc-900 text-zinc-600'
            }`}
          >
            <div className="flex items-center gap-2">
              {item.active ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              ) : (
                <CircleDot className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              )}
              <span className={item.active ? 'font-semibold text-zinc-200' : 'text-zinc-500'}>
                {item.label}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-zinc-500 truncate max-w-[140px]">{item.desc}</span>
              <span
                className={`px-1.5 py-0.2 rounded font-bold ${
                  item.active ? 'bg-sky-950 text-sky-400' : 'text-zinc-600'
                }`}
              >
                +{item.points}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
