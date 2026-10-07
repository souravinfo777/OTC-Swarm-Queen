/**
 * OTC Swarm Queen - Web App Tab Bridge Script
 * Listens for state updates and dispatches them to window for React SPA
 */

(function () {
  try {
    if (typeof window !== "undefined") {
      var desc = Object.getOwnPropertyDescriptor(window, "fetch");
      if (desc && !desc.set && !desc.writable) {
        var origFetch = window.fetch ? window.fetch.bind(window) : null;
        Object.defineProperty(window, "fetch", {
          configurable: true,
          enumerable: true,
          get: function () { return origFetch; },
          set: function (fn) { if (typeof fn === "function") origFetch = fn; }
        });
      }
    }
  } catch (e) {}

  console.log("[OTC Swarm Queen Bridge] Active on Web App tab");

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "OTC_QUOTEX_LIVE_FEED") {
        window.postMessage({
          type: "OTC_QUOTEX_LIVE_FEED",
          payload: msg.payload
        }, "*");
      }
      if (msg && msg.type === "DIAGNOSTIC_LOG") {
        window.postMessage({
          type: "OTC_DIAGNOSTIC_LOG",
          payload: msg.payload
        }, "*");
      }
      if (msg && msg.type === "TRADE_EXECUTION_CONFIRMATION") {
        window.postMessage({
          type: "TRADE_EXECUTION_CONFIRMATION",
          payload: msg.payload
        }, "*");
      }
    });
  }

  // Listen for commands dispatched from React Web App to forward to Quotex tab
  window.addEventListener("message", function (event) {
    if (!event.data) return;

    if (event.data.type === "QUOTEX_EXECUTE_TRADE_COMMAND") {
      console.log("[OTC Swarm Queen Bridge] Forwarding Trade Execution Command:", event.data);
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "FORWARD_COMMAND_TO_QUOTEX",
          action: "EXECUTE_TRADE",
          direction: event.data.direction,
          amount: event.data.amount || 1,
          asset: event.data.asset
        }, function (res) {
          window.postMessage({
            type: "TRADE_EXECUTION_CONFIRMATION",
            payload: res || { status: "SENT_TO_EXTENSION" }
          }, "*");
        });
      }
    }

    if (event.data.type === "QUOTEX_SWITCH_PAIR_COMMAND") {
      console.log("[OTC Swarm Queen Bridge] Forwarding Switch Pair Command:", event.data);
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "FORWARD_COMMAND_TO_QUOTEX",
          action: "SWITCH_PAIR",
          asset: event.data.asset
        });
      }
    }
  });
})();
