const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
  ok++;
}

// split/join replaces ALL occurrences WITHOUT rescanning inserted text (the
// replacement contains the original pattern, so String.replace would loop forever).
function replaceAll(from, to) {
  const parts = s.split(from);
  ok += parts.length - 1;
  s = parts.join(to);
}

replaceOnce(
  "  const WORKER_NAMES = [",
  [
    "  // Chrome kills the content script's chrome.* binding the moment the extension is",
    "  // reloaded. Any async callback that then touches chrome.runtime throws",
    "  // 'Extension context invalidated' as an UNCAUGHT error on the page. Every such",
    "  // callback probes through this guard instead.",
    "  function chromeAlive() {",
    "    try {",
    "      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;",
    "    } catch (e) { return false; }",
    "  }",
    "",
    "  const WORKER_NAMES = ["
  ].join('\n')
);

replaceAll(
  "        if (chrome.runtime.lastError) { /* ignore */ }",
  "        if (!chromeAlive()) return; /* extension reloaded - page needs F5 */\n        if (chrome.runtime.lastError) { /* ignore */ }"
);
replaceAll(
  "            if (chrome.runtime.lastError) resolve(null);",
  "            if (!chromeAlive()) { resolve(null); return; }\n            if (chrome.runtime.lastError) resolve(null);"
);

fs.writeFileSync(f, s);
console.log('applied edits:', ok);
