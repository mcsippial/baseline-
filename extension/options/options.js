/* Helm options page */
const $ = (s) => document.querySelector(s);

const KEYS = ["apiKey","model","wakeWord","customWake","openMic","voiceReplies","personality","followupSeconds","micLang","useVision","composioKey","composioApps"];

async function load() {
  const s = await chrome.storage.local.get(KEYS);
  $("#apiKey").value          = s.apiKey || "";
  $("#model").value           = s.model || "claude-haiku-4-5-20251001";
  $("#wakeWord").value        = s.wakeWord || "yo";
  $("#customWake").value      = s.customWake || "";
  $("#personality").value     = s.personality || "subtle";
  $("#followupSeconds").value = typeof s.followupSeconds === "number" ? s.followupSeconds : 8;
  $("#followupSecondsVal").textContent = `${$("#followupSeconds").value}s`;
  setToggle("#openMic", !!s.openMic);
  setToggle("#voiceReplies", !!s.voiceReplies);
  setToggle("#useVision", !!s.useVision);
  $("#micLang").value = s.micLang || "en-US";
  $("#customWakeField").hidden = $("#wakeWord").value !== "custom";

  // Composio
  $("#composioKey").value = s.composioKey || "";
  const enabledApps = Array.isArray(s.composioApps) ? s.composioApps : [];
  if (s.composioKey) {
    $("#refreshConnections").hidden = false;
    const { connections } = await new Promise(r => chrome.runtime.sendMessage({ type: "helm:composio-connections" }, r));
    renderAppGrid(enabledApps, connections || []);
  } else {
    renderAppGrid(enabledApps, []);
  }
}

function setToggle(sel, on) {
  const el = $(sel);
  if (on) el.classList.add("on"); else el.classList.remove("on");
}
function toggleOn(sel) { return $(sel).classList.contains("on"); }

async function save(partial) {
  await chrome.storage.local.set(partial);
}

/* ---------- Event wiring ---------- */

$("#saveKey").addEventListener("click", async () => {
  await save({ apiKey: $("#apiKey").value.trim() });
  flashSaved($("#saveKey"));
});
$("#apiKey").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#saveKey").click();
});

$("#model").addEventListener("change", () => save({ model: $("#model").value }));

$("#wakeWord").addEventListener("change", () => {
  $("#customWakeField").hidden = $("#wakeWord").value !== "custom";
  save({ wakeWord: $("#wakeWord").value });
});
$("#customWake").addEventListener("input", () => save({ customWake: $("#customWake").value }));

$("#personality").addEventListener("change", () => save({ personality: $("#personality").value }));
$("#micLang").addEventListener("change", () => save({ micLang: $("#micLang").value }));

$("#followupSeconds").addEventListener("input", () => {
  const v = parseInt($("#followupSeconds").value, 10);
  $("#followupSecondsVal").textContent = `${v}s`;
  save({ followupSeconds: v });
});

$("#openMic").addEventListener("click", () => {
  const next = !toggleOn("#openMic");
  setToggle("#openMic", next);
  save({ openMic: next });
});
$("#voiceReplies").addEventListener("click", () => {
  const next = !toggleOn("#voiceReplies");
  setToggle("#voiceReplies", next);
  save({ voiceReplies: next });
});
$("#useVision").addEventListener("click", () => {
  const next = !toggleOn("#useVision");
  setToggle("#useVision", next);
  save({ useVision: next });
});

function flashSaved(btn) {
  const orig = btn.textContent;
  btn.textContent = "Saved ✓";
  btn.classList.add("primary");
  setTimeout(() => { btn.textContent = orig; }, 1400);
}

/* ---------- Composio app grid ---------- */
const CATALOG = [
  { id: "GMAIL",          name: "Gmail",           icon: "📧", url: "gmail" },
  { id: "SLACK",          name: "Slack",            icon: "💬", url: "slack" },
  { id: "GITHUB",         name: "GitHub",           icon: "🐙", url: "github" },
  { id: "NOTION",         name: "Notion",           icon: "📝", url: "notion" },
  { id: "GOOGLECALENDAR", name: "Google Calendar",  icon: "📅", url: "googlecalendar" },
  { id: "LINEAR",         name: "Linear",           icon: "📐", url: "linear" },
  { id: "GOOGLEDRIVE",    name: "Google Drive",     icon: "📁", url: "googledrive" },
  { id: "JIRA",           name: "Jira",             icon: "🎫", url: "jira" },
];

function renderAppGrid(enabledApps, connections) {
  const grid = $("#appGrid");
  grid.innerHTML = "";
  for (const app of CATALOG) {
    const isConnected = connections.map(c => c.toUpperCase()).includes(app.id);
    const isEnabled   = enabledApps.includes(app.id);
    const card = document.createElement("div");
    card.className = `app-card${isEnabled ? " is-enabled" : ""}`;
    card.dataset.appId = app.id;
    card.innerHTML = `
      <div class="app-card-head">
        <span class="app-card-icon">${app.icon}</span>
        <span class="app-card-name">${app.name}</span>
        <span class="app-status ${isConnected ? "connected" : "disconnected"}">${isConnected ? "Connected" : "Not connected"}</span>
      </div>
      <div class="app-card-foot">
        <label class="app-enable-row">
          <button class="toggle ${isEnabled ? "on" : ""}" data-toggle-app="${app.id}" aria-label="Enable ${app.name}"></button>
          Include in Helm
        </label>
        <a class="app-connect" href="https://app.composio.dev/apps/${app.url}" target="_blank">
          ${isConnected ? "Manage ↗" : "Connect ↗"}
        </a>
      </div>`;
    grid.appendChild(card);
  }

  // Wire toggles
  grid.querySelectorAll("[data-toggle-app]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const appId = btn.dataset.toggleApp;
      const isOn = btn.classList.toggle("on");
      btn.closest(".app-card").classList.toggle("is-enabled", isOn);
      const s = await chrome.storage.local.get("composioApps");
      let apps = Array.isArray(s.composioApps) ? [...s.composioApps] : [];
      if (isOn) { if (!apps.includes(appId)) apps.push(appId); }
      else { apps = apps.filter(a => a !== appId); }
      await chrome.storage.local.set({ composioApps: apps });
    });
  });
}

$("#saveComposioKey").addEventListener("click", async () => {
  const key = $("#composioKey").value.trim();
  await save({ composioKey: key });
  flashSaved($("#saveComposioKey"));
  if (key) {
    $("#refreshConnections").hidden = false;
    $("#refreshConnections").textContent = "Checking…";
    const s = await chrome.storage.local.get("composioApps");
    const { connections } = await new Promise(r => chrome.runtime.sendMessage({ type: "helm:composio-connections" }, r));
    renderAppGrid(Array.isArray(s.composioApps) ? s.composioApps : [], connections || []);
    $("#refreshConnections").textContent = "Refresh connections";
  }
});
$("#composioKey").addEventListener("keydown", e => { if (e.key === "Enter") $("#saveComposioKey").click(); });

$("#refreshConnections").addEventListener("click", async () => {
  $("#refreshConnections").textContent = "Checking…";
  const s = await chrome.storage.local.get("composioApps");
  const { connections } = await new Promise(r => chrome.runtime.sendMessage({ type: "helm:composio-connections" }, r));
  renderAppGrid(Array.isArray(s.composioApps) ? s.composioApps : [], connections || []);
  $("#refreshConnections").textContent = "Refresh connections";
});

load();
