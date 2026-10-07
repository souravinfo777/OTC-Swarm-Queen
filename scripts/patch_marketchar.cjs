const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// 1. measure the pair's actual market character from its own closed candles
replaceOnce(
  '    // Real SMC confluence on the closed M1 candles (structure/liquidity/OB/FVG/wicks).\n    const smcRead = analyzeSMC(candles);',
  [
    '    // Real SMC confluence on the closed M1 candles (structure/liquidity/OB/FVG/wicks).',
    '    const smcRead = analyzeSMC(candles);',
    '',
    '    // MARKET-CHARACTER MEASUREMENT (evidence, not theory): over the last 60 closed',
    '    // candles, does this pair CONTINUE its direction or REVERT? The OTC-trap fade',
    '    // lenses only make sense in a mean-reverting phase — in a trending phase they',
    '    // fight the market (measured fade accuracy can sink to ~40%). reversionBias:',
    '    // +1 = strongly mean-reverting (traps work), -1 = strongly trending (traps mute).',
    '    let reversionBias = 0;',
    '    {',
    '      const closed = candles.slice(0, Math.max(0, candles.length - 1)).slice(-60);',
    '      let cont = 0, rev = 0;',
    '      for (let i = 1; i < closed.length; i++) {',
    '        const d1 = Math.sign(closed[i].close - closed[i - 1].close);',
    '        const d2 = i + 1 < closed.length ? Math.sign(closed[i + 1].close - closed[i].close) : 0;',
    '        if (d1 === 0 || d2 === 0) continue;',
    '        if (d1 === d2) cont++; else rev++;',
    '      }',
    '      const total = cont + rev;',
    '      if (total >= 10) reversionBias = (rev - cont) / total;',
    '    }'
  ].join('\n')
);
ok++;

// 2. trap fades go silent unless the pair is ACTUALLY mean-reverting right now
replaceOnce(
  '      14: function () {\n        if (rsi >= 68 && smcRead.structure < 0.6) return -(1.0 + (rsi - 68) * 0.1);\n        if (rsi <= 32 && smcRead.structure > -0.6) return (1.0 + (32 - rsi) * 0.1);\n        return 0;\n      },',
  '      14: function () {\n        if (reversionBias <= 0) return 0; // trending phase: fading fights the market\n        if (rsi >= 68 && smcRead.structure < 0.6) return -(1.0 + (rsi - 68) * 0.1);\n        if (rsi <= 32 && smcRead.structure > -0.6) return (1.0 + (32 - rsi) * 0.1);\n        return 0;\n      },'
);
ok++;

replaceOnce(
  '      15: function () {\n        const dir = tickStreak > 0 ? 1 : -1;\n        if (Math.abs(tickStreak) >= 5 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.8 + Math.abs(tickStreak) * 0.06);\n        return 0;\n      },',
  '      15: function () {\n        if (reversionBias <= 0) return 0;\n        const dir = tickStreak > 0 ? 1 : -1;\n        if (Math.abs(tickStreak) >= 5 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.8 + Math.abs(tickStreak) * 0.06);\n        return 0;\n      },'
);
ok++;

replaceOnce(
  '      18: function () {\n        // Fade an extension only when structure does not strongly confirm it.\n        if (Math.abs(m.z10) >= 1.0 && m.z10 * smcRead.structure < 0.6) return -m.z10 * 0.9;\n        return 0;\n      },',
  '      18: function () {\n        // Fade an extension only when the market reverts AND structure does not\n        // strongly confirm the extension.\n        if (reversionBias <= 0) return 0;\n        if (Math.abs(m.z10) >= 1.0 && m.z10 * smcRead.structure < 0.6) return -m.z10 * 0.9;\n        return 0;\n      },'
);
ok++;

replaceOnce(
  '      19: function () {\n        const dir = colourStreak > 0 ? 1 : -1;\n        if (Math.abs(colourStreak) >= 3 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.7 + (Math.abs(colourStreak) - 2) * 0.25);\n        return 0;\n      },',
  '      19: function () {\n        if (reversionBias <= 0) return 0;\n        const dir = colourStreak > 0 ? 1 : -1;\n        if (Math.abs(colourStreak) >= 3 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.7 + (Math.abs(colourStreak) - 2) * 0.25);\n        return 0;\n      },'
);
ok++;

// 3. surface the measurement in the evidence so the user can see the phase
replaceOnce(
  "    const evidence = [\n      'SMC: ' + smcRead.score + '/100 ' + (smcRead.evidence.length ? smcRead.evidence.slice(0, 3).join(' | ') : '(no strong structure read)'),",
  "    const phaseLabel = reversionBias > 0.05 ? 'MEAN-REVERTING (trap fades active)' : reversionBias < -0.05 ? 'TRENDING (trap fades muted)' : 'MIXED';\n    const evidence = [\n      'Market: ' + phaseLabel + ' (' + Math.round(Math.abs(reversionBias) * 100) + '% bias)',\n      'SMC: ' + smcRead.score + '/100 ' + (smcRead.evidence.length ? smcRead.evidence.slice(0, 3).join(' | ') : '(no strong structure read)'),"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 7');
