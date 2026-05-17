/* Helm content script — core
 * Settings, speech recognition, Claude wrapper, state.
 * All shared state lives on window.__helm.
 * Other helm-*.js files extend the same namespace.
 */
(function () {
  if (window.__helm) return; // single-instance guard
  const H = window.__helm = {
    state: {
      mode: "offline",         // offline | idle | listening | thinking | acting | speaking
      recOk: false,
      lastError: "",
      liveHeard: "",
      transcript: "",
      committedCommand: "",
      helmThought: "",
      saidText: "",
      followupUntil: 0,
      pttDown: false,
    },
    settings: null,
    recognizer: null,
    wantListening: false,
    sessionActive: false,  // true after first wake word — no wake word needed until Stop is clicked
    captureBuf: "",
    captureUntil: 0,
    aiDriving: false,
    cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    onChange: new Set(),
    voiceCache: null,
  };

  H.update = function (partial) {
    Object.assign(H.state, partial);
    H.onChange.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
  };

  /* ---------- Settings (loaded from background) ---------- */
  H.loadSettings = async function () {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "helm:settings" }, (s) => {
        H.settings = s || {};
        resolve(H.settings);
      });
    });
  };

  /* ---------- Wake word ---------- */
  const WAKE_PRESETS = {
    helm:    ["helm", "hem", "elm", "hells", "hellmuth", "helmet", "helms", "halm", "holm", "home"],
    okay:    ["okay", "ok", "o.k.", "k", "kay"],
    hey:     ["hey there", "hey", "hay", "hi there"],
    computer:["computer", "computa", "compute"],
    yo:      ["yo", "yoh", "yos"],
  };
  H.buildWakeRe = function () {
    const s = H.settings || {};
    if (s.wakeWord === "none") return null;
    if (s.wakeWord === "custom" && s.customWake) {
      const w = s.customWake.toLowerCase().replace(/[^a-z\s]/g, "").trim();
      if (!w) return null;
      return new RegExp(`\\b${w}\\b[,!:.\\s]*`, "i");
    }
    const aliases = WAKE_PRESETS[s.wakeWord] || WAKE_PRESETS.yo;
    const alt = aliases.slice().sort((a,b)=>b.length-a.length).map(a => a.replace(/\./g, "\\.")).join("|");
    return new RegExp(`\\b(?:${alt})\\b[,!:.\\s]*`, "i");
  };
  H.extractCommand = function (transcript) {
    const re = H.buildWakeRe();
    if (!re) return null;
    const m = transcript.match(re);
    if (!m) return null;
    const idx = m.index + m[0].length;
    const after = transcript.slice(idx).trim();
    return after.length > 1 ? after : "";
  };

  /* ---------- Speech recognition ---------- */
  H.makeRecognizer = function ({ onInterim, onFinal, onError, onStart, onEnd }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = H.settings?.micLang || "en-US";
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) onInterim?.(interim);
      if (final)   onFinal?.(final);
    };
    rec.onerror = (e) => onError?.(e);
    rec.onstart = () => onStart?.();
    rec.onend   = () => onEnd?.();
    return rec;
  };

  H.startRecognizer = function () {
    if (H.recognizer) { try { H.recognizer.stop(); } catch {} }
    const rec = H.makeRecognizer({
      onInterim: (t) => {
        const busy = H.state.mode === "thinking" || H.state.mode === "acting" || H.state.mode === "speaking";
        if (!busy) H.update({ liveHeard: t });
        if ((H.state.mode === "listening" || H.state.pttDown) && !busy) {
          H.update({ transcript: t });
        }
      },
      onFinal: H.handleFinal,
      onError: (e) => {
        if (!e?.error || e.error === "no-speech" || e.error === "aborted") return;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          H.wantListening = false;
          H.update({ lastError: "mic-blocked", recOk: false, mode: "offline" });
        } else {
          H.update({ lastError: e.error, recOk: false });
        }
      },
      onStart: () => H.update({ recOk: true, lastError: "" }),
      onEnd: () => {
        H.update({ recOk: false });
        // Restart after a longer gap so Chrome's tab mic indicator doesn't
        // flash on/off. The getUserMedia stream (held in H._micStream) keeps
        // the indicator solid while SpeechRecognition cycles underneath.
        if (H.wantListening && !H._restartPending) {
          H._restartPending = true;
          setTimeout(() => {
            H._restartPending = false;
            if (H.wantListening) H.startRecognizer();
          }, 800);
        }
      },
    });
    if (!rec) {
      H.update({ mode: "offline", lastError: "no-speech-api" });
      return;
    }
    H.recognizer = rec;
    try { rec.start(); } catch {}
  };

  H.requestMicAndStart = async function (promptPermission = false) {
    if (H._micStream) { H._micStream.getTracks().forEach(t => t.stop()); H._micStream = null; }
    try {
      // Always try to hold a getUserMedia stream — keeps the Chrome tab mic
      // indicator solid instead of flashing every time SpeechRecognition cycles.
      // On sites where mic is already granted this succeeds silently.
      // On fresh origins with no permission, it will throw (handled below).
      const perm = await navigator.permissions.query({ name: "microphone" }).catch(() => null);
      if (perm?.state === "granted" || promptPermission) {
        H._micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {
      H._micStream = null; // denied — SpeechRecognition will surface "not-allowed"
    }
    H.wantListening = true;
    H.update({ mode: "idle", lastError: "" });
    H.startRecognizer();
  };

  H.stopAll = function () {
    H.wantListening = false;
    H.sessionActive = false;
    H._restartPending = false;
    if (H._micStream) { H._micStream.getTracks().forEach(t => t.stop()); H._micStream = null; }
    try { H.recognizer?.stop(); } catch {}
    H.update({ mode: "offline" });
  };

  /* ---------- Speech synthesis ---------- */
  function pickBestVoice() {
    if (H.voiceCache) return H.voiceCache;
    const voices = window.speechSynthesis.getVoices() || [];
    const tiers = [
      /(neural|premium|enhanced).*en/i,
      /en.*(neural|premium|enhanced)/i,
      /samantha|allison|ava|serena|karen/i,
      /google\s+us\s+english|google\s+uk\s+english/i,
      /microsoft\s+(aria|jenny|guy|davis)/i,
    ];
    for (const re of tiers) {
      const hit = voices.find(v => re.test(v.name));
      if (hit) return (H.voiceCache = hit);
    }
    const en = voices.find(v => v.lang?.startsWith("en"));
    return (H.voiceCache = en || voices[0] || null);
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener?.("voiceschanged", () => { H.voiceCache = null; });
  }
  H.speak = function (text) {
    if (!text || !window.speechSynthesis) return Promise.resolve();
    return new Promise((resolve) => {
      try { window.speechSynthesis.cancel(); } catch {}
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.0; u.volume = 1.0;
      const v = pickBestVoice();
      if (v) u.voice = v;
      u.onend = resolve;
      u.onerror = resolve;
      setTimeout(() => window.speechSynthesis.speak(u), 30);
    });
  };

  /* ---------- Claude orchestrator (via background) ---------- */

  function getSiteHints() {
    const host = location.hostname;
    const path = location.pathname;
    if (host === "claude.ai" || host.endsWith(".claude.ai")) {
      const isCode = path.startsWith("/code");
      return `
CURRENT SITE: ${isCode ? "Claude Code (claude.ai/code)" : "Claude.ai"} — Anthropic's AI chat interface.
Key UI facts:
- The user's message input is a ProseMirror contenteditable div, usually the largest [contenteditable] near the bottom of the page. Focus it, type, then press Enter to send.
- "Ask Claude X" / "send X to Claude" / "tell Claude X" = type X into the input then press Enter.
- "New chat" or "start fresh" = click the "New chat" button in the left sidebar.
- "Read Claude's response" / "what did Claude say" = use { "type": "read", "id": <last assistant message element> }.
- After typing into the input, always submit with { "type": "key", "key": "Enter" } — do NOT click the send button (unreliable).
- "Switch model" or "change model" = click the model-picker button near the input.
- The user may want to feed Helm's output back into Claude: if unsure, type the answer into the chat input.
`;
    }
    return "";
  }

  H.askClaude = async function ({ command, elements, recent, screen, viewportSummary, selectedText }) {
    const siteHints = getSiteHints();
    const system = `You are Helm, an AI cursor inside a browser. The user has spoken a command.
Respond with a JSON object describing what to do. No prose, no markdown, just JSON.

Schema:
{
  "thought": "very short explanation of intent",
  "speak": "what to say back, OR empty string. Speak only when explicitly asked.",
  "actions": [
    { "type": "click",  "id": <element id> },
    { "type": "hover",  "id": <element id> },
    { "type": "focus",  "id": <element id> },
    { "type": "type",   "text": "...", "id": <element id, optional> },
    { "type": "key",    "key": "Enter|Tab|Escape|ArrowDown|ArrowUp|...", "id": <optional> },
    { "type": "scroll", "direction": "up|down|top|bottom", "id": <optional>, "amount": <optional> },
    { "type": "read",   "id": <element id> },
    { "type": "wait",   "ms": <number> },
    { "type": "composio", "action": "<ACTION_ID>", "params": { <key>: <value> } }
  ],
  "clarify": "if ambiguous, ASK a follow-up question instead of acting. Else empty."
}

Rules:
- If unclear or ambiguous (multiple matching elements), set 'clarify' and leave 'actions' empty.
- For repeated work, output each click as a separate action in order.
- Use 'read' ONLY when the user explicitly asks Helm to read/say/tell/explain content. 'read' is the ONLY action that produces audible speech.
- Use 'scroll' for navigation requests. Use 'key' for keyboard shortcuts.
- DO NOT set 'speak' unless the user EXPLICITLY asked Helm to say/tell something verbally. The cursor moving is confirmation — never narrate.
- Be concise. Be confident.

Selected text:
- If "Selected text" is provided below, the user has highlighted something on the page.
- Commands like "explain that", "translate this", "define that", "summarize the selection", "what does this mean" refer to the selected text.
- For those commands: set 'speak' to your answer about the selected text, leave 'actions' empty.
- For "search for that" or "look up that": use the selected text as the search query.

Link navigation:
- Element labels include a destination hint like '→ /path' (same site) or '→ example.com' (external). Use 'click' on the matching link element to navigate.
- If the user says 'go to', 'open', 'visit', or 'click [name]', find the best matching link or button and click it.

Search and typing:
- 'Search for X' or 'look up X': find the search input, type X, then ALWAYS follow with { "type": "key", "key": "Enter" } to submit.
- 'Type X in [field]': focus the field and type X. Only add Enter if the user also says 'and search', 'and submit', or 'and send'.
- Chat or AI prompt boxes (contenteditable or large textarea): use 'type' to enter text, then 'key' Enter to send if the user said 'send' or 'ask'.
- Search inputs usually have placeholder text like 'Search', 'Find', 'Ask', or 'Query'. Pick the most prominent visible one.${siteHints ? "\n\n" + siteHints : ""}`;

    const elementsList = elements.map(e => {
      const sec = e.section ? ` (${e.section})` : "";
      const txt = e.text && e.text !== e.label ? `  · text: ${JSON.stringify(e.text.slice(0, 80))}` : "";
      return `  ${e.id}: [${e.kind}] ${e.label}${sec}${txt}`;
    }).join("\n");
    const recentList = recent.length ? `\nRecent actions: ${recent.slice(-6).join(" → ")}` : "";
    const screenLine = screen ? `\nPage: ${screen}` : "";
    const summary = viewportSummary ? `\nVisible content:\n${viewportSummary}` : "";
    const selLine = selectedText ? `\nSelected text: "${selectedText.slice(0, 500)}"` : "";

    // Only fetch Composio tools if the user has actually enabled apps — no latency for everyone else
    let composioBlock = "";
    if (H.settings?.composioKey && H.settings?.composioApps?.length > 0) {
      try {
        const cat = await new Promise(resolve =>
          chrome.runtime.sendMessage({ type: "helm:composio-catalog" }, resolve)
        );
        if (cat?.hasKey) {
          const connected = (cat.enabledApps || [])
            .map(id => cat.catalog?.find(a => a.id === id))
            .filter(app => app && cat.connections?.includes(app.id));
          const suggested = (cat.enabledApps || [])
            .map(id => cat.catalog?.find(a => a.id === id))
            .filter(app => app && !cat.connections?.includes(app.id));
          if (connected.length) {
            const lines = connected.flatMap(app => app.actions.map(a => {
              const ps = Object.entries(a.params).map(([k, v]) => `${k}: ${v}`).join(", ");
              return `  ${a.id}: ${a.desc}${ps ? ` (${ps})` : ""}`;
            })).join("\n");
            composioBlock += `\n\nComposio actions available — use { "type": "composio", "action": "ID", "params": {...} }:\n${lines}`;
          }
          if (suggested.length) {
            composioBlock += `\n\nNot yet connected (mention in 'speak' if relevant): ${suggested.map(a => a.name).join(", ")}. Example: "You can do that — connect ${suggested[0]?.name} in Helm Settings."`;
          }
        }
      } catch { /* composio unavailable — silent fallback */ }
    }

    const userText = `Command: "${command}"${screenLine}${selLine}${summary}\n\nAvailable elements (id : label):\n${elementsList}${recentList}${composioBlock}\n\nReturn JSON only.`;

    // Build message content — add screenshot when vision is enabled
    let userContent = userText;
    if (H.settings?.useVision) {
      try {
        const shot = await new Promise(resolve =>
          chrome.runtime.sendMessage({ type: "helm:screenshot" }, resolve)
        );
        if (shot?.ok && shot.dataUrl) {
          const base64 = shot.dataUrl.replace(/^data:image\/\w+;base64,/, "");
          userContent = [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: userText },
          ];
        }
      } catch { /* vision failed — fall back to text-only */ }
    }

    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage(
        { type: "helm:claude", system, userContent: Array.isArray(userContent) ? userContent : undefined, user: Array.isArray(userContent) ? undefined : userContent, model: H.settings?.model },
        resolve
      );
    });

    if (!resp?.ok) {
      const msg = resp?.error === "no_api_key"
        ? "Add your Anthropic API key in Helm options."
        : `Helm couldn't reach the model. ${resp?.message || ""}`;
      return { thought: "", speak: "", actions: [], clarify: msg };
    }
    const raw = resp.text || "";
    const cleaned = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return { thought: "", speak: "", actions: [], clarify: "" };
    try {
      const j = JSON.parse(cleaned.slice(start, end + 1));
      return {
        thought: String(j.thought || ""),
        speak:   String(j.speak || ""),
        actions: Array.isArray(j.actions) ? j.actions : [],
        clarify: String(j.clarify || ""),
      };
    } catch {
      return { thought: "", speak: "", actions: [], clarify: "" };
    }
  };

  /* ---------- Page summarization ---------- */
  H.summarizePage = async function () {
    const pageText = (document.body?.innerText || "").trim().replace(/\s+/g, " ").slice(0, 4000);
    if (!pageText) return "This page doesn't seem to have any readable text.";
    const system = `You are Helm, a voice assistant in a browser. Summarize what the user is viewing in 2–4 short sentences. Be direct and conversational — you're speaking aloud, not writing. No lists, no markdown.`;
    const user = `Page title: "${document.title}"\n\nPage content:\n${pageText}`;
    const resp = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: "helm:claude", system, user, model: H.settings?.model }, resolve)
    );
    if (!resp?.ok) return null;
    return (resp.text || "").trim().slice(0, 600);
  };

  /* ---------- Pattern memory ---------- */
  const MEM_KEY = "helm.memory.v1";
  H.loadMem = function () {
    try { return JSON.parse(localStorage.getItem(MEM_KEY)) || { actions: [], patterns: {} }; }
    catch { return { actions: [], patterns: {} }; }
  };
  H.saveMem = function (m) { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch {} };
  H.logAction = function (desc) {
    const m = H.loadMem();
    m.actions = [...(m.actions || []), { t: Date.now(), d: desc }].slice(-50);
    const recent = m.actions.slice(-12).map(a => a.d);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= recent.length; i++) {
        const key = recent.slice(i, i + n).join(" → ");
        m.patterns[key] = (m.patterns[key] || 0) + 1;
      }
    }
    H.saveMem(m);
  };
})();
