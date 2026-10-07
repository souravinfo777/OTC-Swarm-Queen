/**
 * OTC Swarm Queen - Multi-Tab Popup Controller
 * Version: 1.0.4
 * 
 * 100% ZERO MANUAL INPUT NEEDED
 * Automatically scans and displays all open Quotex tabs with live Queen signals!
 */

const DEFAULT_DEV_URL = "https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app";
const DEFAULT_PRE_URL = "https://ais-pre-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app";
const DEFAULT_LOCAL_URL = "http://localhost:3000";

let activeUrl = DEFAULT_DEV_URL;
let isWebAppConnected = false;

// Load saved Web App URL
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["webAppUrl", "webAppConnected"], function(res) {
    if (res && res.webAppUrl) {
      activeUrl = res.webAppUrl;
      const inp = document.getElementById("webAppUrlInput");
      if (inp) inp.value = activeUrl;
    }
    if (res && res.webAppConnected !== undefined) {
      isWebAppConnected = res.webAppConnected;
    }
    verifyCloudConnection(activeUrl, false);
  });
} else {
  verifyCloudConnection(activeUrl, false);
}

async function verifyCloudConnection(targetUrl, isManualClick = false) {
  const connectBtn = document.getElementById("connectBtn");
  const webAppBadge = document.getElementById("webAppStatusBadge");
  const urlClean = (targetUrl || activeUrl).trim().replace(/\/$/, "");

  if (isManualClick && connectBtn) {
    connectBtn.textContent = "Connecting...";
    connectBtn.style.background = "#d97706";
  }

  try {
    const res = await fetch(urlClean + "/api/swarm/state", { mode: "cors" });
    if (res.ok) {
      const cloudState = await res.json();
      isWebAppConnected = true;

      if (connectBtn) {
        connectBtn.textContent = "✓ Linked 🟢";
        connectBtn.style.background = "#059669";
      }
      if (webAppBadge) {
        webAppBadge.textContent = "CONNECTED 🟢";
        webAppBadge.style.background = "#065f46";
        webAppBadge.style.color = "#34d399";
      }

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ webAppUrl: urlClean, webAppConnected: true });
      }

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "SET_WEB_APP_URL",
          url: urlClean,
          cloudState: cloudState
        });
      }
    } else {
      handleConnectionFailure(connectBtn, webAppBadge, "HTTP " + res.status);
    }
  } catch (err) {
    handleConnectionFailure(connectBtn, webAppBadge, "Offline");
  }

  if (isManualClick && connectBtn) {
    setTimeout(function() {
      if (isWebAppConnected) {
        connectBtn.textContent = "✓ Linked 🟢";
        connectBtn.style.background = "#059669";
      } else {
        connectBtn.textContent = "Connect";
        connectBtn.style.background = "#2563eb";
      }
      updatePopupUI();
    }, 1500);
  }
}

function handleConnectionFailure(connectBtn, webAppBadge, reason) {
  isWebAppConnected = false;
  if (connectBtn) {
    connectBtn.textContent = reason;
    connectBtn.style.background = "#dc2626";
  }
  if (webAppBadge) {
    webAppBadge.textContent = "DISCONNECTED 🔴";
    webAppBadge.style.background = "#7f1d1d";
    webAppBadge.style.color = "#fca5a5";
  }
}

