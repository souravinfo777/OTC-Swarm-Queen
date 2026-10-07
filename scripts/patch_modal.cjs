const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// 1. modal-open detection helper, inserted before the picker
replaceOnce(
  '  function selectPairViaAssetPicker(asset) {',
  [
    "  /** Is the 'Select trade pair' modal currently open? (search input visible) */",
    '  function isPairModalOpen() {',
    '    try {',
    "      const inputs = document.querySelectorAll(\"input[type='text'], input[type='search'], input:not([type])\");",
    '      for (const inp of inputs) {',
    '        const r = inp.getBoundingClientRect();',
    '        if (r.width > 60 && r.height > 16 && inp.offsetParent !== null) {',
    "          const ph = String(inp.placeholder || '').toLowerCase();",
    "          if (ph.includes('search')) return true;",
    '        }',
    '      }',
    '    } catch (e) {}',
    '    return false;',
    '  }',
    '',
    '  function selectPairViaAssetPicker(asset) {'
  ].join('\n')
);
ok++;

// 2. reuse an already-open modal instead of clicking the opener again
replaceOnce(
  '    const opener = detectFromDealForm(window.innerWidth);\n    if (!opener || !opener.element) return Promise.resolve(false);\n    dispatchFullClick(opener.element);',
  [
    '    const opener = detectFromDealForm(window.innerWidth);',
    '    if (!isPairModalOpen()) {',
    '      if (!opener || !opener.element) return Promise.resolve(false);',
    '      dispatchFullClick(opener.element);',
    '    }'
  ].join('\n')
);
ok++;

// 3. after a successful row click, make sure the modal does not stay stuck open
replaceOnce(
  '        if (row) {\n          dispatchFullClick(row.el);\n          // Give the click a beat, then try once more — some builds need a second\n          // click on the row before the pair actually switches.\n          setTimeout(() => { try { const again = findRow(); if (again) dispatchFullClick(again.el); } catch (e) {} }, 150);\n          setTimeout(() => resolve(true), 300);\n          return;\n        }',
  [
    '        if (row) {',
    '          dispatchFullClick(row.el);',
    '          // Give the click a beat, then try once more — some builds need a second',
    '          // click on the row before the pair actually switches.',
    '          setTimeout(() => { try { const again = findRow(); if (again) dispatchFullClick(again.el); } catch (e) {} }, 150);',
    '          // Never leave the modal stuck over the chart: if Quotex kept it open after',
    '          // the selection, close it ourselves.',
    '          setTimeout(() => { try { if (isPairModalOpen()) closePairModal(); } catch (e) {} }, 600);',
    '          setTimeout(() => resolve(true), 300);',
    '          return;',
    '        }'
  ].join('\n')
);
ok++;

// 4. also close a lingering modal the moment a switch verifies successfully
replaceOnce(
  '        if (!domAsset || domAsset === asset) {\n          // Switch confirmed (or DOM not conclusive yet) — clear the failure flag.\n          STATE.autoTrade.lastSwitchFailed = false;\n          return;\n        }',
  [
    '        if (!domAsset || domAsset === asset) {',
    '          // Switch confirmed (or DOM not conclusive yet) — clear the failure flag and',
    '          // make sure no pair-picker modal is left covering the chart.',
    '          STATE.autoTrade.lastSwitchFailed = false;',
    '          try { if (isPairModalOpen()) closePairModal(); } catch (e) {}',
    '          return;',
    '        }'
  ].join('\n')
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
