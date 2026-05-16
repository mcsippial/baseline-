/* Helm options page */
const $ = (s) => document.querySelector(s);

const KEYS = ["apiKey","model","wakeWord","customWake","openMic","voiceReplies","personality","followupSeconds","micLang","useVision"];

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

load();
