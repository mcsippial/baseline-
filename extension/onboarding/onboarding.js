/* Helm onboarding wizard */
const $ = (s) => document.querySelector(s);

let currentStep = 0;

const WAKE_LABELS = {
  yo: '"yo"',
  helm: '"helm"',
  okay: '"okay"',
  hey: '"hey there"',
  computer: '"computer"',
};

function showStep(n) {
  document.querySelectorAll(".step").forEach((el, i) => {
    el.classList.toggle("active", i === n);
  });
  document.querySelectorAll(".step-dot").forEach((el, i) => {
    el.classList.toggle("active", i === n);
  });
  currentStep = n;
}

/* Step 0 → Step 1 */
$("#startBtn").addEventListener("click", () => showStep(1));

/* Step 1: verify API key */
$("#verifyBtn").addEventListener("click", async () => {
  const key = $("#apiKey").value.trim();
  const statusEl = $("#keyStatus");
  const btn = $("#verifyBtn");

  if (!key) {
    statusEl.textContent = "Please paste your API key.";
    statusEl.className = "status err";
    return;
  }

  statusEl.textContent = "Checking key…";
  statusEl.className = "status";
  btn.disabled = true;

  // Save key first so background can use it in callAnthropic
  await chrome.storage.local.set({ apiKey: key });

  // Make a minimal test call
  const resp = await new Promise(resolve =>
    chrome.runtime.sendMessage(
      { type: "helm:claude", system: "You are a test.", user: "Reply with OK.", model: "claude-haiku-4-5-20251001" },
      resolve
    )
  );

  btn.disabled = false;
  if (resp?.ok) {
    statusEl.textContent = "✓ Key verified!";
    statusEl.className = "status ok";
    setTimeout(() => showStep(2), 700);
  } else if (resp?.error === "no_api_key") {
    statusEl.textContent = "Key couldn't be saved. Try again.";
    statusEl.className = "status err";
  } else {
    const msg = resp?.message || "";
    if (msg.includes("401") || msg.includes("invalid") || msg.toLowerCase().includes("auth")) {
      statusEl.textContent = "Invalid key — check it and try again.";
    } else {
      statusEl.textContent = `Couldn't connect: ${msg.slice(0, 100)}`;
    }
    statusEl.className = "status err";
  }
});

$("#apiKey").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#verifyBtn").click();
});

/* Step 2: wake word */
function finishSetup() {
  const wake = $("#wakeWord").value || "yo";
  chrome.storage.local.set({
    wakeWord: wake,
    personality: "subtle",
    followupSeconds: 8,
    voiceReplies: false,
    openMic: false,
    enabled: true,
    micLang: "en-US",
    useVision: false,
    "helm.onboarded": true,
    "helm.usage": { input: 0, output: 0, calls: 0 },
  });
  $("#doneWake").textContent = WAKE_LABELS[wake] || `"${wake}"`;
  showStep(3);
}

$("#finishBtn").addEventListener("click", finishSetup);
$("#skipWakeBtn").addEventListener("click", () => {
  chrome.storage.local.set({
    personality: "subtle",
    followupSeconds: 8,
    voiceReplies: false,
    openMic: false,
    enabled: true,
    micLang: "en-US",
    useVision: false,
    "helm.onboarded": true,
    "helm.usage": { input: 0, output: 0, calls: 0 },
  });
  showStep(3);
});

/* Step 3: done */
$("#closeBtn").addEventListener("click", () => window.close());

/* Pre-fill if key already exists (user re-opened wizard) */
chrome.storage.local.get(["apiKey", "wakeWord", "helm.onboarded"]).then((s) => {
  if (s.apiKey) $("#apiKey").value = s.apiKey;
  if (s.wakeWord) $("#wakeWord").value = s.wakeWord;
  if (s["helm.onboarded"]) {
    // Already set up — jump to done
    const wake = s.wakeWord || "yo";
    $("#doneWake").textContent = WAKE_LABELS[wake] || `"${wake}"`;
    showStep(3);
  }
});
