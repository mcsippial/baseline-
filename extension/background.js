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
    "enabled", "micLang", "useVision",
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
    useVision: !!out.useVision,
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

async function callAnthropic({ system, user, userContent, model }) {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    return { ok: false, error: "no_api_key", message: "Add your Anthropic API key in Helm options." };
  }
  // userContent is an array of content blocks (for vision); user is a plain string fallback
  const messageContent = userContent || user;
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
        messages: [{ role: "user", content: messageContent }],
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

async function handleTabCommand({ action, query }, sender, sendResponse) {
  if (action === "new") {
    await chrome.tabs.create({});
    sendResponse({ ok: true });
    return;
  }
  if (action === "duplicate") {
    if (sender.tab?.id) await chrome.tabs.duplicate(sender.tab.id);
    sendResponse({ ok: true });
    return;
  }
  if (action === "close") {
    if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id);
    sendResponse({ ok: true });
    return;
  }
  if (action === "pin") {
    if (sender.tab?.id) await chrome.tabs.update(sender.tab.id, { pinned: true });
    sendResponse({ ok: true });
    return;
  }

  // Actions that need the full tab list
  const tabs = await chrome.tabs.query({ currentWindow: true });

  if (action === "next") {
    const cur = tabs.findIndex(t => t.active);
    const next = tabs[(cur + 1) % tabs.length];
    await chrome.tabs.update(next.id, { active: true });
    sendResponse({ ok: true });
    return;
  }
  if (action === "prev") {
    const cur = tabs.findIndex(t => t.active);
    const prev = tabs[(cur - 1 + tabs.length) % tabs.length];
    await chrome.tabs.update(prev.id, { active: true });
    sendResponse({ ok: true });
    return;
  }
  if (action === "switch" && query) {
    const q = query.toLowerCase();
    const scored = tabs
      .filter(t => !t.active)
      .map(t => {
        const title = (t.title || "").toLowerCase();
        const url   = (t.url   || "").toLowerCase();
        const score = title.includes(q) ? (title.startsWith(q) ? 3 : 2)
                    : url.includes(q)   ? 1 : 0;
        return { t, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length) {
      await chrome.tabs.update(scored[0].t.id, { active: true });
      sendResponse({ ok: true, feedback: `Switched to ${scored[0].t.title}` });
    } else {
      sendResponse({ ok: false, feedback: `No tab found matching "${query}"` });
    }
    return;
  }
  sendResponse({ ok: false });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "helm:settings") {
    getSettings().then(sendResponse);
    return true;
  }
  if (msg?.type === "helm:claude") {
    callAnthropic({ system: msg.system, user: msg.user, userContent: msg.userContent, model: msg.model })
      .then(sendResponse);
    return true; // keep channel open for async response
  }
  if (msg?.type === "helm:screenshot") {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: "no_tab" }); return true; }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 70 })
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
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
  if (msg?.type === "helm:tab") {
    handleTabCommand(msg, sender, sendResponse);
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
      useVision: false,
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
