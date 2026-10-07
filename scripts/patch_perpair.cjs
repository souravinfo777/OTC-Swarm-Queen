const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// 1. noteSkip logs every NEW reason to the console (the page console becomes the
//    auto-trade audit trail — no more guessing why a signal was skipped).
replaceOnce(
"    const noteSkip = (reason) => { at.lastSkip = { at: Date.now(), reason: reason }; };",
[
"    const noteSkip = (reason) => {",
"      at.lastSkip = { at: Date.now(), reason: reason };",
"      if (at.__lastSkipReason !== reason) {",
"        at.__lastSkipReason = reason;",
"        console.log('[OTC Swarm Queen] AUTO-TRADE waiting: ' + reason);",
"      }",
"    };"
].join('\n'));
ok++;

// 2. per-pair + per-candle dedupe: the old guard was pair-blind, so a trade on ANY
//    pair silently blocked a fresh signal on another pair for the same minute.
replaceOnce(
"    if (at.lastTradedCandleKey === lock.forCandleKey) return; // one trade per target candle",
"    // One trade per PAIR per target candle — a CALL on USD/COP must never block a\n    // fresh PUT signal on GBP/NZD for the same minute.\n    const tradedPairKey = pairAsset + '@' + lock.forCandleKey;\n    if (at.lastTradedPairKey === tradedPairKey) {\n      noteSkip('already traded ' + lock.direction + ' on ' + pairAsset + ' for this candle');\n      return;\n    }"
);
ok++;

// 3. record the per-pair key after execution
replaceOnce(
"    at.lastTradedAt = Date.now();\n    at.lastTradedCandleKey = lock.forCandleKey;",
"    at.lastTradedAt = Date.now();\n    at.lastTradedCandleKey = lock.forCandleKey;\n    at.lastTradedPairKey = tradedPairKey;"
);
ok++;

// 4. state field
replaceOnce(
"      lastSwitchCandleKey: null,\n      lastFollowBestCandle: null\n    },",
"      lastSwitchCandleKey: null,\n      lastFollowBestCandle: null,\n      lastTradedPairKey: null\n    },"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
