const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// 1. settings-only persistence (runtime counters stay per-tab in memory)
replaceOnce(
"  function saveAutoTrade() {\n    try {\n      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {\n        chrome.storage.local.set({ autoTrade: STATE.autoTrade });\n      }\n    } catch (e) {}\n  }",
[
"  // Auto-trade USER SETTINGS are shared across tabs; runtime counters (streaks, last",
"  // attempts) stay per-tab in memory. Persisting the whole object let whichever tab",
"  // traded last overwrite settings the user changed in the popup a second later.",
"  const AUTO_TRADE_SETTINGS_KEYS = ['enabled', 'amount', 'minConfidence', 'followBest', 'maxRepeat', 'repeatCooldownCandles'];",
"",
"  function pickAutoTradeSettings() {",
"    const out = {};",
"    AUTO_TRADE_SETTINGS_KEYS.forEach((k) => { out[k] = STATE.autoTrade[k]; });",
"    return out;",
"  }",
"",
"  function applyAutoTradeSettings(obj) {",
"    if (!obj || typeof obj !== 'object') return;",
"    AUTO_TRADE_SETTINGS_KEYS.forEach((k) => {",
"      if (obj[k] !== undefined) STATE.autoTrade[k] = obj[k];",
"    });",
"  }",
"",
"  function saveAutoTrade() {",
"    try {",
"      STATE.__atLocalWriteAt = Date.now();",
"      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {",
"        chrome.storage.local.set({ autoTrade: pickAutoTradeSettings() });",
"      }",
"    } catch (e) {}",
"  }"
].join('\n'));
ok++;

// 2. load applies settings keys only
replaceOnce(
"          if (res && res.autoTrade && typeof res.autoTrade === 'object') {\n            Object.assign(STATE.autoTrade, res.autoTrade);\n          }",
"          if (res && res.autoTrade && typeof res.autoTrade === 'object') {\n            applyAutoTradeSettings(res.autoTrade);\n          }"
);
ok++;

// 3. sync loop: settings keys only + ignore in-flight stale reads right after a
//    local change (the local value is the truth in THIS tab for a few seconds)
replaceOnce(
"        const j = JSON.stringify(res.autoTrade);\n        if (j !== lastAutoTradeSyncJson) {\n          lastAutoTradeSyncJson = j;\n          Object.assign(STATE.autoTrade, res.autoTrade);\n        }",
"        const j = JSON.stringify(res.autoTrade);\n        if (j !== lastAutoTradeSyncJson) {\n          lastAutoTradeSyncJson = j;\n          applyAutoTradeSettings(res.autoTrade);\n        }"
);
ok++;

replaceOnce(
"  let lastAutoTradeSyncJson = \"\";\n  setInterval(function () {\n    try {\n      if (typeof chrome === \"undefined\" || !chrome.storage || !chrome.storage.local) return;\n      chrome.storage.local.get([\"autoTrade\"], function (res) {",
"  let lastAutoTradeSyncJson = \"\";\n  setInterval(function () {\n    try {\n      if (typeof chrome === \"undefined\" || !chrome.storage || !chrome.storage.local) return;\n      // A just-made local change is the source of truth in THIS tab: skip one cycle so\n      // an in-flight stale storage read cannot clobber it back to the old value.\n      if (STATE.__atLocalWriteAt && Date.now() - STATE.__atLocalWriteAt < 4000) return;\n      chrome.storage.local.get([\"autoTrade\"], function (res) {"
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
