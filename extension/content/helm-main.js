/* Helm content script — main
 * Builds the overlay DOM, wires events, runs the command loop.
 * Only runs in the top-level frame — iframes get helm-core/dom but no overlay.
 */
(function () {
  if (window !== window.top) return; // don't mount overlay inside iframes
  if (window.__helmMain) return;     // already mounted in this JS execution context
  window.__helmMain = true;

  // Remove any stale overlay left in the DOM by a previous extension instance
  // (removing an extension doesn't clean up DOM; without this the new injection
  //  would find the old dead overlay and bail, leaving mic non-functional)
  document.querySelectorAll("[data-helm-overlay]").forEach(el => el.remove());

  const H = window.__helm;
  if (!H) return;

  /* ---------- Build DOM overlay ---------- */

  // A single container we mount into <body>. data-helm-overlay so we exclude it from element discovery.
  const root = document.createElement("div");
  root.setAttribute("data-helm-overlay", "");
  root.className = "helm-root";
  root.innerHTML = `
    <div class="helm-hud" data-helm-hud>
      <button class="helm-enable" data-helm-enable>
        <span class="helm-enable-dot"></span> Enable Helm
      </button>
      <button class="helm-orb is-dim" data-helm-orb hidden>
        <span class="helm-orb-dot"></span>
        <span class="helm-orb-text" data-helm-orb-text></span>
      </button>
    </div>

    <form class="helm-textcmd" data-helm-textcmd hidden>
      <div class="helm-textcmd-reply" data-helm-textcmd-reply hidden>
        <span class="helm-textcmd-reply-mark">Helm</span>
        <span class="helm-textcmd-reply-text" data-helm-textcmd-reply-text></span>
      </div>
      <div class="helm-textcmd-row">
        <svg class="helm-textcmd-logo" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9" fill="rgba(255,138,61,0.18)" stroke="rgba(255,138,61,0.6)" stroke-width="1.2"/>
          <circle cx="10" cy="10" r="4" fill="#ff8a3d"/>
        </svg>
        <input data-helm-textcmd-input placeholder="Ask Helm anything…" />
        <button class="helm-textcmd-mic" type="button" data-helm-textcmd-mic aria-label="Voice input">
          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
            <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="8" y1="22" x2="16" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="helm-textcmd-send" type="submit" data-helm-textcmd-submit hidden>Go</button>
      </div>
    </form>

    <div class="helm-confirm" data-helm-confirm hidden>
      <div class="helm-confirm-body">
        <span class="helm-confirm-icon">⚠</span>
        <div class="helm-confirm-text">
          <div class="helm-confirm-action">About to click: <span data-helm-confirm-label></span></div>
          <div class="helm-confirm-hint">Say <b>yes</b> to confirm · <b>no</b> to cancel</div>
        </div>
        <div class="helm-confirm-btns">
          <button class="helm-confirm-yes" data-helm-confirm-yes>Yes</button>
          <button class="helm-confirm-no" data-helm-confirm-no>No</button>
        </div>
      </div>
      <div class="helm-confirm-track"><div class="helm-confirm-progress" data-helm-confirm-progress></div></div>
    </div>
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
  const enableBtn  = $("[data-helm-enable]");
  const orbBtn     = $("[data-helm-orb]");
  const orbTextEl  = $("[data-helm-orb-text]");
  const textcmdEl       = $("[data-helm-textcmd]");
  const textcmdInput    = $("[data-helm-textcmd-input]");
  const textcmdSubmit   = $("[data-helm-textcmd-submit]");
  const textcmdMic      = $("[data-helm-textcmd-mic]");
  const replyEl         = $("[data-helm-textcmd-reply]");
  const replyTextEl     = $("[data-helm-textcmd-reply-text]");
  const confirmEl       = $("[data-helm-confirm]");
  const confirmLabelEl  = $("[data-helm-confirm-label]");
  const confirmProgress = $("[data-helm-confirm-progress]");
  const confirmYesBtn   = $("[data-helm-confirm-yes]");
  const confirmNoBtn    = $("[data-helm-confirm-no]");

  /* ---------- Render ---------- */

  let followupTicker = null;
  let followupRemaining = 0;
  let saidTimer = null;
  let barPinned = false;
  let listenTimer = null;
  let confirmTicker = null;
  H.pendingConfirm = null;

  H.renderCursor = function () { /* cursor visual removed */ };

  function wakeWordLabel() {
    const s = H.settings || {};
    if (s.wakeWord === "custom") return s.customWake || "…";
    if (s.wakeWord === "hey") return "hey there";
    return s.wakeWord || "yo";
  }

  function render() {
    const { mode, recOk, lastError, liveHeard, transcript, committedCommand, helmThought } = H.state;
    const s = H.settings || {};

    // HUD orb / enable button
    if (mode === "offline") {
      enableBtn.hidden = false;
      orbBtn.hidden = true;
      textcmdEl.hidden = true;
      if (lastError === "mic-blocked") {
        enableBtn.innerHTML = `<span class="helm-enable-dot" style="background:#f87171"></span> Mic blocked — click 🔒 to allow`;
        enableBtn.title = "Chrome blocked the mic for this site. Click the lock icon in the address bar → Site settings → Microphone → Allow, then click here.";
      } else {
        enableBtn.innerHTML = `<span class="helm-enable-dot"></span> Enable Helm`;
        enableBtn.title = "";
      }
    } else {
      enableBtn.hidden = true;
      orbBtn.hidden = false;
      // Only auto-show for replies; orb handles all other status
      const autoShow = !replyEl.hidden;
      textcmdEl.hidden = !barPinned && !autoShow;

      orbBtn.className =
        "helm-orb" +
        (recOk ? " is-live" : " is-dim") +
        (followupRemaining > 0 ? " is-follow" : "") +
        (s.openMic ? " is-open" : "") +
        (liveHeard ? " has-heard" : "");

      orbTextEl.textContent = liveHeard
        ? liveHeard
        : mode === "thinking"
          ? "thinking…"
          : mode === "acting"
            ? (helmThought || "acting…")
            : mode === "speaking"
              ? "speaking…"
              : mode === "listening"
                ? (transcript ? `"${transcript}"` : "listening…")
                : s.openMic
                  ? "open mic"
                  : H.sessionActive
                    ? "ready — just speak"
                    : followupRemaining > 0
                      ? `follow-up · ${followupRemaining}s`
                      : `say "${wakeWordLabel()}"`;

      orbBtn.title = !recOk
        ? (lastError ? `Mic: ${lastError}` : "Starting mic…")
        : s.openMic
          ? "Open mic · click to turn off · Alt+Space for text"
          : H.sessionActive
            ? "Session active — just speak · click to stop · Alt+Space for text"
            : followupRemaining > 0
              ? `Follow-up · ${followupRemaining}s · click to stop`
              : `Listening for "${wakeWordLabel()}" · Alt+Space for text bar`;
    }

    // Text command bar state
    const barBusy = mode === "thinking" || mode === "acting" || mode === "speaking";
    if (!textcmdMic.classList.contains("is-recording")) {
      textcmdSubmit.hidden = !textcmdInput.value.trim();
      textcmdInput.disabled = barBusy;
      textcmdInput.placeholder = barBusy
        ? (mode === "thinking" ? "Thinking…" : mode === "acting" ? "Acting…" : "Speaking…")
        : "Ask Helm anything…";
    }
    textcmdEl.classList.toggle("is-session", H.sessionActive);
    textcmdEl.classList.toggle("is-busy", barBusy);
  }
  function escape(s) { return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }

  H.onChange.add(render);
  render();

  /* ---------- Mouse tracking (position still tracked for glideTo clicks) ---------- */
  window.addEventListener("mousemove", (e) => {
    if (H.aiDriving) return;
    H.cursorPos.x = e.clientX; H.cursorPos.y = e.clientY;
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

  /* ---------- Risky-action confirmation ---------- */
  const CONFIRM_MS = 5000;

  function showConfirmOverlay(label) {
    confirmLabelEl.textContent = label;
    confirmEl.hidden = false;
    const start = Date.now();
    if (confirmTicker) clearInterval(confirmTicker);
    confirmTicker = setInterval(() => {
      const pct = Math.max(0, 1 - (Date.now() - start) / CONFIRM_MS);
      confirmProgress.style.width = `${pct * 100}%`;
      if (pct === 0) clearInterval(confirmTicker);
    }, 40);
  }

  function hideConfirmOverlay() {
    confirmEl.hidden = true;
    if (confirmTicker) { clearInterval(confirmTicker); confirmTicker = null; }
    confirmProgress.style.width = "100%";
  }

  function requestConfirm(label) {
    return new Promise(resolve => {
      H.pendingConfirm = resolve;
      showConfirmOverlay(label);
      setTimeout(() => {
        if (H.pendingConfirm === resolve) {
          H.pendingConfirm = null;
          hideConfirmOverlay();
          showSaid("Cancelled — timed out.");
          resolve(false);
        }
      }, CONFIRM_MS);
    });
  }

  function resolveConfirm(yes) {
    if (!H.pendingConfirm) return;
    const resolve = H.pendingConfirm;
    H.pendingConfirm = null;
    hideConfirmOverlay();
    resolve(yes);
  }

  confirmYesBtn.addEventListener("click", () => resolveConfirm(true));
  confirmNoBtn.addEventListener("click",  () => resolveConfirm(false));

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
  /* ---------- Claude-site quick commands ---------- */
  const ON_CLAUDE = location.hostname === "claude.ai" || location.hostname.endsWith(".claude.ai");

  function claudeInput() {
    // Claude.ai's ProseMirror chat box — biggest contenteditable on the page, not inside Helm overlay
    return Array.from(document.querySelectorAll("[contenteditable='true']"))
      .filter(el => !el.closest("[data-helm-overlay]") && el.offsetParent !== null)
      .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0] || null;
  }

  async function typeIntoClaudeInput(text, andSend) {
    const inp = claudeInput();
    if (!inp) return false;
    inp.focus();
    await new Promise(r => setTimeout(r, 80));
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    inp.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    if (!inp.textContent.includes(text.slice(0, 10))) {
      document.execCommand("insertText", false, text);
    }
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    if (andSend) {
      await new Promise(r => setTimeout(r, 120));
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      inp.dispatchEvent(new KeyboardEvent("keyup",   { key: "Enter", code: "Enter", bubbles: true }));
    }
    return true;
  }

  async function tryClaudeCommand(text) {
    if (!ON_CLAUDE) return false;
    // "new chat" / "start new conversation"
    if (/\b(new\s+chat|new\s+conversation|start\s+(a\s+)?(new|fresh)(\s+chat|\s+conversation)?)\b/i.test(text)) {
      const btn = Array.from(document.querySelectorAll("button, a"))
        .find(el => /new\s*chat|new\s*conversation/i.test(el.getAttribute("aria-label") || el.innerText || ""));
      if (btn) { btn.click(); showSaid("Starting new chat."); return true; }
    }
    // "read Claude's response" / "what did Claude say"
    if (/\b(read|what\s+did\s+claude\s+say|read\s+(claude'?s?|the\s+)?(response|reply|answer|last\s+message))\b/i.test(text)) {
      const msgs = Array.from(document.querySelectorAll(
        "[data-testid='assistant-message'], .font-claude-message, [class*='AssistantMessage'], [class*='assistant-message']"
      )).filter(el => el.offsetParent !== null);
      const last = msgs[msgs.length - 1];
      if (last) {
        const t = (last.innerText || last.textContent || "").trim().replace(/\s+/g, " ").slice(0, 600);
        showSaid(t.slice(0, 200));
        if (H.settings?.voiceReplies) { H.update({ mode: "speaking" }); await H.speak(t); }
        return true;
      }
    }
    // "ask Claude X" / "send X to Claude" / "tell Claude X"
    const askM = text.match(/\b(?:ask|send|tell)\s+claude\s+(.+)/i);
    if (askM) {
      const sent = await typeIntoClaudeInput(askM[1].trim(), true);
      if (sent) { showSaid(`Sending to Claude…`); return true; }
    }
    // "type X" / "type X in the chat" (Claude context)
    const typeM = text.match(/^type\s+(.+?)(?:\s+in(?:to)?\s+(?:the\s+)?(?:chat|input|box))?$/i);
    if (typeM) {
      const send = /\bsend\b|\bsubmit\b/i.test(text);
      const sent = await typeIntoClaudeInput(typeM[1].trim(), send);
      if (sent) return true;
    }
    return false;
  }

  const SUMMARIZE_RE = /\b(summarize|give\s+me\s+a\s+summary|what'?s?\s+on\s+this\s+page|explain\s+this\s+page|what\s+(does\s+this|is\s+this)\s+(page\s+)?(say|about|do)|describe\s+this\s+page|what\s+is\s+this\s+(page\s+)?about)\b/i;
  const SELECTION_READ_RE = /\b(read\s+(that|this|the\s+selection|selected\s+text|what\s+(i|you)'?ve?\s+selected)|read\s+what'?s?\s+selected)\b/i;

  function tryOfflineCommand(text) {
    for (const { re, fn } of OFFLINE) {
      if (re.test(text)) { try { fn(); } catch {} return true; }
    }
    return false;
  }

  /* ---------- Tab command detection ---------- */
  async function tryTabCommand(text) {
    let action = null, query = null;

    if (/\b(new\s+tab|open\s+(a\s+)?new\s+tab)\b/i.test(text)) {
      action = "new";
    } else if (/\b(close\s+(this\s+|the\s+|current\s+)?tab)\b/i.test(text)) {
      action = "close";
    } else if (/\b(duplicate\s+(this\s+|the\s+)?tab)\b/i.test(text)) {
      action = "duplicate";
    } else if (/\b(pin\s+(this\s+|the\s+)?tab)\b/i.test(text)) {
      action = "pin";
    } else if (/\b(next\s+tab|tab\s+right|go\s+to\s+next\s+tab)\b/i.test(text)) {
      action = "next";
    } else if (/\b(prev(ious)?\s+tab|tab\s+left|go\s+to\s+prev(ious)?\s+tab)\b/i.test(text)) {
      action = "prev";
    } else {
      const m = text.match(/\b(?:switch\s+to|go\s+to|open)\s+(?:the\s+)?(?:my\s+)?(.+?)\s+tab\b/i);
      if (m) { action = "switch"; query = m[1].trim(); }
    }

    if (!action) return false;

    const result = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: "helm:tab", action, query }, resolve)
    );
    if (result?.feedback) showSaid(result.feedback);
    return true;
  }

  const LISTEN_MS = 9000; // max silence window before committing

  /* ---------- Speech handlers ---------- */
  function armCommandCapture(reason) {
    H.sessionActive = true; // first wake word activates session — no wake word needed until Stop
    H.captureBuf = "";
    H.update({ transcript: "", mode: "listening" });
    resetListenTimer();
  }

  function resetListenTimer() {
    if (listenTimer) clearTimeout(listenTimer);
    listenTimer = setTimeout(() => {
      if (H.state.mode !== "listening") return;
      if (H.captureBuf.trim()) {
        commitCommand(H.captureBuf.trim());
      } else {
        H.update({ mode: "idle", transcript: "", liveHeard: "" });
      }
    }, LISTEN_MS);
  }

  H.handleFinal = function (text) {
    // Confirmation intercept — yes/no before any other speech processing
    if (H.pendingConfirm) {
      const t = text.toLowerCase().trim();
      if (/\b(yes|yeah|yep|yup|confirm|do\s+it|go\s+ahead|proceed|ok|okay|sure)\b/.test(t)) {
        resolveConfirm(true);
      } else if (/\b(no|nope|nah|cancel|stop|don'?t|abort|never\s+mind|skip)\b/.test(t)) {
        showSaid("Cancelled.");
        resolveConfirm(false);
      }
      return;
    }

    H.update({ liveHeard: text });
    const s = H.settings || {};

    if (H.state.pttDown) { commitCommand(text); return; }

    if (s.openMic) {
      const clean = text.trim();
      if (clean.split(/\s+/).filter(Boolean).length >= 2) commitCommand(clean);
      return;
    }

    // Session mode: wake word already said this session — accept commands freely
    if (H.sessionActive) {
      const busy = H.state.mode === "thinking" || H.state.mode === "acting" || H.state.mode === "speaking";
      if (busy) return; // drop while working, don't queue up
      const clean = text.trim();
      // Still ignore very short fragments (filled pauses, background noise)
      if (clean.split(/\s+/).filter(Boolean).length >= 2) {
        commitCommand(clean);
      }
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
        resetListenTimer(); // heard a word — extend the silence window
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
    try {
      await _commitCommand(clean);
    } catch (err) {
      console.warn("[Helm] commitCommand crashed — resetting to idle:", err);
      H.update({ mode: "idle", liveHeard: "", transcript: "", committedCommand: "", helmThought: "" });
      armFollowup();
    }
  }

  async function _commitCommand(clean) {

    // Capture any text the user has highlighted on the page at the moment they spoke
    const selectedText = window.getSelection()?.toString().trim() || "";

    // Log every non-empty command to history (fire-and-forget)
    chrome.storage.local.get("helm.history", (r) => {
      const h = r["helm.history"] || [];
      chrome.storage.local.set({ "helm.history": [...h, { text: clean, ts: Date.now() }].slice(-10) });
    });

    // Read selected text aloud — instant, no API call
    if (SELECTION_READ_RE.test(clean) && selectedText) {
      H.update({ mode: "speaking", committedCommand: clean });
      showSaid(selectedText.slice(0, 200));
      await H.speak(selectedText.slice(0, 600));
      armFollowup();
      setTimeout(() => H.update({ committedCommand: "", mode: "idle" }), 500);
      return;
    }

    // Offline commands — instant, no API call
    if (tryOfflineCommand(clean)) {
      H.update({ mode: "idle", liveHeard: "", committedCommand: "", transcript: "" });
      armFollowup();
      return;
    }

    // Tab commands — routed through background, needs tabs permission
    if (await tryTabCommand(clean)) {
      H.update({ mode: "idle", liveHeard: "", committedCommand: "", transcript: "" });
      armFollowup();
      return;
    }

    // Claude-site commands — instant, no API call
    if (await tryClaudeCommand(clean)) {
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
      selectedText,
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
      try {
        // Gate risky clicks behind a voice/click confirmation
        if (a.type === "click") {
          const candidate = elements[a.id]?.el;
          if (candidate) {
            const riskLabel = H.isRisky(candidate);
            if (riskLabel) {
              const ok = await requestConfirm(riskLabel);
              if (!ok) continue;
            }
          }
        }
        await H.executeAction(a, elements);
      } catch (err) { console.warn("[Helm] action failed:", err); }
    }
    if (plan.speak) {
      showSaid(plan.speak);
      // Always speak if actions were empty (selection/explain queries are voice-first)
      const speakAloud = H.settings?.voiceReplies || plan.actions.length === 0;
      if (speakAloud) { H.update({ mode: "speaking" }); await H.speak(plan.speak); }
    }
    armFollowup();
    setTimeout(() => H.update({ committedCommand: "", helmThought: "" }), 3000);
  }

  function armFollowup() {
    const s = H.settings || {};
    // In session mode, just go idle — no timer needed, next utterance always accepted
    if (H.sessionActive || s.openMic) { H.update({ mode: "idle" }); return; }
    const seconds = typeof s.followupSeconds === "number" ? s.followupSeconds : 15;
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
    replyTextEl.textContent = text;
    replyEl.hidden = false;
    textcmdEl.classList.add("has-reply");
    clearTimeout(saidTimer);
    saidTimer = setTimeout(hideReply, Math.min(9000, 2400 + text.length * 38));
  }
  function hideReply() {
    replyEl.hidden = true;
    textcmdEl.classList.remove("has-reply");
    if (!barPinned && H.state.mode === "idle") textcmdEl.hidden = true;
  }
  H.showSaid = showSaid;

  /* ---------- Text-bar voice input ---------- */
  let textbarRec = null;

  function startTextbarVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = H.settings?.micLang || "en-US";
    textbarRec = rec;
    textcmdMic.classList.add("is-recording");
    textcmdInput.value = "";
    textcmdInput.placeholder = "Listening…";
    textcmdInput.disabled = false;
    textcmdSubmit.hidden = true;
    textcmdInput.focus();
    let committed = false;
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      textcmdInput.value = final || interim;
      textcmdSubmit.hidden = !textcmdInput.value.trim();
    };
    rec.onend = () => {
      textbarRec = null;
      textcmdMic.classList.remove("is-recording");
      textcmdInput.placeholder = "Ask Helm anything…";
      const v = textcmdInput.value.trim();
      if (v && !committed) {
        committed = true;
        // Brief pause so the user sees what was heard before it executes
        setTimeout(() => {
          textcmdInput.value = "";
          textcmdSubmit.hidden = true;
          commitCommand(v);
        }, 420);
      }
    };
    rec.onerror = () => {
      textbarRec = null;
      textcmdMic.classList.remove("is-recording");
      textcmdInput.placeholder = "Ask Helm anything…";
    };
    try { rec.start(); } catch {}
  }

  /* ---------- UI events ---------- */
  enableBtn.addEventListener("click", () => {
    H.sessionActive = true;
    chrome.storage.local.set({ helmActive: true });
    H.requestMicAndStart(true);
  });
  orbBtn.addEventListener("click", () => {
    chrome.storage.local.set({ helmActive: false });
    H.stopAll();
  });
  // reply auto-dismisses on timer — no X button

  textcmdMic.addEventListener("click", () => {
    if (textbarRec) { try { textbarRec.stop(); } catch {} return; }
    startTextbarVoice();
  });

  textcmdEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (textbarRec) { try { textbarRec.stop(); } catch {} return; }
    const v = textcmdInput.value.trim();
    if (!v) return;
    textcmdInput.value = "";
    textcmdSubmit.hidden = true;
    commitCommand(v);
  });
  textcmdInput.addEventListener("input", () => {
    textcmdSubmit.hidden = !textcmdInput.value.trim();
  });

  // Alt+Space — toggle command bar open/closed
  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "Space" && !e.repeat && H.state.mode !== "offline") {
      e.preventDefault();
      barPinned = !barPinned;
      render();
      if (barPinned) textcmdInput.focus();
    }
  });

  // Press "/" anywhere (when not in an input) to open + focus the command bar
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.repeat
        && document.activeElement?.tagName !== "INPUT"
        && document.activeElement?.tagName !== "TEXTAREA"
        && !document.activeElement?.isContentEditable
        && H.state.mode !== "offline") {
      e.preventDefault();
      barPinned = true;
      render();
      textcmdInput.focus();
    }
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
      H.requestMicAndStart(true);
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
    // Resume from previous session if user had Helm active before navigation.
    // Setting sessionActive=true means no wake word needed — user can speak
    // immediately just like before they navigated.
    chrome.storage.local.get("helmActive", ({ helmActive }) => {
      if (helmActive) H.sessionActive = true;
      H.requestMicAndStart(false);
    });
  });
})();
