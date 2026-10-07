/**
 * Popup Script for Chrome Extension
 */

function updatePopupUI() {
  chrome.runtime.sendMessage({ type: "GET_SWARM_STATE" }, (state) => {
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

    if (connStatus) {
      if (state.connected) {
        connStatus.textContent = state.dataSource === "LIVE" ? "LIVE CONNECTED" : "DEMO CONNECTED";
        connStatus.className = state.dataSource === "LIVE" ? "badge badge-live" : "badge badge-demo";
      } else {
        connStatus.textContent = "BACKEND OFFLINE";
        connStatus.className = "badge badge-offline";
      }
    }

    if (assetVal) assetVal.textContent = state.asset || "EURUSD-OTC";
    if (priceVal) priceVal.textContent = Number(state.currentPrice).toFixed(5);

    if (confluenceVal && state.smc) {
      confluenceVal.textContent = `${state.smc.confluenceScore} / 100 (${state.smc.trend})`;
    }

    if (state.queenSignal && queenDir && queenConf && queenCons) {
      queenDir.textContent = state.queenSignal.direction;
      queenDir.className = `queen-direction dir-${state.queenSignal.direction.toLowerCase()}`;
      queenConf.textContent = `${Math.round(state.queenSignal.confidence * 100)}%`;
      queenCons.textContent = `${state.queenSignal.upVotes + state.queenSignal.downVotes}/20`;

      if (queenEvidence) {
        const evs = state.queenSignal.evidence || [];
        queenEvidence.textContent = evs.length > 0 ? evs.slice(0, 3).join(" • ") : "Normal range monitoring";
      }
    }

    if (workersGrid && state.workers && state.workers.length > 0) {
      workersGrid.innerHTML = "";
      state.workers.forEach((w: any) => {
        const chip = document.createElement("div");
        const dec = w.lastDecision?.decision || "HOLD";
        chip.className = `worker-chip worker-${dec.toLowerCase()}`;
        chip.title = `Fly #${w.id} (Gen ${w.generation})\nHealth: ${w.health}\nDecision: ${dec}`;
        chip.innerHTML = `#${w.id}<br><span style="font-size:8px;opacity:0.7;">${w.health}h</span>`;
        workersGrid.appendChild(chip);
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updatePopupUI();
  setInterval(updatePopupUI, 1000);
});
