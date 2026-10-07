# OTC SWARM QUEEN — Quotex OTC Market Analysis & Adaptive Swarm Intelligence Platform

> **Disclaimer**: This is an experimental market-analysis and paper-trading research platform designed for Quotex OTC market data. It does not provide financial advice, nor does it guarantee profitable trades or predict future prices with certainty. Live execution is disabled by default.

---

## 1. System Architecture

```
                 QUOTEX OTC BROKER
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
   CHROME EXTENSION (v1.3)      MISTRAL VISION SCANNER
   • MAIN-world WS hook         • per-candle chart screenshot
     (raw ticks & candles)      • /api/vision/scan → structured
   • DOM pair sniffer + HUD       verdict (trend, S/R, patterns,
   • multi-tab background         signal UP/DOWN + confidence)
            │                         │
            ▼                         │
        EXPRESS SERVER  ◄─────────────┘
        (localhost:3000 — REST + /ws broadcast)
            │
            ▼
   ┌─────────────────────────┐
   │      SMC ENGINE         │
   │ Structure · Liquidity   │
   │ OB · FVG · Patterns     │
   └───────────┬─────────────┘
               ▼
     FEATURE VECTOR (Confluence 0–100 + Vision verdict)
               │
               ▼
   ┌─────────────────────────┐
   │    20 WORKER FLIES      │
   │ (diverse genetic DNA,   │
   │  each with visionWeight)│
   └───────────┬─────────────┘
               ▼
          QUEEN FLY
   (arbitration & consensus → NEXT-CANDLE SIGNAL)
               │
   ┌───────────┴──────────────┐
   ▼                          ▼
WEB DASHBOARD           EXTENSION HUD/POPUP
(up/down + countdown)   (combined Queen row)
               │
               ▼
   SELF-TRAINING LOOP (every closed candle):
   • vision prediction settled vs real close
   • accuracy EWMA → Queen vision trust
   • flies that followed the vision retrain
     their own visionWeight DNA
   • losing flies die → graveyard → mutation rebirth
```

---

## 2. Installation & Quickstart

### Prerequisites
- Node.js 18+ & npm
- A **Mistral API key** (free tier works): https://console.mistral.ai

### 1. Web Application (UI + Integrated Engine + Vision API)
```bash
npm install
# put your key in .env (see .env.example)
MISTRAL_API_KEY=sk-... npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Optional Python Backend
```bash
pip install -r requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765 --reload
```

---

## 3. Chrome Extension Setup (Manifest V3)

1. Start the web app and click **DOWNLOAD EXTENSION** on the dashboard — the zip
   filename carries the extension version (e.g. `otc-swarm-queen-extension-v1.3.3.zip`).
2. `chrome://extensions` → Developer mode → **Load unpacked** → select the extracted folder.
3. Refresh any Quotex tabs that were already open (F5) so the content scripts attach.
4. Open any Quotex OTC trading chart. The floating HUD shows:
   - 👁 **Vision** — latest Mistral visual verdict for the focused pair
   - 👑 **QUEEN COMBINED** — the web app's SMC + vision + swarm consensus next-candle
     signal (⚡QUICKFIRE badge when emitted from the immediate-evidence tier)
5. The HUD can be hidden with its **✕** button or **Ctrl+Shift+H**; the popup has a
   HIDE/SHOW HUD toggle and shows the running version at the bottom.

**Vision scan flow**: every fresh 1-minute candle, the extension screenshots the chart
(only while a Quotex chart is the visible tab), crops it to the chart canvas, and POSTs
it to `/api/vision/scan`. The server asks Mistral for a strict JSON verdict, broadcasts
`VISION_UPDATE` over WebSocket, and the web app merges it into the feature vector that
**all 20 worker flies evaluate** — each through its own trained `visionWeight`.
Pair detection is resilient: DOM sniffing first, then broker-frame key extraction as a
fallback, so a tab that fails DOM detection still streams prices.

---

## 4. Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | Operating environment |
| `DATA_SOURCE` | `DEMO` | `DEMO` (simulated OTC ticks) or `LIVE` |
| `EXECUTION_MODE` | `DISABLED` | Live trade execution mode (`DISABLED` by default) |
| `HOST` | `127.0.0.1` | Local host interface |
| `PORT` | `3000` | Web app server (REST + WS + dashboard) |
| `MISTRAL_API_KEYS` | *(required for vision)* | Comma-separated key pool — on 429/401 the server rotates to the next key automatically (60s cooldown on the rejected key) |
| `MISTRAL_API_KEY` | — | Fallback single key (only used if `MISTRAL_API_KEYS` is empty) |
| `MISTRAL_VISION_MODEL` | `ministral-8b-latest` | Vision model for chart scanning (pixtral models are deprecated; mistral-small/medium are quota-blocked on free keys) |
| `MISTRAL_TEXT_MODEL` | `open-mistral-nemo` | Text model for Queen explanations |

