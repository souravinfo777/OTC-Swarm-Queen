const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// 1. give the chart real time to switch before declaring failure and opening the
//    picker modal over it (Quotex redraw can take >1s)
replaceOnce(
  '      scheduleSwitchVerification(asset, 600, false);',
  '      scheduleSwitchVerification(asset, 1400, false);'
);
ok++;

// 2. picker poll: start a little later and keep trying ~5s total (slow renders)
replaceOnce(
  "      let tries = 0;\n      const poll = () => {\n        tries++;\n        const row = findRow();",
  "      let tries = 0;\n      const poll = () => {\n        tries++;\n        // The modal may itself be a leftover from the click path — close it first so\n        // the row scan and typing act on a freshly opened, correctly filtered list.\n        const row = findRow();"
);
ok++;
replaceOnce(
  '        if (tries >= 12) {',
  '        if (tries >= 20) {'
);
ok++;
replaceOnce(
  "      setTimeout(poll, 500);\n    });",
  "      setTimeout(poll, 800);\n    });"
);
ok++;

// 3. much more robust modal closing: Escape on document + active element, then the
//    clickable close control (walk up from icons/svgs to the real button)
replaceOnce(
"    const closePairModal = () => {\n      try {\n        document.dispatchEvent(new KeyboardEvent(\"keydown\", { key: \"Escape\", keyCode: 27, which: 27, bubbles: true }));\n        const closeEl = Array.from(document.querySelectorAll(\"[class*='close'], button\"))\n          .find((el) => {\n            if (el.closest(\"#otc-swarm-queen-hud\")) return false;\n            const t = (el.textContent || \"\").trim();\n            const r = el.getBoundingClientRect();\n            return (t === \"\u00d7\" || t === \"X\" || t === \"\u2715\" || /close/i.test(String(el.className))) && r.width > 0 && r.width < 80;\n          });\n        if (closeEl) dispatchFullClick(closeEl);\n      } catch (e) {}\n    };",
[
"    const closePairModal = () => {",
"      try {",
"        const esc = { key: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };",
"        document.dispatchEvent(new KeyboardEvent('keydown', esc));",
"        document.dispatchEvent(new KeyboardEvent('keyup', esc));",
"        try {",
"          if (document.activeElement) {",
"            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', esc));",
"          }",
"        } catch (e) {}",
"        const closeEl = Array.from(document.querySelectorAll(\"[class*='close'], button, svg, span\"))",
"          .find((el) => {",
"            if (el.closest('#otc-swarm-queen-hud')) return false;",
"            const r = el.getBoundingClientRect();",
"            if (!(r.width > 0 && r.width < 90 && r.height > 0 && r.height < 90)) return false;",
"            const t = (el.textContent || '').trim();",
"            const looksClose = t === '\u00d7' || t === 'X' || t === '\u2715' || /close/i.test(String(el.className)) || /close/i.test(String(el.getAttribute && el.getAttribute('aria-label') || ''));",
"            if (!looksClose) return false;",
"            // walk up to the real clickable control if we matched an inner icon",
"            return true;",
"          });",
"        if (closeEl) {",
"          const clickable = closeEl.closest('button, [role=\'button\'], div, span') || closeEl;",
"          dispatchFullClick(clickable);",
"        }",
"      } catch (e) {}",
"    };"
].join('\n'));
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 5');
