const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// noteSkip console logging
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

// per-pair dedupe (actual current text)
replaceOnce(
"    if (at.lastTradedCandleKey === lock.forCandleKey) {\n      noteSkip('already traded this candle (' + lock.direction + ')');\n      return;\n    }",
"    // One trade per PAIR per target candle — a CALL on USD/COP must never block a\n    // fresh PUT signal on GBP/NZD for the same minute.\n    const tradedPairKey = pairAsset + '@' + lock.forCandleKey;\n    if (at.lastTradedPairKey === tradedPairKey) {\n      noteSkip('already traded ' + lock.direction + ' on ' + pairAsset + ' for this candle');\n      return;\n    }"
);
ok++;

// record per-pair key after execution
replaceOnce(
"    at.lastTradedAt = Date.now();\n    at.lastTradedCandleKey = lock.forCandleKey;",
"    at.lastTradedAt = Date.now();\n    at.lastTradedCandleKey = lock.forCandleKey;\n    at.lastTradedPairKey = tradedPairKey;"
);
ok++;

// state field
replaceOnce(
"      lastSwitchCandleKey: null,\n      lastFollowBestCandle: null\n    },",
"      lastSwitchCandleKey: null,\n      lastFollowBestCandle: null,\n      lastTradedPairKey: null\n    },"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
