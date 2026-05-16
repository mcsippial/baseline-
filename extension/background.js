/* Helm — background service worker
 * Handles Anthropic API calls so the API key stays out of content scripts.
 * Content scripts talk to us via chrome.runtime.sendMessage.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

async function getSettings() {
  const out = await chrome.storage.local.get([
    "apiKey", "model", "wakeWord", "customWake",
    "openMic", "voiceReplies", "personality", "followupSeconds",
    "enabled", "micLang",
  ]);
  return {
    apiKey: out.apiKey || "",
    model: out.model || DEFAULT_MODEL,
    wakeWord: out.wakeWord || "yo",
    customWake: out.customWake || "",
    openMic: !!out.openMic,
    voiceReplies: !!out.voiceReplies,
    personality: out.personality || "subtle",
    followupSeconds: typeof out.followupSeconds === "number" ? out.followupSeconds : 8,
    enabled: out.enabled !== false,
    micLang: out.micLang || "en-US",
  };
}

async function trackUsage(usage) {
  if (!usage) return;
  const stored = await chrome.storage.local.get("helm.usage");
  const prev = stored["helm.usage"] || { input: 0, output: 0, calls: 0 };
  await chrome.storage.local.set({
    "helm.usage": {
      input:  prev.input  + (usage.input_tokens  || 0),
      output: prev.output + (usage.output_tokens || 0),
      calls:  prev.calls  + 1,
    },
  });
}

async function callAnthropic({ system, user, model }) {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    return { ok: false, error: "no_api_key", message: "Add your Anthropic API key in Helm options." };
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: "api_error", status: res.status, message: text.slice(0, 500) };
    }
    const json = await res.json();
    trackUsage(json.usage); // fire-and-forget; non-blocking
    const text = (json.content || [])
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("");
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: "network", message: String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "helm:settings") {
    getSettings().then(sendResponse);
    return true;
  }
  if (msg?.type === "helm:claude") {
    callAnthropic({ system: msg.system, user: msg.user, model: msg.model })
      .then(sendResponse);
    return true; // keep channel open for async response
  }
  if (msg?.type === "helm:set") {
    chrome.storage.local.set(msg.values || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "helm:toggle") {
    chrome.storage.local.get("enabled").then(({ enabled }) => {
      const next = enabled === false ? true : false;
      chrome.storage.local.set({ enabled: next }).then(() => sendResponse({ enabled: next }));
    });
    return true;
  }
  if (msg?.type === "helm:usage") {
    chrome.storage.local.get("helm.usage").then(r =>
      sendResponse(r["helm.usage"] || { input: 0, output: 0, calls: 0 })
    );
    return true;
  }
  if (msg?.type === "helm:usage-reset") {
    chrome.storage.local.set({ "helm.usage": { input: 0, output: 0, calls: 0 } })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

// First-install: open options so user can paste their API key.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      wakeWord: "yo",
      personality: "subtle",
      followupSeconds: 8,
      voiceReplies: false,
      openMic: false,
      enabled: true,
      micLang: "en-US",
      "helm.usage": { input: 0, output: 0, calls: 0 },
    });
    chrome.runtime.openOptionsPage();
  }
});

// Broadcast settings changes to all content scripts so they react live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "helm:settings-changed", changes })
        .catch(() => { /* tab may not have content script (chrome://) */ });
    }
  });
});
