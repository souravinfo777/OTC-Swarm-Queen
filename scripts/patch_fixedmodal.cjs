const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// ── ROOT CAUSE FIX ───────────────────────────────────────────────────────────
// `offsetParent` is null for elements inside position:fixed containers. Quotex's
// pair modal IS fixed-position, so every "is this input visible?" check returned
// false: the extension could not see the search box (no typing) and believed the
// modal was never open (re-clicking the opener, leaving it stuck). Use a real
// visibility check: geometry + computed style.
replaceOnce(
  '  /** Is the \'Select trade pair\' modal currently open? (search input visible) */',
  [
    '  /** True when an element is really rendered on screen (works inside',
    '   *  position:fixed modals, where offsetParent is always null). */',
    '  function isElementOnScreen(el) {',
    '    try {',
    '      const r = el.getBoundingClientRect();',
    '      if (r.width < 2 || r.height < 2) return false;',
    '      if (r.bottom < 0 || r.right < 0) return false;',
    '      if (r.top > (window.innerHeight || 9999) || r.left > (window.innerWidth || 9999)) return false;',
    "      const st = window.getComputedStyle(el);",
    "      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;",
    '      return true;',
    '    } catch (e) { return false; }',
    '  }',
    '',
    "  /** Is the 'Select trade pair' modal currently open? (search input visible) */"
  ].join('\n')
);
ok++;

// 1a. isPairModalOpen: use the real visibility check
replaceOnce(
  '        if (r.width > 60 && r.height > 16 && inp.offsetParent !== null) {',
  '        if (r.width > 60 && r.height > 16 && isElementOnScreen(inp)) {'
);
ok++;

// 1b. typeSearch: same fix — this is why the search box was never typed into
replaceOnce(
  '            return r.width > 60 && r.height > 16 && inp.offsetParent !== null;',
  '            return r.width > 60 && r.height > 16 && isElementOnScreen(inp);'
);
ok++;

// ── 2. verification: one extra beat before declaring a switch failed ─────────
// The chart redraw can outrun the DOM heuristics: a click that DID switch the chart
// looked "failed" at 1400ms and spawned the picker modal over the new chart.
replaceOnce(
  '  function scheduleSwitchVerification(asset, delay, pickerTried) {\n    setTimeout(() => {\n      try {\n        const detected = detectActiveQuotexAsset();\n        const domAsset = detected && detected.asset;\n        if (!domAsset || domAsset === asset) {',
  [
    '  function scheduleSwitchVerification(asset, delay, pickerTried) {',
    '    setTimeout(() => {',
    '      try {',
    '        const check = () => {',
    '          const detected = detectActiveQuotexAsset();',
    '          return detected && detected.asset;',
    '        };',
    '        let domAsset = check();',
    '        if (domAsset && domAsset !== asset) {',
    '          // The chart redraw may simply be slow — one more look before we call the',
    '          // switch failed and spawn the picker modal over it.',
    '          setTimeout(() => {',
    '            try {',
    '              handleSwitchVerificationResult(asset, check(), pickerTried);',
    '            } catch (e) {}',
    '          }, 900);',
    '          return;',
    '        }',
    '        handleSwitchVerificationResult(asset, domAsset, pickerTried);',
    '      } catch (e) {}',
    '    }, delay);',
    '  }',
    '',
    '  function handleSwitchVerificationResult(asset, domAsset, pickerTried) {',
    '    try {',
    '      if (!domAsset || domAsset === asset) {'
  ].join('\n')
);
ok++;

// close the new helper function (the old body continued with "return;" endings)
replaceOnce(
  '          try { if (isPairModalOpen()) closePairModal(); } catch (e) {}\n          return;\n        }',
  '          try { if (isPairModalOpen()) closePairModal(); } catch (e) {}\n          return;\n        }\n    } catch (e) {}\n  }'
);
ok++;

// ── 3. picker self-healing: if the poll keeps failing, close the modal, reopen it,
// retype — never leave it stuck over the chart.
replaceOnce(
  '        if (tries === 2 || tries === 4 || tries === 6) typeSearch();\n        if (tries >= 20) {\n          closePairModal();\n          resolve(false);\n          return;\n        }\n        setTimeout(poll, 250);',
  [
    '        if (tries === 2 || tries === 4 || tries === 6) typeSearch();',
    '        // Self-healing cycle: close whatever half-open modal exists, reopen it',
    '        // fresh, and retype — a stuck render is recovered instead of lingering.',
    '        if (tries === 9) closePairModal();',
    '        if (tries === 12 && opener && opener.element) dispatchFullClick(opener.element);',
    '        if (tries === 14 || tries === 18 || tries === 22) typeSearch();',
    '        if (tries >= 26) {',
    '          closePairModal();',
    '          resolve(false);',
    '          return;',
    '        }',
    '        setTimeout(poll, 250);'
  ].join('\n')
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 6');
