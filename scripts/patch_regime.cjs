const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// ── 1. Trap lenses now RESPECT real structure: fading is suppressed when the SMC
//      structure genuinely confirms the move (BOS/CHoCH up = stop fading up-moves).
replaceOnce(
"      // 14 RSI Divergence → RSI EXTREME fade: overbought/oversold extremes snap back.\n      14: function () {\n        if (rsi >= 68) return -(1.0 + (rsi - 68) * 0.1);\n        if (rsi <= 32) return (1.0 + (32 - rsi) * 0.1);\n        return 0;\n      },",
"      // 14 RSI Divergence → RSI EXTREME fade — but NOT against a confirmed structural\n" +
"      // trend: in a real breakout (BOS/CHoCH up) overbought RSI rides, it does not reverse.\n" +
"      14: function () {\n" +
"        if (rsi >= 68 && smcRead.structure < 0.6) return -(1.0 + (rsi - 68) * 0.1);\n" +
"        if (rsi <= 32 && smcRead.structure > -0.6) return (1.0 + (32 - rsi) * 0.1);\n" +
"        return 0;\n" +
"      },"
);
ok++;

replaceOnce(
"      15: function () {\n        if (Math.abs(tickStreak) >= 5) return -(tickStreak > 0 ? 1 : -1) * Math.min(1.4, 0.8 + Math.abs(tickStreak) * 0.06);\n        return 0;\n      },",
"      15: function () {\n        const dir = tickStreak > 0 ? 1 : -1;\n        if (Math.abs(tickStreak) >= 5 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.8 + Math.abs(tickStreak) * 0.06);\n        return 0;\n      },"
);
ok++;

replaceOnce(
"      18: function () {\n        if (Math.abs(m.z10) >= 1.0) return -m.z10 * 0.9;\n        return 0;\n      },",
"      18: function () {\n        // Fade an extension only when structure does not strongly confirm it.\n        if (Math.abs(m.z10) >= 1.0 && m.z10 * smcRead.structure < 0.6) return -m.z10 * 0.9;\n        return 0;\n      },"
);
ok++;

replaceOnce(
"      19: function () {\n        if (Math.abs(colourStreak) >= 3) return -(colourStreak > 0 ? 1 : -1) * Math.min(1.4, 0.7 + (Math.abs(colourStreak) - 2) * 0.25);\n        return 0;\n      },",
"      19: function () {\n        const dir = colourStreak > 0 ? 1 : -1;\n        if (Math.abs(colourStreak) >= 3 && smcRead.structure * dir < 0.6) return -dir * Math.min(1.4, 0.7 + (Math.abs(colourStreak) - 2) * 0.25);\n        return 0;\n      },"
);
ok++;

// ── 2. faster lens learning: EWMA alpha 0.2 → 0.3 ────────────────────────────
replaceOnce(
"            s.ewma = s.n === 0 ? (correct ? 0.8 : 0.3) : s.ewma * 0.8 + correct * 0.2;",
"            // alpha 0.3: after a market regime flips, stale lens weights adapt in a\n            // handful of candles instead of hanging around for many.\n            s.ewma = s.n === 0 ? (correct ? 0.8 : 0.3) : s.ewma * 0.7 + correct * 0.3;"
);
ok++;

// ── 3. structure-opposition flip: when a real BOS/CHoCH goes AGAINST the locked
//      verdict, flip the lock instead of riding a losing call to expiry.
replaceOnce(
"      } else if (lock.direction === \"HOLD\" && decisive && !quietMarket && phase.elapsedSec <= 45) {\n        lock.direction = liveDir;",
"      } else if (lock.direction === 'PUT' && smcRead.structure >= 1.1 && phase.elapsedSec <= 45) {\n        // Bullish BOS/CHoCH against a locked PUT: the market has genuinely flipped up.\n        lock.direction = 'CALL';\n        lock.power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));\n        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + lock.power * 0.36 + dominance * 0.08));\n      } else if (lock.direction === 'CALL' && smcRead.structure <= -1.1 && phase.elapsedSec <= 45) {\n        // Bearish BOS/CHoCH against a locked CALL: the market has genuinely flipped down.\n        lock.direction = 'PUT';\n        lock.power = Math.max(0, Math.min(1, Math.abs(netScore) * 1.6));\n        lock.confidence = Math.max(0.52, Math.min(0.96, 0.52 + lock.power * 0.36 + dominance * 0.08));\n      } else if (lock.direction === 'HOLD' && decisive && !quietMarket && phase.elapsedSec <= 45) {\n        lock.direction = liveDir;"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 5');