---

## 5. Quotex Data Adapter Architecture
The application strictly isolates Quotex communication behind the extension's WS-hook + DOM sniffer layers.
- No internal component depends directly on Quotex WebSocket payloads.
- All external data is transformed into `MarketTick` and `Candle` models.
- Zero-simulation policy: no synthetic candles are ever rendered; the chart stays blank until the extension streams real ticks.

---

## 6. Server API (localhost:3000)

### Feed & State
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/swarm/quotex-feed` | POST | Extension tick/candle/pair ingest |
| `/api/swarm/state` | GET | Full state incl. `vision` + `combinedQueen` |
| `/api/swarm/queen-signal` | POST | Web app publishes the combined Queen verdict |
| `/ws` | WS | `TICK`, `SMC_UPDATE`, `QUEEN_UPDATE`, `VISION_UPDATE`, `VISION_ACCURACY`, `QUEEN_COMBINED_UPDATE`, … |

### Mistral Vision
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/vision/scan` | POST | Scan a chart screenshot (`{asset, image, price}`) → JSON verdict |
| `/api/vision/latest?asset=X` | GET | Latest scan + history + accuracy stats |
| `/api/vision/outcome` | POST | Settle a prediction vs the real candle close (self-training) |
| `/api/extension/scan-command` | GET/POST | Scan-command queue (web app → extension) |
| `/api/mistral/explain-queen` | POST | Narrative explanation of the Queen decision |

---

## 7. SMC (Smart Money Concepts) Engine
- **Market Structure**: Swing Highs/Lows, HH/HL/LH/LL, BOS, CHoCH. Zero look-ahead bias.
- **Liquidity Engine**: EQH/EQL, BSL/SSL, sweeps with wick rejections.
- **Order Block Engine**: displacement-based OB identification with freshness/mitigation.
- **FVG Engine**: 3-candle imbalance with touched/mitigated state.
- **Candle Patterns**: Engulfing, Pin Bars, Rejection Wicks, Doji, Inside Bars, Displacement.
- **Confluence Scoring**: synthesizes evidence into a 0–100 metric, then blends the fresh Mistral vision verdict.

---

## 8. 20 Worker Flies & Genetic Evolution
- **Population**: exactly 20 Worker Flies running simultaneously.
- **DNA**: individualized weights for liquidity, OBs, FVGs, structure, candles, trend, displacement, **and the Mistral vision verdict (`visionWeight`)**.
- **Health (100 init)**: grows on winning decisions, decreases on losses with compounding streak penalties.
- **Fitness**: Bayesian-smoothed win rate + rolling form + health factor.
- **Graveyard Memory**: up to 500 deceased strategies cataloged with failure contexts.
- **Rebirth**: tournament-selected parents, Gaussian-mutated DNA (including `visionWeight`).

## 8b. QuickFire — immediate thin-chart signals
The full SMC engine needs 20+ structural candles. QuickFire bridges the wait by scoring
the **last closed candle's wick/body**, the previous candle, a **5-candle liquidity
sweep**, **round-number breaks/rejections**, **3-candle momentum**, plus the
**enhancement lenses: FVG imbalance, OTC bull/bear trap detection, OTC oscillation
(cycle) patterns and a 10-candle trend context**. Signals emitted from this tier are
status `QUICK_SIGNAL` (confidence floor 55%) and are gated by a **candle-timing rule**:
no new signals in the closing seconds of a candle — QuickFire re-arms at the next open.
Every QuickFire trade is settled against the real close and the outcome is attributed
to each fly's DNA (re-scored against the dispatch-time feature vector), so wins/losses
feed health → graveyard → rebirth exactly like full-tier signals.

## 9. Self-Training (per candle)
Every closed candle three learning loops run:
1. **Vision settlement** — the newest prediction made during the candle is compared with the real close; EWMA accuracy sets the Queen's **vision trust (30–90%)**.
2. **Per-fly vision training** — every fly that followed the vision cue nudges its own `visionWeight` (±3–4%); flies that ignored it keep theirs.
3. **Survival** — paper-trade outcomes update health/fitness; dead flies are buried and rebirthed with mutated DNA.

All trained state persists in `localStorage` and survives reloads.

---

## 10. Queen Fly Consensus Engine
The Queen aggregates reliability-weighted worker votes (health + fitness), the SMC confluence threshold, the Mistral vision verdict, market regime alignment, signal cooldown, and the strict validation tier (200+ paper trades at ≥60% win rate before `VALIDATED_SIGNAL`).

---

## 11. Automated Testing
```bash
npm run lint                   # TypeScript typecheck
npm run build                  # production build
node scripts/engine-smoke.mjs  # extracts the REAL engine from extension/dist/content.js
node scripts/verify-extension.mjs
pytest backend/tests/          # Python engine tests
```
