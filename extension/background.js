/* Helm — background service worker
 * Handles Anthropic API calls so the API key stays out of content scripts.
 * Content scripts talk to us via chrome.runtime.sendMessage.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const COMPOSIO_API = "https://backend.composio.dev/api/v1";

/* ---------- Composio app catalog (hardcoded set) ---------- */
const COMPOSIO_CATALOG = [
  {
    id: "GMAIL", name: "Gmail", icon: "📧",
    actions: [
      { id: "GMAIL_SEND_EMAIL",         desc: "Send an email",                  params: { recipient_email: "recipient address", subject: "subject line", body: "body text" } },
      { id: "GMAIL_FETCH_EMAILS",       desc: "Search or fetch recent emails",  params: { query: "search query (optional)", max_results: "max to return (optional)" } },
      { id: "GMAIL_CREATE_EMAIL_DRAFT", desc: "Save a draft without sending",   params: { recipient_email: "recipient address", subject: "subject", body: "body text" } },
    ],
  },
  {
    id: "SLACK", name: "Slack", icon: "💬",
    actions: [
      { id: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL", desc: "Send a Slack message",   params: { channel: "channel name or ID", text: "message text" } },
      { id: "SLACK_LIST_ALL_SLACK_TEAM_CHANNELS",       desc: "List Slack channels",    params: {} },
    ],
  },
  {
    id: "GITHUB", name: "GitHub", icon: "🐙",
    actions: [
      { id: "GITHUB_CREATE_AN_ISSUE",                             desc: "Create a GitHub issue",  params: { owner: "repo owner", repo: "repo name", title: "title", body: "description (optional)" } },
      { id: "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER", desc: "List your issues",   params: {} },
      { id: "GITHUB_CREATE_A_PULL_REQUEST",                       desc: "Open a pull request",    params: { owner: "repo owner", repo: "repo name", title: "PR title", body: "description", head: "source branch", base: "target branch" } },
    ],
  },
  {
    id: "NOTION", name: "Notion", icon: "📝",
    actions: [
      { id: "NOTION_CREATE_A_PAGE",              desc: "Create a Notion page",    params: { parent_page_id: "parent page ID", title: "page title", content: "page content (optional)" } },
      { id: "NOTION_SEARCH_A_PAGE_OR_DATABASE",  desc: "Search Notion",           params: { query: "search query" } },
    ],
  },
  {
    id: "GOOGLECALENDAR", name: "Google Calendar", icon: "📅",
    actions: [
      { id: "GOOGLECALENDAR_CREATE_EVENT", desc: "Create a calendar event",   params: { summary: "event title", start_datetime: "ISO 8601 start", end_datetime: "ISO 8601 end", description: "description (optional)", attendees: "comma-separated emails (optional)" } },
      { id: "GOOGLECALENDAR_LIST_EVENTS",  desc: "List upcoming events",      params: { time_min: "ISO 8601 start (optional, default now)", max_results: "count (optional, default 10)" } },
    ],
  },
  {
    id: "LINEAR", name: "Linear", icon: "📐",
    actions: [
      { id: "LINEAR_CREATE_LINEAR_ISSUE", desc: "Create a Linear issue", params: { title: "issue title", description: "description (optional)", team_id: "team ID" } },
      { id: "LINEAR_LIST_LINEAR_ISSUES",  desc: "List Linear issues",    params: { team_id: "team ID (optional)" } },
    ],
  },
  {
    id: "GOOGLEDRIVE", name: "Google Drive", icon: "📁",
    actions: [
      { id: "GOOGLEDRIVE_FIND_A_FILE_BY_NAME", desc: "Find a Drive file by name", params: { name: "file name" } },
      { id: "GOOGLEDRIVE_LIST_FILES",          desc: "List Drive files",           params: { query: "search query (optional)" } },
    ],
  },
  {
    id: "JIRA", name: "Jira", icon: "🎫",
    actions: [
      { id: "JIRA_CREATE_ISSUE",         desc: "Create a Jira issue",   params: { project_key: "project key (e.g. ENG)", summary: "summary", description: "description (optional)", issue_type: "Bug/Task/Story (optional)" } },
      { id: "JIRA_GET_ALL_PROJECTS_JIRA", desc: "List Jira projects",   params: {} },
    ],
  },
];

/* ---------- Composio helpers ---------- */
let _composioCache = { connections: null, ts: 0 };

async function getComposioConnections(apiKey) {
  if (!apiKey) return [];
  if (_composioCache.connections && Date.now() - _composioCache.ts < 5 * 60 * 1000) {
    return _composioCache.connections;
  }
  try {
    const res = await fetch(`${COMPOSIO_API}/connectedAccounts?pageSize=100`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const connections = (json.items || [])
      .filter(a => a.status === "ACTIVE")
      .map(a => a.appName.toUpperCase());
    _composioCache = { connections, ts: Date.now() };
    return connections;
  } catch { return []; }
}

async function executeComposioAction(action, params, apiKey) {
  try {
    const res = await fetch(`${COMPOSIO_API}/actions/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ action, input: params || {}, entityId: "default" }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: text.slice(0, 300) };
    }
    const json = await res.json();
    if (!json.successful) return { ok: false, message: json.error || "Action failed" };
    return { ok: true, data: json.data };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

function formatComposioResult(actionId, data) {
  if (!data) return "Done.";
  const id = (actionId || "").toUpperCase();
  // Email
  if (id.includes("SEND_EMAIL")) return "Email sent.";
  if (id.includes("DRAFT")) return "Draft saved.";
  if (id.includes("FETCH_EMAIL") || id.includes("LIST_EMAIL")) {
    const msgs = data.messages || data.emails || data;
    const count = Array.isArray(msgs) ? msgs.length : 1;
    return `Found ${count} email${count !== 1 ? "s" : ""}.`;
  }
  // GitHub
  if (id.includes("CREATE_AN_ISSUE") || id.includes("CREATE_ISSUE")) {
    const n = data.number || data.id; const t = data.title || data.summary || "";
    return n ? `Issue #${n} created${t ? `: "${t}"` : ""}.` : "Issue created.";
  }
  if (id.includes("CREATE_A_PULL_REQUEST")) {
    return data.number ? `PR #${data.number} opened: "${data.title}".` : "PR created.";
  }
  if (id.includes("LIST_ISSUES")) {
    const arr = Array.isArray(data) ? data : (data.issues || data.nodes || []);
    return `Found ${arr.length} issue${arr.length !== 1 ? "s" : ""}.`;
  }
  // Calendar
  if (id.includes("CREATE_EVENT")) return data.summary ? `Event "${data.summary}" created.` : "Event created.";
  if (id.includes("LIST_EVENTS")) {
    const arr = data.items || data.events || data;
    if (Array.isArray(arr) && arr.length) {
      const previews = arr.slice(0, 3).map(e => `"${e.summary || e.title}"`).join(", ");
      return `${arr.length} event${arr.length !== 1 ? "s" : ""}: ${previews}.`;
    }
    return "No upcoming events.";
  }
  // Slack
  if (id.includes("SENDS_A_MESSAGE")) return "Message sent.";
  if (id.includes("LIST_ALL_SLACK")) {
    const arr = data.channels || data;
    return Array.isArray(arr) ? `${arr.length} channels.` : "Done.";
  }
  // Notion
  if (id.includes("CREATE_A_PAGE")) return data.id ? `Page created.` : "Done.";
  if (id.includes("SEARCH")) {
    const arr = data.results || data;
    return Array.isArray(arr) ? `Found ${arr.length} result${arr.length !== 1 ? "s" : ""}.` : "Done.";
  }
  // Linear
  if (id.includes("CREATE_LINEAR_ISSUE")) return data.id ? `Issue created: "${data.title || data.id}".` : "Issue created.";
  // Drive
  if (id.includes("FIND_A_FILE")) return data.name ? `Found: "${data.name}".` : "No file found.";
  // Generic
  if (Array.isArray(data)) return `Got ${data.length} result${data.length !== 1 ? "s" : ""}.`;
  return "Done.";
}

async function getSettings() {
  const out = await chrome.storage.local.get([
    "apiKey", "model", "wakeWord", "customWake",
    "openMic", "voiceReplies", "personality", "followupSeconds",
    "enabled", "micLang", "useVision", "composioKey", "composioApps",
  ]);
  return {
    apiKey: out.apiKey || "",
    model: out.model || DEFAULT_MODEL,
    wakeWord: out.wakeWord || "yo",
    customWake: out.customWake || "",
    openMic: !!out.openMic,
    voiceReplies: !!out.voiceReplies,
    personality: out.personality || "subtle",
    followupSeconds: typeof out.followupSeconds === "number" ? out.followupSeconds : 15,
    enabled: out.enabled !== false,
    micLang: out.micLang || "en-US",
    useVision: !!out.useVision,
    composioKey: out.composioKey || "",
    composioApps: Array.isArray(out.composioApps) ? out.composioApps : [],
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
  if (msg?.type === "helm:am-i-mic-owner") {
    getActiveTabId().then(id => {
      sendResponse({ owner: !!sender.tab?.id && sender.tab.id === id });
      // A new content script just came online — re-broadcast so every tab
      // gets a fresh ownership notification (handles cold-start race).
      broadcastMicOwner();
    });
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
  if (msg?.type === "helm:composio") {
    chrome.storage.local.get("composioKey").then(async ({ composioKey }) => {
      if (!composioKey) { sendResponse({ ok: false, message: "No Composio API key in settings." }); return; }
      const result = await executeComposioAction(msg.action, msg.params, composioKey);
      result.formatted = result.ok ? formatComposioResult(msg.action, result.data) : null;
      sendResponse(result);
    });
    return true;
  }
  if (msg?.type === "helm:composio-catalog") {
    chrome.storage.local.get(["composioKey", "composioApps"]).then(async (s) => {
      const key = s.composioKey || "";
      const enabledApps = Array.isArray(s.composioApps) ? s.composioApps : [];
      const connections = key ? await getComposioConnections(key) : [];
      sendResponse({ catalog: COMPOSIO_CATALOG, enabledApps, connections, hasKey: !!key });
    });
    return true;
  }
  if (msg?.type === "helm:composio-connections") {
    chrome.storage.local.get("composioKey").then(async ({ composioKey }) => {
      _composioCache = { connections: null, ts: 0 }; // force refresh
      const connections = await getComposioConnections(composioKey || "");
      sendResponse({ connections });
    });
    return true;
  }
  if (msg?.type === "helm:usage-reset") {
    chrome.storage.local.set({ "helm.usage": { input: 0, output: 0, calls: 0 } })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

/* ---------- Single-recognizer arbitration ----------
 * Chrome allows only one active SpeechRecognition system-wide. The background
 * is the single source of truth for which tab is focused; it tells every tab
 * whether it owns the mic so background tabs pause their recognizer.        */
async function getActiveTabId() {
  try {
    const win = await chrome.windows.getLastFocused();
    if (!win || win.focused === false) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return tab?.id ?? null;
  } catch { return null; }
}

async function broadcastMicOwner() {
  const activeId = await getActiveTabId();
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return; }
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, { type: "helm:mic-owner", owner: tab.id === activeId })
      .catch(() => { /* tab has no content script — fine */ });
  }
}

chrome.tabs.onActivated.addListener(broadcastMicOwner);
chrome.windows.onFocusChanged.addListener(broadcastMicOwner);

// Inject content scripts into already-open tabs. Chrome only auto-injects
// content scripts into pages loaded AFTER the extension is installed/updated —
// tabs that were already open keep running the old (or no) scripts until
// reloaded. Doing this on install/update means the user doesn't have to
// manually refresh every tab.
async function injectIntoOpenTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return; }
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:\/\//.test(tab.url)) continue;
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/helm.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/helm-core.js", "content/helm-dom.js", "content/helm-main.js"],
      });
    } catch { /* protected page (chrome store, etc.) — skip silently */ }
  }
}

// First-install: open onboarding wizard so user can paste their API key and choose wake word.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      wakeWord: "yo",
      personality: "subtle",
      followupSeconds: 15,
      voiceReplies: false,
      openMic: false,
      enabled: true,
      micLang: "en-US",
      useVision: false,
      "helm.usage": { input: 0, output: 0, calls: 0 },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
  // Runs on both fresh install and update/reload — refreshes every open tab's scripts
  injectIntoOpenTabs();
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
