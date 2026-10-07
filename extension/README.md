# OTC Swarm Queen — Chrome Extension (Manifest V3)

This Chrome Extension links Quotex OTC broker charts directly to your **OTC Swarm Queen** quant engine over Cloud HTTP & WebSocket Ingest.

---

## Features
- **Real-Time HUD**: Injects a compact non-intrusive floating heads-up display on top-left of Quotex OTC pages (`https://market-qx.info/*`, `https://*.quotex.com/*`, etc.).
- **Automatic Asset Detection**: Accurately detects active pair (`NZD/JPY (OTC)`, `NZD/CHF (OTC)`, `USD/BDT (OTC)`, etc.) from active tabs or deal header without being confused by past trade history.
- **Web App Cloud Link**: Direct bi-directional connection between Quotex in-page script, Extension Popup, and AI Studio Web App.
- **Queen Signal Badging**: Dynamic toolbar badge (`UP`, `DN`, `HLD`) with color-coded alerts.
- **SMC Confluence Gauge**: Real-time 0-100 confluence meter tracking Liquidity Sweeps, Order Blocks, FVGs, and BOS.
- **20 Worker Flies Status**: Inspect health, fitness, and decisions of all 20 individual genetic Bayesian agents.
- **Mistral Vision Scanner (v1.3)**: Every fresh 1-minute candle the extension screenshots the chart, crops it to the chart canvas and POSTs it to `/api/vision/scan` for a Mistral visual verdict (trend, support/resistance, patterns, next-candle bias). The verdict shows in the HUD (👁 Vision row) and merges into every fly's vote in the web app. The popup's **SCAN NOW** button triggers an instant capture+scan.
- **Combined Queen Row**: The web app's SMC + vision + swarm consensus next-candle signal is relayed back into the HUD (👑 QUEEN COMBINED row) so chart and dashboard always agree.

---

## Install / Reinstall (why Chrome deleted the old one and installed a new one)

### The cause
With **Load unpacked**, Chrome normally derives the extension ID from a hash of the
folder's absolute path. So any of these produce a **different ID**:

- moving or renaming the `extension` folder
- removing the extension and adding it again (Chrome then assigns a random ID)
- loading it into a second Chrome profile (a genuinely separate install)

Each one looks like "Chrome removed the old extension and installed a new one", and every
time it happens **all saved settings are lost** (your Web App URL, saved state, etc.).

### The fix (already applied)
`extension/manifest.json` now contains a fixed `"key"` (an RSA public key). Chrome derives
the ID from that key instead of the folder path, so the ID is **permanent**:

```
miibimpjegcgcenhpldkjjbnifmoklii
```

The matching private key lives outside the extension at `.keys/extension_key.pem` and is
git-ignored. **Never delete `.keys/` and never edit the `key` field** - either would
change the ID again.

### Install steps (do this ONCE per Chrome profile)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this exact folder: `D:\Website\otc-swarm-queen\extension`
5. Confirm the card shows ID `miibimpjegcgcenhpldkjjbnifmoklii`

After that, **never remove and re-add it**. For code changes just press the reload arrow
(circular arrow) on the extension card - that keeps the same ID and all saved settings.

### Verify anytime

```
node scripts/verify-extension.mjs
```

It validates the manifest, re-derives the pinned ID, and lists which Chrome profiles
currently have it installed.

### Multiple profiles
Each Chrome profile needs its own one-time install (Chrome does not share extensions across
profiles), but the ID will be identical everywhere because it now comes from the pinned key.

---


## Quick Reload & Connect Guide (কীভাবে রিলোড এবং কানেক্ট করবেন)

### Step 1: Reload Extension in Chrome
1. Chrome ব্রাউজারে `chrome://extensions` এ যান।
2. **OTC Swarm Queen** এক্সটেনশনের রিফ্রেশ আইকনে (🔄) ক্লিক করুন।

### Step 2: Open Extension Popup and Connect
1. Chrome-এর এক্সটেনশন বার থেকে **OTC Swarm Queen** আইকনে ক্লিক করে Popup ওপেন করুন।
2. উপরে **"🔗 Web App Cloud Bridge"** বক্সে আপনার Web App URL দেখা যাবে:
   `https://ais-dev-dte3m7eekpxvxe2642j4ah-49480340545.asia-east1.run.app`
3. **"Connect"** বাটন অথবা **"⚡ Auto-Detect Tab"** বাটনে ক্লিক করুন।
4. স্ট্যাটাস ব্যাজে `CONNECTED 🟢` দেখতে পাবেন!

### Step 3: Refresh Quotex
1. Quotex ট্যাবে গিয়ে পেজটি একবার রিফ্রেশ (F5) করুন।
2. স্ক্রিনের উপরে বাম পাশে **SWARM QUEEN** ভাসমান HUD দেখতে পাবেন যা আপনার সক্রিয় পেয়ার (যেমন: `NZD/JPY (OTC)`) এবং লাইভ প্রাইস ডিটেক্ট করবে।
3. Web App এবং Extension Popup উভয়েই একই সাথে লাইভ ডাটা ও সিগন্যাল সিঙ্ক হবে!
