const fs = require('fs');
const f = 'extension/dist/content.js';
let s = fs.readFileSync(f, 'utf8');
let ok = 0;

function replaceOnce(from, to) {
  const i = s.indexOf(from);
  if (i === -1) throw new Error('pattern not found: ' + from.slice(0, 70));
  s = s.slice(0, i) + to + s.slice(i + from.length);
}

// ── 1. Robust pair switching: click → verify → asset-picker fallback ────────
const startMarker = '  function switchQuotexDomPair(targetAsset) {';
const endMarker = '  // Extension Runtime Message Listener';
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);
if (start === -1 || end === -1 || end <= start) throw new Error('switchQuotexDomPair block not found');

const newSwitch = [
'  /**',
'   * Verify a pair switch actually took effect. If the top-bar click did not land',
'   * (pair hidden in the scrolled tab strip, renamed tab, ...), automatically fall',
'   * back to the searchable asset picker — and report failure honestly so the',
'   * auto-trade engine may retry on the next candle instead of giving up silently.',
'   */',
'  function scheduleSwitchVerification(asset, delay, pickerTried) {',
'    setTimeout(() => {',
'      try {',
'        const detected = detectActiveQuotexAsset();',
'        const domAsset = detected && detected.asset;',
'        if (!domAsset || domAsset === asset) {',
'          // Switch confirmed (or DOM not conclusive yet) — clear the failure flag.',
'          STATE.autoTrade.lastSwitchFailed = false;',
'          return;',
'        }',
'        if (STATE.lockedAsset === asset) {',
'          STATE.lockUntil = Math.max(STATE.lockUntil, Date.now() + 15000);',
'        }',
'        if (!pickerTried) {',
"          console.warn('[OTC Swarm Queen] top-bar switch to ' + asset + ' did not take effect (DOM shows ' + domAsset + '); trying the asset picker...');",
'          selectPairViaAssetPicker(asset).then((clicked) => {',
'            if (clicked) {',
'              handleNewRealTick(asset, detectQuotexPrice(), "PICKER_SWITCH");',
'              scheduleSwitchVerification(asset, 800, true);',
'            } else {',
'              STATE.autoTrade.lastSwitchFailed = true;',
"              console.warn('[OTC Swarm Queen] could not switch to ' + asset + ' via the asset picker either.');",
'            }',
'          });',
'        } else {',
'          STATE.autoTrade.lastSwitchFailed = true;',
"          console.warn('[OTC Swarm Queen] Quotex did not confirm switch to ' + asset + ' (DOM shows ' + domAsset + '); keeping manual lock.');",
'        }',
'      } catch (e) {}',
'    }, delay);',
'  }',
'',
'  function switchQuotexDomPair(targetAsset) {',
'    if (!targetAsset) return { success: false, reason: "NO_ASSET_SPECIFIED" };',
'    const asset = normalizeAssetName(targetAsset) || targetAsset;',
'',
'    // Lock FIRST: even if the DOM click cannot be confirmed, the panel keeps showing the',
'    // selected pair\'s signal instead of jumping back to the previously detected pair.',
'    lockManualAsset(asset, "SWITCH_PAIR_REQUEST", 30000);',
'    STATE.lastSwitchAttempt = { asset: asset, at: Date.now() };',
'',
'    try {',
'      const tabEl = findTopBarTabElement(asset);',
'      if (!tabEl) {',
'        warnMissingPairOnce(asset);',
'        // Quotex shows only a handful of pairs in the visible top bar. Go straight to',
'        // the searchable asset picker; verification + retry continues from there.',
'        selectPairViaAssetPicker(asset).then((clicked) => {',
'          if (!clicked) {',
'            STATE.autoTrade.lastSwitchFailed = true;',
'            console.warn("[OTC Swarm Queen] " + asset + " was not found in the asset picker either - Quotex may not offer this pair on this account.");',
'            return;',
'          }',
'          try {',
'            handleNewRealTick(asset, detectQuotexPrice(), "PICKER_SWITCH");',
'            scheduleSwitchVerification(asset, 800, true);',
'          } catch (e) {}',
'        });',
'        return { success: false, reason: "TAB_ELEMENT_NOT_FOUND_TRYING_PICKER", asset: asset, locked: true };',
'      }',
'',
'      dispatchFullClick(tabEl);',
'      const price = detectQuotexPrice();',
'      handleNewRealTick(asset, price, "USER_SWITCH_PAIR");',
'      // If the click did not really change the chart, the asset-picker fallback',
'      // fires automatically from the verification step.',
'      scheduleSwitchVerification(asset, 600, false);',
'',
'      return { success: true, asset: asset, locked: true };',
'    } catch (e) {',
'      STATE.autoTrade.lastSwitchFailed = true;',
'      return { success: false, reason: e.message, asset: asset, locked: true };',
'    }',
'  }',
'',
''].join('\n');
s = s.slice(0, start) + newSwitch + s.slice(end);
ok++;

// ── 2. findTopBarTabElement: accept slightly wider/looser tab candidates ────
replaceOnce(
  '      const rect = el.getBoundingClientRect();\n      if (rect.top < 0 || rect.top > 140) continue;\n      if (rect.width < 45 || rect.width > 260 || rect.height < 18 || rect.height > 70) continue;',
  '      const rect = el.getBoundingClientRect();\n      if (rect.top < 0 || rect.top > 170) continue;\n      if (rect.width < 35 || rect.width > 320 || rect.height < 16 || rect.height > 80) continue;'
);
ok++;

// ── 3. follow-best: retry on failed switch, 1-candle cooldown, looser data gate ──
replaceOnce(
  "          const hasLocalData = (lastTickAt && nowMs - lastTickAt < 15000) || (lastCandleAt && nowMs - lastCandleAt < 120000);\n          if (!hasLocalData) {\n            noteSkip('best signal (' + best.asset + ' ' + best.direction + ' ' + Math.round((best.confidence || 0) * 100) + '%) lives in another tab - that tab will trade it');\n          } else if (at.lastFollowBestCandle !== null && candleKey - at.lastFollowBestCandle < 2) {\n            noteSkip('giving ' + pairAsset + ' time to produce a fresh verdict after the switch (' + (2 - (candleKey - at.lastFollowBestCandle)) + ' candle(s) left)');\n          } else {",
  "          // Same-page pair lists stream candle history for every open pair, so accept\n          // candles up to 10 minutes old for SWITCHING (the trade itself still needs a\n          // fresh verdict from the engine after the chart actually changes).\n          const hasLocalData = (lastTickAt && nowMs - lastTickAt < 15000) || (lastCandleAt && nowMs - lastCandleAt < 600000);\n          if (!hasLocalData) {\n            noteSkip('best signal (' + best.asset + ' ' + best.direction + ' ' + Math.round((best.confidence || 0) * 100) + '%) lives in another tab - that tab will trade it');\n          } else if (!at.lastSwitchFailed && at.lastFollowBestCandle !== null && candleKey - at.lastFollowBestCandle < 1) {\n            noteSkip('switched last candle - giving ' + pairAsset + ' time to stream its fresh verdict');\n          } else {"
);
ok++;

// ── 4. allow an immediate retry when the previous switch attempt failed ─────
replaceOnce(
  '      if (at.followBest && at.lastSwitchCandleKey !== candleKey) {',
  '      if (at.followBest && (at.lastSwitchCandleKey !== candleKey || at.lastSwitchFailed)) {'
);
ok++;

fs.writeFileSync(f, s);
console.log('applied edits:', ok, '/ 4');
