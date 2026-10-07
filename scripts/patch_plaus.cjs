const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// ── A. ADAPTIVE price plausibility ───────────────────────────────────────────
// The currency table is a PRIOR, not the truth. Quotex lists inverted/derived pairs
// (BRL/USD = 0.188) and OTC feeds drift far from real-world rates, so the table
// rejected perfectly valid prices ("Ignoring implausible price..."). The pair's OWN
// accepted price (seeded from its real candle history) is now the strongest check.
replaceOnce(
  '  function isPlausiblePriceFor(asset, price) {\n    if (!asset || !(price > 0)) return false;\n    const quote = String(asset).slice(4, 7); // "USD/IDR (OTC)" -> "IDR"\n    const range = QUOTE_CURRENCY_RANGE[quote] || GENERIC_RANGE;\n    // A generous 3x pad on each side absorbs real broker drift without ever letting a\n    // completely different instrument slip through.\n    return price >= range[0] / 3 && price <= range[1] * 3;\n  }',
  [
    '  function isPlausiblePriceFor(asset, price) {',
    '    if (!asset || !(price > 0)) return false;',
    '    // 1. The pair\'s OWN accepted price (from its real candle history / earlier',
    '    // ticks) is the ground truth. This covers inverted pairs (BRL/USD = 0.188) and',
    '    // OTC feeds that drifted far from the real-world rate table.',
    '    try {',
    '      const known = STATE.assetPriceCache[asset];',
    '      if (known > 0) return price >= known / 8 && price <= known * 8;',
    '    } catch (e) {}',
    '    // 2. No history yet: fall back to the currency prior (generous 3x pad).',
    '    const quote = String(asset).slice(4, 7); // "USD/IDR (OTC)" -> "IDR"',
    '    const range = QUOTE_CURRENCY_RANGE[quote] || GENERIC_RANGE;',
    '    return price >= range[0] / 3 && price <= range[1] * 3;',
    '  }'
  ].join('\n')
);
ok++;

// ── B. Robust modal opener: deal-form button, then the "+" tab ───────────────
replaceOnce(
  '  function selectPairViaAssetPicker(asset) {',
  [
    '  /**',
    '   * Find something that opens the "Select trade pair" modal: the deal-form pair',
    '   * button first, then the "+" tab at the head of the chart tab strip.',
    '   */',
    '  function findPairModalOpener() {',
    '    const viaDealForm = detectFromDealForm(window.innerWidth);',
    '    if (viaDealForm && viaDealForm.element) return viaDealForm.element;',
    '    try {',
    '      const cands = document.querySelectorAll("button, div, span");',
    '      for (const el of cands) {',
    '        if (el.closest("#otc-swarm-queen-hud")) continue;',
    "        if ((el.textContent || '').trim() !== '+') continue;",
    '        const r = el.getBoundingClientRect();',
    '        if (r.top < 0 || r.top > 200 || r.width < 8 || r.width > 90 || r.height < 8 || r.height > 90) continue;',
    '        return el;',
    '      }',
    '    } catch (e) {}',
    '    return null;',
    '  }',
    '',
    '  function selectPairViaAssetPicker(asset) {'
  ].join('\n')
);
ok++;

// opener usage → use the robust finder
replaceOnce(
  "    const opener = detectFromDealForm(window.innerWidth);\n    if (!isPairModalOpen()) {\n      if (!opener || !opener.element) return Promise.resolve(false);\n      dispatchFullClick(opener.element);\n    }",
  [
    '    const openPairModal = () => {',
    '      const opener = findPairModalOpener();',
    '      if (!opener) return false;',
    '      dispatchFullClick(opener);',
    '      return true;',
    '    };',
    '    if (!isPairModalOpen()) {',
    '      if (!openPairModal()) return Promise.resolve(false);',
    '    }'
  ].join('\n')
);
ok++;

// retry cycle → retry the opener through the robust finder when the modal is missing
replaceOnce(
  '        if (tries === 9) closePairModal();\n        if (tries === 12 && opener && opener.element) dispatchFullClick(opener.element);\n        if (tries === 14 || tries === 18 || tries === 22) typeSearch();',
  [
    '        if (tries === 9) closePairModal();',
    '        if (tries === 5 || tries === 12) { try { if (!isPairModalOpen()) openPairModal(); } catch (e) {} }',
    '        if (tries === 14 || tries === 18 || tries === 22) typeSearch();'
  ].join('\n')
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
