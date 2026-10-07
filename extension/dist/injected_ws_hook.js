/**
 * OTC Swarm Queen - Main World Quotex WebSocket & Candle Interceptor
 * Injected in the MAIN execution context to capture raw WebSocket frames with 100% precision.
 */

(function () {
  if (window.__OTC_SWARM_MAIN_HOOK_ACTIVE__) return;
  window.__OTC_SWARM_MAIN_HOOK_ACTIVE__ = true;

  console.log("[OTC Swarm Queen] MAIN World WebSocket Interceptor Hook Active.");

  const KNOWN_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
    "PKR", "BRL", "BDT", "DZD", "MXN", "PHP", "IDR", "INR",
    "TRY", "ZAR", "EGP", "NGN", "ARS", "COP", "AED", "SAR",
    "MYR", "VND", "THB", "SGD", "KZT", "BTC", "ETH", "SOL"
  ];

  function normalizeAssetName(raw) {
    if (!raw) return null;
    let str = String(raw).trim().toUpperCase();

    const m = str.match(/([A-Z]{3})\s*[\/\-_]?\s*([A-Z]{3})/);
    if (m && KNOWN_CURRENCIES.includes(m[1]) && KNOWN_CURRENCIES.includes(m[2])) {
      return `${m[1]}/${m[2]} (OTC)`;
    }

    if (str.length >= 6) {
      const c1 = str.slice(0, 3);
      const c2 = str.slice(3, 6);
      if (KNOWN_CURRENCIES.includes(c1) && KNOWN_CURRENCIES.includes(c2)) {
        return `${c1}/${c2} (OTC)`;
      }
    }
    return null;
  }

  /**
   * Locale-tolerant number parsing.
   * Quotex serves a Turkish-localised UI, and some feeds serialise prices with a comma
   * decimal separator ("19,93325"). A bare parseFloat() truncates those at the comma and
   * returns 19, which then fails every plausibility/range check and silently kills the
   * whole feed. A comma is only treated as a decimal point when it is followed by exactly
   * digits and is not acting as a thousands separator.
   */
  function toNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    let s = String(v).trim();
    if (!s) return 0;
    // "19,93325" or ",93325" -> dot decimal
    if (/^-?\d*,\d+$/.test(s)) s = s.replace(',', '.');
    // "1.234,56" -> European thousands + decimal
    else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    // "17,864.52" -> plain thousands separators
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function parseCandlesList(rawCandles, asset) {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) return null;

    const parsed = [];
    for (const c of rawCandles) {
      if (!c) continue;

      let time = 0, open = 0, high = 0, low = 0, close = 0, vol = 100;

      // Case 1: Array format [time, open, close, high, low] or [time, open, high, low, close]
      if (Array.isArray(c) && c.length >= 4) {
        time = typeof c[0] === 'number' ? (c[0] < 10000000000 ? c[0] * 1000 : c[0]) : Date.now();
        open = toNumber(c[1]);
        // Check if index 2 is close or high
        const p2 = toNumber(c[2]);
        const p3 = toNumber(c[3]);
        const p4 = c.length >= 5 ? toNumber(c[4]) : p2;

        if (c.length >= 5) {
          // Typically [time, open, high, low, close] or [time, open, close, high, low]
          high = Math.max(open, p2, p3, p4);
          low = Math.min(open, p2, p3, p4);
          close = p4;
        } else {
          high = Math.max(open, p2, p3);
          low = Math.min(open, p2, p3);
          close = p3;
        }
      } 
      // Case 2: Object format { time, open, high, low, close, volume }
      else if (typeof c === 'object') {
        const rawTime = c.time || c.t || c.timestamp || c.date;
        time = typeof rawTime === 'number' ? (rawTime < 10000000000 ? rawTime * 1000 : rawTime) : Date.now();
        open = toNumber(c.open || c.o || c.start || 0);
        high = toNumber(c.high || c.h || c.max || open);
        low = toNumber(c.low || c.l || c.min || open);
        close = toNumber(c.close || c.c || c.end || c.price || open);
        vol = toNumber(c.volume || c.v || 100);
      }

      if (open > 0 && high > 0 && low > 0 && close > 0) {
        parsed.push({
          time: time || Date.now(),
          open: open,
          high: Math.max(open, high, low, close),
          low: Math.min(open, high, low, close),
          close: close,
          volume: vol
        });
      }
    }

    if (parsed.length > 0) {
      // Sort chronologically ascending
      parsed.sort((a, b) => a.time - b.time);
      return parsed;
    }
    return null;
  }

  function processWebSocketMessage(dataStr) {
    if (!dataStr || typeof dataStr !== 'string') return;

    try {
      const jsonStart = dataStr.indexOf("[");
      const objStart = dataStr.indexOf("{");
      const startIdx = (jsonStart !== -1 && (objStart === -1 || jsonStart < objStart)) ? jsonStart : objStart;

      if (startIdx === -1) return;

      const payload = JSON.parse(dataStr.slice(startIdx));

      // 1. Array packets: ["event_name", data]
      if (Array.isArray(payload) && payload.length >= 2) {
        const eventType = String(payload[0]).toLowerCase();
        const eventData = payload[1];

        // A. Historical Candles Array
        if (
          eventType.includes("history") ||
          eventType.includes("candles") ||
          eventType.includes("chart_data") ||
          eventType.includes("bars")
        ) {
          const rawAsset = eventData.asset || eventData.symbol || eventData.pair;
          const normAsset = normalizeAssetName(rawAsset);
          const rawCandles = eventData.candles || eventData.history || eventData.data || (Array.isArray(eventData) ? eventData : null);

          if (rawCandles) {
            const formatted = parseCandlesList(rawCandles, normAsset);
            if (formatted && formatted.length > 0) {
              window.postMessage({
                type: "__QX_WS_CANDLES_HISTORY__",
                asset: normAsset,
                candles: formatted,
                count: formatted.length,
                timestamp: Date.now()
              }, "*");
            }
          }
        }

        // B. Asset change event
        if (eventType.includes("change-asset") || eventType.includes("switch-asset")) {
          const normAsset = normalizeAssetName(eventData);
          if (normAsset) {
            window.postMessage({
              type: "__QX_WS_CHANGE_ASSET__",
              asset: normAsset,
              timestamp: Date.now()
            }, "*");
          }
        }

        // C. Sub-second live tick quote
        // Quotex pushes live quotes on an "updateStream" event in current builds — the
        // old filter (tick/quote/live/deal) silently dropped every one of those frames,
        // which left entire pairs stuck on "GATHERING DATA" with no price at all.
        if (
          eventType.includes("tick") ||
          eventType.includes("quote") ||
          eventType.includes("live") ||
          eventType.includes("deal") ||
          eventType.includes("update") ||
          eventType.includes("stream") ||
          eventType.includes("price")
        ) {
          if (eventData && typeof eventData === 'object') {
            const rawAsset = eventData.asset || eventData.symbol || eventData.pair || eventData.a;
            const normAsset = normalizeAssetName(rawAsset);
            const price = toNumber(eventData.price || eventData.close || eventData.value || eventData.rate || eventData.p || eventData.c);
            HOOK_STATS.forwarded++;

            if (price > 0) {
              window.postMessage({
                type: "__QX_WS_REAL_TICK__",
                asset: normAsset,
                price: price,
                timestamp: Date.now()
              }, "*");
            }
          }
        }
      } 
      // 2. Object packet: { event: "...", data: [...] }
      else if (payload && typeof payload === 'object') {
        if (payload.candles || payload.history) {
          const normAsset = normalizeAssetName(payload.asset || payload.symbol);
          const formatted = parseCandlesList(payload.candles || payload.history, normAsset);
          if (formatted && formatted.length > 0) {
            window.postMessage({
              type: "__QX_WS_CANDLES_HISTORY__",
              asset: normAsset,
              candles: formatted,
              count: formatted.length,
              timestamp: Date.now()
            }, "*");
          }
        }
      }
    } catch (e) {
      // Ignore unparseable non-JSON ping/pong frames
    }
  }

  // Intercept Native window.WebSocket
  const OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket) {
    // Binary frames are decoded with TextDecoder: Quotex sometimes flips
    // binaryType to 'arraybuffer', and frames arriving that way used to be dropped
    // silently - the single most common cause of a permanently empty price feed.
    const textDecoder = new TextDecoder("utf-8");
    function decodeBinary(data) {
      try {
        if (data instanceof ArrayBuffer) return textDecoder.decode(data);
        if (ArrayBuffer.isView(data)) {
          const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          return textDecoder.decode(view);
        }
      } catch (e) { /* not decodable as text */ }
      return null;
    }

    window.WebSocket = function (...args) {
      const ws = new OriginalWebSocket(...args);

      ws.addEventListener("message", function (event) {
        HOOK_STATS.frames++;
        if (typeof event.data === "string") {
          HOOK_STATS.text++;
          processWebSocketMessage(event.data);
          forwardRawFrame(event.data);
        } else if (event.data instanceof Blob) {
          HOOK_STATS.blob++;
          event.data.text().then(function (t) {
            processWebSocketMessage(t);
            forwardRawFrame(t);
          }).catch(() => {});
        } else if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
          HOOK_STATS.binary++;
          const t = decodeBinary(event.data);
          if (t) {
            processWebSocketMessage(t);
            forwardRawFrame(t);
          }
        }
      });

      ws.addEventListener("open", function () {
        HOOK_STATS.socketsOpened++;
      });

      return ws;
    };

    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  }

  // Lightweight counters so the dashboard can verify the hook is actually seeing
  // broker frames (surfaced in the web app's Logs via the content script).
  const HOOK_STATS = { frames: 0, text: 0, blob: 0, binary: 0, forwarded: 0, socketsOpened: 0 };

  // Announce attachment: the content script uses this to tell "hook is attached but
  // the broker is silent" apart from "hook never attached (the tab is stale after an
  // extension reload and MUST be reloaded with F5)".
  try {
    window.__OTC_WS_HOOK_ACTIVE__ = true;
    window.postMessage({ type: "__QX_HOOK_ALIVE__", timestamp: Date.now() }, "*");
    setInterval(function () {
      window.postMessage({ type: "__QX_HOOK_ALIVE__", timestamp: Date.now() }, "*");
    }, 10000);
  } catch (e) {}

  setInterval(function () {
    if (HOOK_STATS.frames > 0) {
      window.postMessage({ type: "__QX_HOOK_STATS__", stats: { ...HOOK_STATS } }, "*");
    }
  }, 5000);

  /**
   * Forwards the raw frame text to the content script.
   *
   * The structured parser above has to GUESS the broker's event names, and when that
   * guess is wrong the panel silently never receives a price ("GATHERING DATA" forever).
   * The content script, however, knows which pair is open - so it can scan any frame for
   * a number that actually fits that pair's quote range. Passing the raw text through
   * makes the feed protocol-agnostic instead of guess-dependent.
   */
  let lastRawAt = 0;
  function forwardRawFrame(text) {
    if (!text || text.length > 200000) return;
    HOOK_STATS.forwarded++;
    const now = Date.now();
    if (now - lastRawAt < 80) return; // cap at ~12 frames/second
    lastRawAt = now;
    window.postMessage({ type: "__QX_RAW__", text: text.slice(0, 20000) }, "*");
  }

  // Intercept Native window.fetch for candle history REST calls
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const url = String(args[0] || "");
        if (url.includes("candle") || url.includes("history") || url.includes("chart")) {
          const clone = response.clone();
          clone.json().then(data => {
            if (data && (data.candles || data.data || Array.isArray(data))) {
              const formatted = parseCandlesList(data.candles || data.data || data);
              if (formatted && formatted.length > 0) {
                window.postMessage({
                  type: "__QX_WS_CANDLES_HISTORY__",
                  candles: formatted,
                  count: formatted.length,
                  source: "FETCH_INTERCEPTOR",
                  timestamp: Date.now()
                }, "*");
              }
            }
          }).catch(() => {});
        }
      } catch (e) {}
      return response;
    };
  }
})();