function updatePopupUI() {
  if (typeof chrome === "undefined" || !chrome.runtime) return;

  chrome.runtime.sendMessage({ type: "GET_SWARM_STATE" }, function(state) {
    if (!state) return;

    const connStatus = document.getElementById("connStatus");
    const assetVal = document.getElementById("assetVal");
    const priceVal = document.getElementById("priceVal");
    const confluenceVal = document.getElementById("confluenceVal");
    const queenDir = document.getElementById("queenDir");
    const queenConf = document.getElementById("queenConf");
    const queenCons = document.getElementById("queenCons");
    const queenEvidence = document.getElementById("queenEvidence");
    const workersGrid = document.getElementById("workersGrid");
    const quotexFooter = document.getElementById("quotexFooterStatus");
    const webAppFooter = document.getElementById("webAppFooterStatus");
    const multiTabsContainer = document.getElementById("multiTabsContainer");
    const tabsCountBadge = document.getElementById("tabsCountBadge");
    const scannedTabsIndicator = document.getElementById("scannedTabsIndicator");

    const visionVerdict = document.getElementById("visionVerdict");
    const visionMeta = document.getElementById("visionMeta");
    const visionTrend = document.getElementById("visionTrend");
    const visionScanBtn = document.getElementById("visionScanBtn");

    // --- MISTRAL VISION SCAN (v1.3) ---
    if (visionScanBtn && !visionScanBtn.__visionWired) {
      visionScanBtn.__visionWired = true;
      visionScanBtn.addEventListener("click", function () {
        visionScanBtn.textContent = "SCANNING…";
        visionScanBtn.disabled = true;
        chrome.runtime.sendMessage({ type: "RUN_VISION_SCAN" }, function (res) {
          if (chrome.runtime.lastError) { /* ignore */ }
          setTimeout(function () { visionScanBtn.textContent = "SCAN NOW"; visionScanBtn.disabled = false; }, 8000);
        });
      });
    }
    // --- FLOATING HUD VISIBILITY TOGGLE (v1.3.3) ---
    const hudToggleBtn = document.getElementById("hudToggleBtn");
    if (hudToggleBtn && !hudToggleBtn.__hudWired) {
      hudToggleBtn.__hudWired = true;
      const sendHudMsg = function (msg, cb) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          const tab = (tabs || [])[0];
          if (!tab || !tab.id) { if (cb) cb(null); return; }
          try {
            chrome.tabs.sendMessage(tab.id, msg, function (res) {
              if (chrome.runtime.lastError) { if (cb) cb(null); return; }
              if (cb) cb(res);
            });
          } catch (e) { if (cb) cb(null); }
        });
      };
      const refreshHudLabel = function (res) {
        hudToggleBtn.textContent = res && res.hidden ? "SHOW HUD ON CHART" : "HIDE HUD ON CHART";
      };
      sendHudMsg({ action: "TOGGLE_HUD", get: true }, refreshHudLabel);
      hudToggleBtn.addEventListener("click", function () {
        sendHudMsg({ action: "TOGGLE_HUD" }, refreshHudLabel);
      });
    }
    const vScan = state.visionScan;
    if (visionVerdict && visionMeta) {
      if (vScan && vScan.signal && vScan.signal !== "NONE") {
        visionVerdict.textContent = (vScan.asset ? vScan.asset.split(" ")[0] + ": " : "") + vScan.signal + " " + Math.round((vScan.confidence || 0) * 100) + "%";
        visionVerdict.style.color = vScan.signal === "UP" ? "#34d399" : "#f87171";
        visionMeta.textContent = (vScan.trend || "") + " • " + (vScan.momentum || "");
      } else if (vScan) {
        visionVerdict.textContent = "UNCLEAR";
        visionVerdict.style.color = "#94a3b8";
        visionMeta.textContent = vScan.asset || "";
      }
    }
    const cQueen = state.combinedQueen;
    if (visionTrend && cQueen && cQueen.direction && cQueen.direction !== "HOLD") {
      const isQuick = cQueen.status === "QUICK_SIGNAL";
      visionTrend.innerHTML = "👑 QUEEN COMBINED" + (isQuick ? " <span style=\"color:#fbbf24;\">⚡QUICKFIRE</span>" : "") + ": <b style=\"color:" + (cQueen.direction === "UP" ? "#34d399" : "#f87171") + "\">" + cQueen.direction + " " + Math.round((cQueen.confidence || 0) * 100) + "%</b> • consensus " + Math.round((cQueen.consensus || 0) * 100) + "%";
    }

    const hasLiveTicks = state.connected && (state.currentPrice > 0 || (state.activePairs && Object.keys(state.activePairs).length > 0));

    // --- FOCUSED PAIR OWNERSHIP ---
    // ALWAYS show the signal of the pair displayed above (never another pair's signal),
    // and show whether the pair is user-SELECTED (pinned) or AUTO-followed from Quotex.
    const focusedAsset = state.focusedAsset || state.asset;
    const isLocked = Boolean(state.isLocked) || state.pairSelectionMode === "MANUAL";
    const focusedSignal =
      state.focusedPairSignal ||
      (focusedAsset && state.pairSignals && state.pairSignals[focusedAsset]) ||
      state.queenSignal;

    // Master Status Badge
    if (connStatus) {
      if (hasLiveTicks) {
        connStatus.textContent = "LIVE ACTIVE 🟢";
        connStatus.className = "badge badge-live";
        connStatus.style.background = "#065f46";
        connStatus.style.color = "#34d399";
      } else {
        connStatus.textContent = "SCANNING TABS 🟡";
        connStatus.className = "badge";
        connStatus.style.background = "#78350f";
        connStatus.style.color = "#fde68a";
      }
    }

    // Active Pairs / Scanned Tabs List
    const activePairsMap = state.activePairs || {};
    const pairKeys = Object.keys(activePairsMap);
    const tabsCount = pairKeys.length;

    if (tabsCountBadge) {
      tabsCountBadge.textContent = tabsCount > 0 ? `${tabsCount} Tabs Streaming 🟢` : "Scanning Tabs...";
      tabsCountBadge.style.color = tabsCount > 0 ? "#34d399" : "#94a3b8";
    }

    if (scannedTabsIndicator) {
      scannedTabsIndicator.textContent = tabsCount > 0 ? `🟢 ${tabsCount} Quotex Tabs Online` : "🔍 Scanning Open Tabs...";
      scannedTabsIndicator.style.color = tabsCount > 0 ? "#34d399" : "#38bdf8";
    }

    // Error Notice Box
    const errBox = document.getElementById("detectionErrorBox");
    const errText = document.getElementById("detectionErrorText");
    if (errBox && errText) {
      if (state.lastError && (!state.asset || tabsCount === 0)) {
        errBox.style.display = "block";
        errText.textContent = state.lastError;
      } else {
        errBox.style.display = "none";
      }
    }

    // Render Multi-Tab Live Radar
    if (multiTabsContainer) {
      if (tabsCount === 0) {
        multiTabsContainer.innerHTML = `
          <div style="text-align:center; padding:10px 0; color:#94a3b8; font-size:10px;">
            ${state.lastError ? '<span style="color:#f87171;">⚠️ ' + state.lastError + '</span>' : 'Scanning open Quotex tabs (e.g. USD/BDT, GBP/NZD)...'}
          </div>
        `;
      } else {
        multiTabsContainer.innerHTML = "";
        pairKeys.forEach(pairName => {
          const pairData = activePairsMap[pairName] || {};
          const isCurrent = pairName === focusedAsset;
          // Payout shown only when the tab actually reported one — no 85% default.
          const pPayout = pairData.payoutPct || (pairData.payout ? Math.round(pairData.payout * 100) : null);
          const pPrice = pairData.currentPrice > 0 ? (pairData.currentPrice > 10 ? pairData.currentPrice.toFixed(3) : pairData.currentPrice.toFixed(5)) : "";
          const pSignal = pairData.queenSignal;
          const pDir = pSignal ? pSignal.direction : "HOLD";
          const pConf = pSignal ? Math.round((pSignal.confidence || 0) * 100) : 0;
          const pPower = pSignal ? Math.round((pSignal.power || 0) * 100) : 0;
          const pAwaiting = Boolean(pSignal && pSignal.status === "AWAITING_LIVE_TICKS");
          const isUp = pDir === "CALL" || pDir === "UP";
          const isDown = pDir === "PUT" || pDir === "DOWN";

          const item = document.createElement("div");
          item.className = `radar-item ${isCurrent ? "active" : ""}`;
          item.title = `Click to switch Quotex to ${pairName} and focus its 20-worker breakdown`;

          item.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="width:6px; height:6px; border-radius:50%; background:${isCurrent ? '#38bdf8' : '#10b981'};"></span>
              <span style="font-weight:bold; color:${isCurrent ? '#38bdf8' : '#f1f5f9'}; font-size:11px;">${pairName}</span>
              ${pPayout ? `<span style="font-size:9px; background:#064e3b; color:#34d399; padding:0 3px; border-radius:2px; font-weight:bold;">${pPayout}%</span>` : ''}
              ${pPrice ? `<span style="color:#94a3b8; font-size:9.5px; font-family:monospace;">${pPrice}</span>` : ''}
              ${isCurrent ? '<span style="font-size:8px; background:#0284c7; color:#fff; padding:0 3px; border-radius:2px; font-weight:800;">ACTIVE</span>' : ''}
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <span class="radar-signal ${isUp ? 'sig-call' : isDown ? 'sig-put' : 'sig-hold'}">
                ${pAwaiting ? 'NO DATA' : isUp ? 'CALL \u2B06 ' + pConf + '%' : isDown ? 'PUT \u2B07 ' + pConf + '%' : 'HOLD \u23F8'}
              </span>
              ${!pAwaiting && (isUp || isDown)
                ? `<span style="font-size:8.5px; color:${pPower >= 60 ? '#34d399' : pPower >= 35 ? '#fbbf24' : '#94a3b8'}; font-weight:800;">PWR ${pPower}%</span>`
                : ''}
            </div>
            ${pAwaiting ? `<div style="font-size:8.5px; color:#64748b; margin-top:2px;">click to open this pair and load its feed</div>` : ''}
          `;

          item.addEventListener("click", function() {
            chrome.runtime.sendMessage({
              type: "SELECT_DETECTED_PAIR",
              asset: pairName
            }, function() {
              updatePopupUI();
            });
          });

          multiTabsContainer.appendChild(item);
        });
      }
    }

    // Footers
    if (quotexFooter) {
      quotexFooter.textContent = tabsCount > 0 ? `Quotex: 🟢 ${tabsCount} Tabs Streaming` : (state.lastError ? "Quotex: 🔴 Pair Error" : "Quotex: 🟡 Scanning Tabs...");
      quotexFooter.style.color = tabsCount > 0 ? "#34d399" : (state.lastError ? "#f87171" : "#fbbf24");
    }
    if (webAppFooter) {
      webAppFooter.textContent = isWebAppConnected ? "Web App: 🟢 Linked" : "Web App: 🔴 Offline";
      webAppFooter.style.color = isWebAppConnected ? "#34d399" : "#f87171";
    }

    // Focused Asset
    // Focused Asset (+ SELECTED / AUTO ownership badge and best-signal pair)
    const modeBadge = document.getElementById("pairModeBadge");
    if (modeBadge) {
      modeBadge.textContent = isLocked ? "SELECTED 🔒" : "AUTO ⚡";
      modeBadge.style.background = isLocked ? "#065f46" : "#334155";
      modeBadge.style.color = isLocked ? "#34d399" : "#cbd5e1";
      modeBadge.style.borderColor = isLocked ? "#059669" : "#475569";
      modeBadge.title = isLocked
        ? "This pair is pinned by your selection - Quotex tab changes will not override it."
        : "Following the active Quotex tab automatically.";
    }

    const bestPairVal = document.getElementById("bestPairVal");
    if (bestPairVal) {
      const best = state.bestPair;
      // Only a real CALL/PUT setup is ever surfaced as "best pair" - a stale or neutral
      // HOLD used to sit in this row and read as if another pair were tradeable.
      if (best && best.asset && best.asset !== focusedAsset && best.direction !== "HOLD") {
        bestPairVal.textContent = `${best.asset} • ${best.direction} ${Math.round((best.confidence || 0) * 100)}%`;
        bestPairVal.style.color = best.direction === "CALL" ? "#34d399" : "#f87171";
        bestPairVal.title = `Signal power ${Math.round((best.power || 0) * 100)}%`;
      } else if (focusedAsset) {
        bestPairVal.textContent = "No other setup right now";
        bestPairVal.style.color = "#64748b";
        bestPairVal.title = "A corner notification appears when another open pair produces a CALL/PUT.";
      } else {
        bestPairVal.textContent = "--";
        bestPairVal.style.color = "#94a3b8";
        bestPairVal.title = "";
      }
    }

    if (assetVal) {
      assetVal.textContent = focusedAsset ? focusedAsset : "Detecting Quotex Tab...";
      assetVal.style.color = focusedAsset ? "#38bdf8" : "#94a3b8";
    }

    // Price
    if (priceVal) {
      if (state.currentPrice > 0) {
        const p = Number(state.currentPrice);
        priceVal.textContent = p > 10 ? p.toFixed(3) : p.toFixed(5);
        priceVal.style.color = "#34d399";
      } else {
        priceVal.textContent = "Awaiting Quotex...";
        priceVal.style.color = "#94a3b8";
      }
    }

    // Confluence — no fabricated default: without a real feature vector this reads "--".
    if (confluenceVal) {
      const q = focusedSignal;
      if (q && q.confluenceScore !== undefined && q.confluenceScore > 0) {
        const dir = q.direction || "HOLD";
        const trend = dir === "CALL" || dir === "UP" ? "BULLISH" : dir === "PUT" || dir === "DOWN" ? "BEARISH" : "BALANCED";
        confluenceVal.textContent = `${q.confluenceScore} / 100 (${trend})`;
        confluenceVal.style.color = trend === "BULLISH" ? "#34d399" : trend === "BEARISH" ? "#f87171" : "#38bdf8";
      } else {
        confluenceVal.textContent = "-- / 100";
        confluenceVal.style.color = "#94a3b8";
      }
    }

    // Queen Signal Box (Next Candle & Round Number) - rendered from the FOCUSED pair
    if (focusedSignal && queenDir && queenConf && queenCons) {
      const q = focusedSignal;
      const dir = q.direction || "HOLD";
      const isCall = dir === "CALL" || dir === "UP";
      const isPut = dir === "PUT" || dir === "DOWN";
      // "Warming up" = not enough data to judge yet. It is NOT a HOLD verdict, so it
      // must not be dressed up as one (that is what showed a fake 50% HOLD at startup).
      const warmingUp = Boolean(q.warmingUp || q.status === "WARMING_UP");

      queenDir.textContent = warmingUp
        ? "GATHERING DATA…"
        : isCall ? "NEXT CANDLE: CALL ⬆ (UP)"
        : isPut ? "NEXT CANDLE: PUT ⬇ (DOWN)"
        : "NEXT CANDLE: HOLD ⏸";
      queenDir.className = "queen-direction " + (warmingUp ? "dir-hold" : isCall ? "dir-up" : isPut ? "dir-down" : "dir-hold");

      // No fabricated default: a missing confidence must read as "--", not 70%.
      // (The old `|| 0.70` fallback printed a confident 70% while the engine had no
      // data at all, because 0 is falsy.)
      const confPct = warmingUp ? null : Math.round((q.confidence || 0) * 100);
      queenConf.textContent = confPct === null ? "--" : confPct + "%";
      queenConf.style.color = warmingUp ? "#64748b" : isCall ? "#34d399" : isPut ? "#f87171" : "#f1f5f9";

      const upN = q.upVotes || 0;
      const downN = q.downVotes || 0;
      const holdN = q.holdVotes || 0;
      const maxVotes = Math.max(upN, downN);
      const totalN = upN + downN + holdN || 20;
      // Honest consensus. The old fallback of "16" printed a fabricated consensus next to
      // a HOLD, which is exactly the kind of misleading readout this panel must not show.
      queenCons.textContent = warmingUp
        ? `${q.dataPoints || 0} pts`
        : (isCall || isPut ? `${maxVotes}/${totalN}` : `${holdN}/${totalN}`);

      // Signal power (0-100%): how far the swarm sits from a coin flip.
      const power = Math.max(0, Math.min(100, Math.round((q.power || 0) * 100)));
      const powerColor = power >= 60 ? "#34d399" : power >= 35 ? "#fbbf24" : "#94a3b8";
      const powerBar = document.getElementById("queenPowerBar");
      const powerVal = document.getElementById("queenPowerVal");
      if (powerBar) { powerBar.style.width = power + "%"; powerBar.style.background = powerColor; }
      if (powerVal) { powerVal.textContent = power + "%"; powerVal.style.color = powerColor; }

      if (queenEvidence) {
        const evs = q.evidence || [];
        queenEvidence.textContent = evs.length > 0 ? evs.slice(0, 2).join(" • ") : "Analyzing live order flow and liquidity sweeps...";
      }

      // Live M1 candle expiry countdown.
      // Shared with the HUD and the web app: it is derived from the candle phase pushed by
      // the content script (which reads Quotex's own on-chart countdown badge), so the
      // signal expiry and the Quotex 1-minute candle expiry always show the same number.
      const timerBadge = document.getElementById("candleCountdownTimer");
      if (timerBadge) {
        const phase = state.candlePhase ||
          (q && q.candleExpirySeconds !== undefined
            ? { remainingSec: q.candleExpirySeconds, closeAt: q.candleCloseAt, totalSec: 60 }
            : null);

        let sec;
        if (phase && phase.closeAt) {
          sec = Math.round((phase.closeAt - Date.now()) / 1000);
        } else if (phase) {
          sec = phase.remainingSec;
        } else {
          sec = 60 - (Math.floor(Date.now() / 1000) % 60);
        }
        sec = Math.max(0, Math.min(60, sec));

        const isEntry = sec <= 8;
        timerBadge.textContent = isEntry
          ? `🔥 ENTRY NOW (00:${String(sec).padStart(2, '0')}s)`
          : `⏱ M1 EXPIRY: 00:${String(sec).padStart(2, '0')}s`;
        timerBadge.style.background = isEntry ? "#991b1b" : "#0f172a";
        timerBadge.style.color = isEntry ? "#fef2f2" : "#38bdf8";
        timerBadge.style.borderColor = isEntry ? "#ef4444" : "#334155";
      }

      // Optimal Round Number SnR Card
      const roundLevelEl = document.getElementById("optimalRoundLevel");
      const roundLabelEl = document.getElementById("roundLabel");
      const roundPipsEl = document.getElementById("roundPips");
      const roundSupportEl = document.getElementById("roundSupport");
      const roundResistanceEl = document.getElementById("roundResistance");

      const rData = q.roundLevels;
      if (rData && roundLevelEl) {
        roundLevelEl.textContent = `@ ${rData.optimalRound}`;
        roundLevelEl.style.color = isCall ? "#34d399" : isPut ? "#f87171" : "#38bdf8";
        if (roundLabelEl) roundLabelEl.textContent = rData.label || "Round SnR";
        if (roundPipsEl) roundPipsEl.textContent = `${rData.pipsDiff || '0.0'} pips`;
        if (roundSupportEl) roundSupportEl.textContent = rData.lowerRound || "0.000";
        if (roundResistanceEl) roundResistanceEl.textContent = rData.upperRound || "0.000";
      }
    }

    // 20 Worker Grid
    if (workersGrid && state.workers && state.workers.length > 0) {
      workersGrid.innerHTML = "";
      state.workers.forEach(function(w) {
        const chip = document.createElement("div");
        const dec = w.vote || (w.lastDecision && w.lastDecision.decision) || "HOLD";
        const isUp = dec === "CALL" || dec === "UP";
        const isDown = dec === "PUT" || dec === "DOWN";
        chip.className = "worker-chip " + (isUp ? "worker-up" : isDown ? "worker-down" : "worker-hold");
        chip.title = `${w.name || 'Fly #' + w.id}\nVote: ${dec}\nWeight: ${w.weight ? w.weight.toFixed(2) : '1.0'}`;
        chip.innerHTML = `#${w.id}<br><span style='font-size:7.5px;font-weight:900;'>${isUp ? 'CALL' : isDown ? 'PUT' : 'HOLD'}</span>`;
        workersGrid.appendChild(chip);
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", function() {
  // --- AUTO-TRADE TOGGLE (extension places the trade itself, per signal) ---
  const atToggle = document.getElementById("autoTradeToggle");
  const atAmount = document.getElementById("autoTradeAmount");
  const atApply = document.getElementById("autoTradeApply");
  const atStatus = document.getElementById("autoTradeStatus");
  const atFollowBest = document.getElementById("autoTradeFollowBest");
  const atMinConf = document.getElementById("autoTradeMinConf");
  const atMaxRepeat = document.getElementById("autoTradeMaxRepeat");
  const atCooldown = document.getElementById("autoTradeCooldown");

  const renderAutoTrade = function(at) {
    if (!atToggle || !at) return;
    atToggle.textContent = at.enabled ? "ON 🟢" : "OFF";
    atToggle.dataset.enabled = at.enabled ? "true" : "false";
    atToggle.style.background = at.enabled ? "#065f46" : "#7f1d1d";
    atToggle.style.color = at.enabled ? "#34d399" : "#fca5a5";
    if (atAmount && document.activeElement !== atAmount) atAmount.value = at.amount || 1;
    if (atFollowBest) atFollowBest.checked = !!at.followBest;
    if (atMinConf && document.activeElement !== atMinConf) atMinConf.value = String(at.minConfidence || 0.6);
    if (atMaxRepeat) atMaxRepeat.value = String(at.maxRepeat === 0 ? 0 : (at.maxRepeat || 3));
    if (atCooldown) atCooldown.value = String(at.repeatCooldownCandles || 2);
    if (atStatus) {
      const confTxt = "confidence ≥ " + Math.round((at.minConfidence || 0.65) * 100) + "%";
      if (!at.enabled) {
        atStatus.textContent = "OFF — the extension will not place any trade by itself. Trades fire only in the entry window (last ~8s) of the candle, one per candle, when " + confTxt + ". Last attempt: " + (at.lastResult ? (at.lastResult.ok ? "✓ " + at.lastResult.direction + " $" + at.lastResult.amount : "✗ " + (at.lastResult.reason || "failed")) : "none");
        atStatus.style.color = "#64748b";
        return;
      }
      const last = at.lastResult
        ? (at.lastResult.ok ? "✓ " + at.lastResult.direction + " $" + at.lastResult.amount + " on " + (at.lastResult.asset || "") : "✗ " + (at.lastResult.reason || "failed"))
        : "none yet";
      // Live skip reason: WHY the engine is not trading right now (HOLD, weak signal,
      // following another pair, ...) — shown so the user is never left guessing.
      const skip = at.lastSkip && at.lastResult && at.lastSkip.at > at.lastResult.at
        ? at.lastSkip.reason
        : null;
      atStatus.textContent = "ON — " + confTxt + ", one trade per candle" + (at.followBest ? ", follows best signal pair" : "") + ". Last attempt: " + last + (skip ? " • Now: " + skip : "");
      atStatus.style.color = skip ? "#fbbf24" : "#34d399";
    }
  };

  if (atToggle) {
    atToggle.addEventListener("click", function() {
      const enable = atToggle.dataset.enabled !== "true";
      // Route through the active Quotex tab's content script (it owns the engine).
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = (tabs || [])[0];
        if (!tab || !tab.id) return;
        try {
          chrome.tabs.sendMessage(tab.id, { action: "SET_AUTO_TRADE", enabled: enable }, function(res) {
            if (chrome.runtime.lastError || !res) {
              atStatus.textContent = "Open a Quotex tab first — the engine lives there.";
              atStatus.style.color = "#f87171";
              return;
            }
            renderAutoTrade(res.autoTrade);
          });
        } catch (e) {}
      });
    });
  }
  if (atApply && atAmount) {
    atApply.addEventListener("click", function() {
      const amount = Math.max(1, Math.min(1000, Number(atAmount.value) || 1));
      const minConfidence = Number((atMinConf && atMinConf.value) || "0.6") || 0.6;
      const maxRepeat = parseInt((atMaxRepeat && atMaxRepeat.value) || "3", 10);
      const repeatCooldownCandles = parseInt((atCooldown && atCooldown.value) || "2", 10);
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = (tabs || [])[0];
        if (!tab || !tab.id) return;
        try {
          chrome.tabs.sendMessage(tab.id, { action: "SET_AUTO_TRADE", amount: amount, minConfidence: minConfidence, maxRepeat: maxRepeat, repeatCooldownCandles: repeatCooldownCandles }, function(res) {
            if (chrome.runtime.lastError || !res) return;
            renderAutoTrade(res.autoTrade);
          });
        } catch (e) {}
      });
    });
  }
  if (atFollowBest) {
    atFollowBest.addEventListener("change", function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = (tabs || [])[0];
        if (!tab || !tab.id) return;
        try {
          chrome.tabs.sendMessage(tab.id, { action: "SET_AUTO_TRADE", followBest: atFollowBest.checked }, function(res) {
            if (chrome.runtime.lastError || !res) return;
            renderAutoTrade(res.autoTrade);
          });
        } catch (e) {}
      });
    });
  }
  // Load current auto-trade state from the focused Quotex tab.
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const tab = (tabs || [])[0];
    if (!tab || !tab.id) return;
    try {
      chrome.tabs.sendMessage(tab.id, { action: "GET_AUTO_TRADE" }, function(res) {
        if (chrome.runtime.lastError || !res) return;
        renderAutoTrade(res.autoTrade);
      });
    } catch (e) {}
  });

  // Show the running extension version in the popup footer
  const versionLine = document.getElementById("extVersionLine");
  if (versionLine && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
    try {
      const m = chrome.runtime.getManifest();
      versionLine.textContent = "OTC Swarm Queen extension v" + m.version;
    } catch (e) { /* manifest unavailable */ }
  }

  const connectBtn = document.getElementById("connectBtn");
  const quickDevBtn = document.getElementById("quickDevBtn");
  const quickPreBtn = document.getElementById("quickPreBtn");
  const quickLocalBtn = document.getElementById("quickLocalBtn");
  const urlInput = document.getElementById("webAppUrlInput");

  if (urlInput) {
    urlInput.addEventListener("click", function() {
      this.select();
    });
  }

  if (quickDevBtn && urlInput) {
    quickDevBtn.addEventListener("click", function() {
      urlInput.value = DEFAULT_DEV_URL;
      verifyCloudConnection(DEFAULT_DEV_URL, true);
    });
  }
  if (quickPreBtn && urlInput) {
    quickPreBtn.addEventListener("click", function() {
      urlInput.value = DEFAULT_PRE_URL;
      verifyCloudConnection(DEFAULT_PRE_URL, true);
    });
  }
  if (quickLocalBtn && urlInput) {
    quickLocalBtn.addEventListener("click", function() {
      urlInput.value = DEFAULT_LOCAL_URL;
      verifyCloudConnection(DEFAULT_LOCAL_URL, true);
    });
  }

  if (connectBtn && urlInput) {
    connectBtn.addEventListener("click", function() {
      let targetUrl = urlInput.value.trim().replace(/\/$/, "");
      if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;
      urlInput.value = targetUrl;
      verifyCloudConnection(targetUrl, true);
    });
  }

  // Trigger immediate scan on popup open
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "FORCE_AUTO_CONNECT" }, function() {
      updatePopupUI();
    });
  }

  updatePopupUI();
  setInterval(updatePopupUI, 400);

  // Self-healing bridge watch:
  // the CONNECTED/DISCONNECTED badge only refreshed on popup open or on a manual click,
  // so a transient failure left it stuck on "DISCONNECTED 🔴" even after the web app
  // came back. Re-verify quietly every 4s (using the URL currently in the box) so the
  // badge always reflects reality without the user having to press Connect again.
  let lastBridgeVerifyAt = 0;
  setInterval(function() {
    const now = Date.now();
    if (now - lastBridgeVerifyAt < 4000) return;
    lastBridgeVerifyAt = now;
    const inp = document.getElementById("webAppUrlInput");
    const url = (inp && inp.value.trim()) || activeUrl;
    if (!url) return;
    verifyCloudConnection(url, false);
  }, 4000);
});
