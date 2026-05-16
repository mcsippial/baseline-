/* Helm popup */
const $ = (s) => document.querySelector(s);

async function getSettings() {
  return await chrome.storage.local.get([
    "apiKey", "enabled", "wakeWord", "customWake"
  ]);
}

function wakeLabel(s) {
  if (s.wakeWord === "custom") return s.customWake || "…";
  if (s.wakeWord === "hey") return "hey there";
  return s.wakeWord || "yo";
}

async function render() {
  const s = await getSettings();
  const enabled = s.enabled !== false;
  const hasKey = !!s.apiKey;

  $("#warn").hidden = hasKey;

  if (!enabled) {
    $("#state").classList.remove("is-live");
    $("#status").textContent = "Disabled on this page";
    $("#toggle").textContent = "Turn Helm on";
    $("#toggle").classList.add("primary");
  } else {
    $("#state").classList.add("is-live");
    $("#status").textContent = "Active — listening on every tab";
    $("#toggle").textContent = "Turn Helm off";
    $("#toggle").classList.remove("primary");
  }
  $("#wakeKbd").textContent = `"${wakeLabel(s)}"`;
}

async function renderUsage() {
  const u = await chrome.runtime.sendMessage({ type: "helm:usage" });
  const el = $("#usage");
  if (!u || u.calls === 0) { el.hidden = true; return; }
  el.hidden = false;
  const total = (u.input + u.output).toLocaleString();
  $("#usageVal").textContent = `${u.calls} call${u.calls !== 1 ? "s" : ""} · ${total} tokens`;
}

$("#toggle").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "helm:toggle" });
  render();
});

$("#resetUsage").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "helm:usage-reset" });
  renderUsage();
});

$("#openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("#aboutLink").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
renderUsage();
