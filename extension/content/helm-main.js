/* Helm content script — main
 * Builds the overlay DOM, wires events, runs the command loop.
 */
(function () {
  const H = window.__helm;
  if (!H) return;

  /* ---------- Build DOM overlay ---------- */

  // A single container we mount into <body>. data-helm-overlay so we exclude it from element discovery.
  const root = document.createElement("div");
  root.setAttribute("data-helm-overlay", "");
  root.className = "helm-root";
  root.innerHTML = `
    <div class="helm-cursor mode-offline personality-subtle" data-helm-cursor>
      <div class="helm-core"></div>
      <div class="helm-halo"></div>
      <div class="helm-ring"></div>
      <div class="helm-ring helm-ring-2"></div>
      <div class="helm-pill" data-helm-pill hidden></div>
    </div>

    <div class="helm-hud" data-helm-hud>
      <button class="helm-enable" data-helm-enable>
        <span class="helm-enable-dot"></span> Enable Helm
      </button>
      <button class="helm-orb is-dim" data-helm-orb hidden>
        <span class="helm-orb-dot"></span>
        <span class="helm-orb-text" data-helm-orb-text></span>
      </button>
    </div>

    <div class="helm-said" data-helm-said hidden>
      <span class="helm-said-mark">Helm</span>
      <span class="helm-said-text" data-helm-said-text></span>
      <button class="helm-said-x" data-helm-said-x>&times;</button>
    </div>

    <form class="helm-textcmd" data-helm-textcmd hidden>
      <span class="helm-textcmd-dot"></span>
      <input data-helm-textcmd-input placeholder="or type what you want Helm to do" />
      <button type="submit" data-helm-textcmd-submit hidden>Go</button>
    </form>
  `;

  function mount() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
      return;
    }
    document.body.appendChild(root);
  }
  mount();

  const $ = (sel) => root.querySelector(sel);
  const cursorEl   = $("[data-helm-cursor]");
  const pillEl     = $("[data-helm-pill]");
  const enableBtn  = $("[data-helm-enable]");
  const orbBtn     = $("[data-helm-orb]");
  const orbTextEl  = $("[data-helm-orb-text]");
  const saidEl     = $("[data-helm-said]");
  const saidTextEl = $("[data-helm-said-text]");
  const saidX      = $("[data-helm-said-x]");
  const textcmdEl  = $("[data-helm-textcmd]");
  const textcmdInput = $("[data-helm-textcmd-input]");
  const textcmdSubmit = $("[data-helm-textcmd-submit]");

  /* ---------- Render ---------- */

  let followupTicker = null;
  let followupRemaining = 0;
  let saidTimer = null;
  let listenTimer = null;

  H.renderCursor = function () {
    cursorEl.style.transform = `translate3d(${H.cursorPos.x}px, ${H.cursorPos.y}px, 0)`;
  };

  function wakeWordLabel() {
    const s = H.settings || {};
    if (s.wakeWord === "custom") return s.customWake || "…";
    if (s.wakeWord === "hey") return "hey there";
    return s.wakeWord || "yo";
  }

  function render() {
    const { mode, recOk, lastError, liveHeard, transcript, committedCommand, helmThought } = H.state;
    const s = H.settings || {};

    // Cursor classes
    cursorEl.className = `helm-cursor mode-${mode} personality-${s.personality || "subtle"}`;

    // Pill near cursor
    if (mode === "offline" || mode === "idle") {
      pillEl.hidden = true;
    } else {
      pillEl.hidden = false;
      pillEl.className = `helm-pill helm-pill-${mode}`;
      if (mode === "listening") {
        pillEl.textContent = transcript ? `"${transcript}"` : "Listening…";
      } else if (mode === "thinking") {
        pillEl.innerHTML = `<span class="helm-dots"><i></i><i></i><i></i></span>` +
                           (committedCommand ? `<span class="helm-cmd">${escape(committedCommand)}</span>` : "");
      } else if (mode === "acting") {
        pillEl.textContent = helmThought || "Acting…";
      } else if (mode === "speaking") {
        pillEl.innerHTML = `<span class="helm-wave"><i></i><i></i><i></i><i></i></span>`;
      }
    }

    // HUD orb
    if (mode === "offline") {
      enableBtn.hidden = false;
      orbBtn.hidden = true;
      textcmdEl.hidden = true;
    } else {
      enableBtn.hidden = true;
      orbBtn.hidden = false;
      textcmdEl.hidden = false;

      orbBtn.className =
        "helm-orb" +
        (recOk ? " is-live" : " is-dim") +
        (followupRemaining > 0 ? " is-follow" : "") +
        (s.openMic ? " is-open" : "") +
        (liveHeard ? " has-heard" : "");

      orbTextEl.textContent = liveHeard
        ? liveHeard
        : (s.openMic
            ? "open mic"
            : followupRemaining > 0
              ? `${followupRemaining}s`
              : `say "${wakeWordLabel()}"`);

      orbBtn.title = !recOk
        ? (lastError ? `Mic: ${lastError}` : "Starting mic…")
        : s.openMic
          ? "Open mic · click to turn off"
          : followupRemaining > 0
            ? `Follow-up · ${followupRemaining}s · click to stop`
            : `Listening for "${wakeWordLabel()}" · click to stop`;
    }

    // Said pill
    if (H.state.saidText) {
      saidEl.hidden = false;
      saidTextEl.textContent = H.state.saidText;
    } else {
      saidEl.hidden = true;
    }

    // Text command submit visibility
    textcmdSubmit.hidden = !textcmdInput.value.trim();
    textcmdInput.disabled = mode === "thinking" || mode === "acting";
    textcmdInput.placeholder = textcmdInput.disabled ? "Helm is working…" : "or type what you want Helm to do";
  }
  function escape(s) { return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }

  H.onChange.add(render);
  H.renderCursor();
  render();

  /* ---------- Mouse tracking (when AI isn't driving) ---------- */
  window.addEventListener("mousemove", (e) => {
    if (H.aiDriving) return;
    H.cursorPos.x = e.clientX; H.cursorPos.y = e.clientY;
    H.renderCursor();
  });

  /* ---------- Push-to-talk via Space ---------- */
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat
        && document.activeElement?.tagName !== "INPUT"
        && document.activeElement?.tagName !== "TEXTAREA"
        && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      H.state.pttDown = true;
      if (H.state.mode === "idle") armCommandCapture("(push-to-talk)");
    }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") H.state.pttDown = false; });

  /* ---------- Offline command table ---------- */
  const OFFLINE = [
    { re: /\bscroll\s+down\b|\bpage\s+down\b/i,                   fn: () => window.scrollBy({ top: 500, behavior: "smooth" }) },
    { re: /\bscroll\s+up\b|\bpage\s+up\b/i,                       fn: () => window.scrollBy({ top: -500, behavior: "smooth" }) },
    { re: /\b(go\s+to|scroll\s+to)\s+(the\s+)?top\b/i,            fn: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { re: /\b(go\s+to|scroll\s+to)\s+(the\s+)?bottom\b/i,         fn: () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }) },
    { re: /\bgo\s+back\b/i,                                       fn: () => history.back() },
    { re: /\bgo\s+forward\b/i,                                    fn: () => history.forward() },
    { re: /\b(refresh|reload)(\s+(the\s+)?(page|tab))?\b/i,       fn: () => location.reload() },
    { re: /\bcopy\s+(that|this|it)\b|\bjust\s+copy\b/i,           fn: () => document.execCommand("copy") },
    { re: /\bzoom\s+in\b/i,                                       fn: () => { const z = parseFloat(document.body.style.zoom || "1"); document.body.style.zoom = Math.min(z + 0.15, 3).toFixed(2); } },
    { re: /\bzoom\s+out\b/i,                                      fn: () => { const z = parseFloat(document.body.style.zoom || "1"); document.body.style.zoom = Math.max(z - 0.15, 0.3).toFixed(2); } },
    { re: /\b(reset\s+zoom|zoom\s+reset|zoom\s+normal)\b/i,       fn: () => { document.body.style.zoom = ""; } },
  ];
  const SUMMARIZE_RE = /\b(summarize|give\s+me\s+a\s+summary|what'?s?\s+on\s+this\s+page|explain\s+this\s+page|what\s+(does\s+this|is\s+this)\s+(page\s+)?(say|about|do)|describe\s+this\s+page|what\s+is\s+this\s+(page\s+)?about)\b/i;

  function tryOfflineCommand(text) {
    for (const { re, fn } of OFFLINE) {
      if (re.test(text)) { try { fn(); } catch {} return true; }
    }
    return false;
  }

  /* ---------- Speech handlers ---------- */
  function armCommandCapture(reason) {
    H.captureBuf = "";
    H.captureUntil = Date.now() + 6000;
    H.update({ transcript: "", mode: "listening" });
    if (listenTimer) clearTimeout(listenTimer);
    listenTimer = setTimeout(() => {
      if (H.state.mode !== "listening") return;
      if (H.captureBuf.trim()) {
        commitCommand(H.captureBuf.trim());
      } else {
        H.update({ mode: "idle", transcript: "", liveHeard: "" });
      }
    }, 6000);
  }

  H.handleFinal = function (text) {
    H.update({ liveHeard: text });
    const s = H.settings || {};

    if (H.state.pttDown) { commitCommand(text); return; }

    if (s.openMic) {
      const clean = text.trim();
      if (clean.split(/\s+/).filter(Boolean).length >= 2) commitCommand(clean);
      return;
    }

    if (H.state.followupUntil > Date.now()) {
      H.state.followupUntil = 0;
      followupRemaining = 0;
      if (followupTicker) clearInterval(followupTicker);
      commitCommand(text);
      return;
    }

    const cmd = H.extractCommand(text);
    if (cmd === null) {
      if (H.state.mode === "listening") {
        H.captureBuf += " " + text;
        H.update({ transcript: H.captureBuf.trim() });
        if (Date.now() > H.captureUntil && H.captureBuf.trim().length > 0) {
          commitCommand(H.captureBuf.trim());
        }
      }
      return;
    }
    if (cmd === "") { armCommandCapture("Listening…"); return; }
    commitCommand(cmd);
  };

  async function commitCommand(text) {
    if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; }
    const clean = text.trim().replace(/[.!?]+$/, "");
    if (!clean) { H.update({ mode: "idle", liveHeard: "" }); return; }

    // Offline commands — instant, no API call
    if (tryOfflineCommand(clean)) {
      H.update({ mode: "idle", liveHeard: "", committedCommand: "", transcript: "" });
      armFollowup();
      return;
    }

    // Page summarization — specialized Claude call
    if (SUMMARIZE_RE.test(clean)) {
      H.update({ mode: "thinking", committedCommand: clean, transcript: "", liveHeard: "" });
      const summary = await H.summarizePage();
      if (summary) {
        showSaid(summary);
        H.update({ mode: "speaking" });
        await H.speak(summary);
      }
      armFollowup();
      setTimeout(() => H.update({ committedCommand: "", helmThought: "", mode: "idle" }), 500);
      return;
    }

    H.update({ mode: "thinking", committedCommand: clean, transcript: "", liveHeard: "" });

    const elements = H.collectElements();
    const recent = (H.loadMem().actions || []).slice(-6).map(a => a.d);

    const plan = await H.askClaude({
      command: clean,
      elements: elements.map(e => ({ id: e.id, label: e.label, kind: e.kind, section: e.section, text: e.text })),
      recent,
      screen: H.getScreenLabel(),
      viewportSummary: H.summarizeViewport(),
    });

    H.update({ helmThought: plan.thought || "" });

    if (plan.clarify) {
      showSaid(plan.clarify);
      if (H.settings?.voiceReplies) { H.update({ mode: "speaking" }); await H.speak(plan.clarify); }
      armFollowup();
      setTimeout(() => H.update({ committedCommand: "", helmThought: "" }), 4000);
      return;
    }

    H.update({ mode: "acting" });
    for (const a of plan.actions) {
      try { await H.executeAction(a, elements); }
      catch (err) { console.warn("[Helm] action failed:", err); }
    }
    if (plan.speak) {
      showSaid(plan.speak);
      if (H.settings?.voiceReplies) { H.update({ mode: "speaking" }); await H.speak(plan.speak); }
    }
    armFollowup();
    setTimeout(() => H.update({ committedCommand: "", helmThought: "" }), 3000);
  }

  function armFollowup() {
    const s = H.settings || {};
    if (s.openMic) { H.update({ mode: "idle" }); return; }
    const seconds = typeof s.followupSeconds === "number" ? s.followupSeconds : 8;
    if (seconds <= 0) { H.update({ mode: "idle" }); return; }
    const until = Date.now() + seconds * 1000;
    H.state.followupUntil = until;
    followupRemaining = seconds;
    H.update({ mode: "idle" });
    if (followupTicker) clearInterval(followupTicker);
    followupTicker = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      followupRemaining = left;
      render();
      if (left <= 0) { clearInterval(followupTicker); H.state.followupUntil = 0; }
    }, 250);
  }

  function showSaid(text) {
    if (!text) return;
    H.update({ saidText: text });
    clearTimeout(saidTimer);
    saidTimer = setTimeout(() => H.update({ saidText: "" }), Math.min(8000, 2200 + text.length * 35));
  }
  H.showSaid = showSaid;

  /* ---------- UI events ---------- */
  enableBtn.addEventListener("click", () => H.requestMicAndStart());
  orbBtn.addEventListener("click", () => H.stopAll());
  saidX.addEventListener("click", () => H.update({ saidText: "" }));
  textcmdEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = textcmdInput.value.trim();
    if (!v) return;
    textcmdInput.value = "";
    textcmdSubmit.hidden = true;
    commitCommand(v);
  });
  textcmdInput.addEventListener("input", () => {
    textcmdSubmit.hidden = !textcmdInput.value.trim();
  });

  /* ---------- Settings live updates ---------- */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "helm:settings-changed") {
      const prevLang = H.settings?.micLang;
      H.loadSettings().then(() => {
        render();
        if (H.settings && H.settings.enabled === false) {
          root.style.display = "none";
        } else {
          root.style.display = "";
          // Restart recognizer if mic language changed so new lang takes effect immediately
          if (H.wantListening && H.settings?.micLang !== prevLang) {
            H.startRecognizer();
          }
        }
      });
    } else if (msg?.type === "helm:open-mic-toggle") {
      H.loadSettings().then(render);
    } else if (msg?.type === "helm:enable") {
      H.requestMicAndStart();
    } else if (msg?.type === "helm:disable") {
      H.stopAll();
    }
  });

  /* ---------- Init ---------- */
  H.loadSettings().then(() => {
    if (H.settings?.enabled === false) {
      root.style.display = "none";
      render();
      return;
    }
    render();
    // Auto-start on every new page when Helm is enabled.
    // getUserMedia will succeed silently if mic permission was already granted
    // for this origin; if not, it fails gracefully and shows the Enable button.
    H.requestMicAndStart();
  });
})();
