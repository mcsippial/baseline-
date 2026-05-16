/* Helm content script — DOM helpers
 * Element discovery, page summary, cursor animation, action executor.
 */
(function () {
  const H = window.__helm;
  if (!H) return;

  const INTERACTIVE_SELECTOR = [
    "a",                               // all anchors — catches SPA/React Router links without href
    "button",
    "input:not([type='hidden'])", "textarea", "select",
    "[role='button']", "[role='link']", "[role='tab']",
    "[role='checkbox']", "[role='switch']",
    "[role='menuitem']", "[role='option']",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
    "summary",
    "[data-helm-label]",
  ].join(",");

  function isVisible(el) {
    if (!el?.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    if (r.right  < 0 || r.left > window.innerWidth)  return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.05) return false;
    return true;
  }

  function sectionContext(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.getAttribute?.("role")) return cur.getAttribute("role");
      if (/^(NAV|MAIN|ASIDE|HEADER|FOOTER|SECTION|ARTICLE|DIALOG|FORM)$/.test(cur.tagName)) {
        return cur.tagName.toLowerCase();
      }
      cur = cur.parentElement;
    }
    return "";
  }

  function deriveLabel(el) {
    const explicit = el.getAttribute("data-helm-label");
    if (explicit) return explicit;
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const aliased = el.getAttribute("aria-labelledby");
    if (aliased) {
      const ref = document.getElementById(aliased);
      if (ref?.innerText) return ref.innerText.trim().slice(0, 80);
    }
    const title = el.getAttribute("title");
    if (title) return title;
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return `${el.tagName.toLowerCase()} "${placeholder}"`;
    const alt = el.getAttribute("alt");
    if (alt) return alt;
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
    const href = el.getAttribute("href");
    if (text && href) {
      try {
        const dest = new URL(href, location.href);
        const suffix = dest.origin !== location.origin ? ` → ${dest.hostname}` : ` → ${dest.pathname}`;
        return text.slice(0, 70) + suffix;
      } catch { /* relative or invalid href, fall through */ }
    }
    if (text) return text.slice(0, 80);
    if (href) return `link → ${href.slice(0, 60)}`;
    const role = el.getAttribute("role");
    return `[${(role || el.tagName).toLowerCase()}]`;
  }

  H.collectElements = function (root = document) {
    const seen = new Set();
    const items = [];

    function collectFrom(doc, frameOffsetX, frameOffsetY) {
      const nodes = doc.querySelectorAll(INTERACTIVE_SELECTOR);
      for (const el of nodes) {
        if (seen.has(el)) continue;
        if (el.closest("[data-helm-overlay]")) continue;
        if (!isVisible(el)) continue;
        seen.add(el);
        const label = deriveLabel(el).slice(0, 120);
        const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140);
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") || "";
        const kind = tag === "a" ? "link" : (role || tag || "el");
        items.push({
          id: items.length,
          label,
          section: sectionContext(el),
          kind,
          text: text && text !== label ? text : "",
          el,
          _frameOffsetX: frameOffsetX,
          _frameOffsetY: frameOffsetY,
        });
      }

      // Collect from same-origin iframes
      const frames = doc.querySelectorAll("iframe");
      for (const frame of frames) {
        try {
          const fdoc = frame.contentDocument;
          if (!fdoc) continue;
          const fr = frame.getBoundingClientRect();
          collectFrom(fdoc, frameOffsetX + fr.left, frameOffsetY + fr.top);
        } catch { /* cross-origin — skip */ }
      }
    }

    collectFrom(root, 0, 0);
    return items;
  };

  H.summarizeViewport = function () {
    const out = [];
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .filter(isVisible).slice(0, 10)
      .map(h => `${h.tagName}: "${h.innerText.trim().slice(0, 80)}"`);
    if (headings.length) out.push("Headings:\n  " + headings.join("\n  "));

    const selected = Array.from(document.querySelectorAll(
      ".is-sel, .is-active, [aria-selected='true'], [aria-current='page']"
    )).filter(isVisible).slice(0, 6)
      .map(s => `"${(s.innerText || "").trim().slice(0, 80)}"`);
    if (selected.length) out.push("Currently selected/active: " + selected.join(", "));

    const listItems = Array.from(document.querySelectorAll(
      "li, [role='listitem'], [role='option'], [role='row']"
    )).filter(isVisible).slice(0, 14);
    if (listItems.length) {
      out.push("Visible list items:");
      listItems.forEach((li, i) => {
        const t = (li.innerText || "").trim().replace(/\s+/g, " ").slice(0, 100);
        if (t) out.push(`  ${i+1}. ${t}`);
      });
    }
    return out.join("\n");
  };

  H.getScreenLabel = function () { return (document.title || "").trim(); };

  /* ---------- Cursor animation ---------- */
  H.animateTo = function (fromX, fromY, toX, toY, ms, onTick) {
    return new Promise(resolve => {
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / ms);
        const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        onTick(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e, t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  };

  H.glideTo = async function (el, frameOffsetX = 0, frameOffsetY = 0) {
    H.aiDriving = true;
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2 + frameOffsetX;
    const ty = r.top + r.height / 2 + frameOffsetY;
    await new Promise(res => setTimeout(res, 100));
    await H.animateTo(H.cursorPos.x, H.cursorPos.y, tx, ty, 480, (x, y) => {
      H.cursorPos.x = x; H.cursorPos.y = y;
      H.renderCursor?.();
    });
    H.aiDriving = false;
  };

  H.glideToAndClick = async function (el, frameOffsetX = 0, frameOffsetY = 0) {
    await H.glideTo(el, frameOffsetX, frameOffsetY);
    el.classList.add("helm-target");
    await new Promise(r => setTimeout(r, 160));
    el.click();
    await new Promise(r => setTimeout(r, 220));
    el.classList.remove("helm-target");
  };

  /* ---------- Action executor ---------- */
  H.executeAction = async function (action, elements) {
    const fresh = H.collectElements();
    const findItem = (id) => {
      const initial = elements[id];
      if (initial && document.body.contains(initial.el)) return initial;
      if (initial) { const m = fresh.find(e => e.label === initial.label); if (m) return m; }
      return fresh[id] || null;
    };
    const findEl = (id) => findItem(id)?.el || null;
    const frameOffsets = (id) => {
      const item = findItem(id);
      return [item?._frameOffsetX || 0, item?._frameOffsetY || 0];
    };

    if (action.type === "wait") {
      await new Promise(r => setTimeout(r, Math.max(0, Math.min(3000, action.ms || 300))));
      return;
    }
    if (action.type === "speak" && action.text) {
      H.showSaid?.(action.text);
      if (H.settings?.voiceReplies) await H.speak(action.text);
      return;
    }
    if (action.type === "click") {
      const t = findEl(action.id); if (!t) return;
      const [ox, oy] = frameOffsets(action.id);
      await H.glideToAndClick(t, ox, oy);
      H.logAction(`click "${t.getAttribute("data-helm-label") || (t.innerText||"").slice(0,40)}"`);
      return;
    }
    if (action.type === "hover") {
      const t = findEl(action.id); if (!t) return;
      const [ox, oy] = frameOffsets(action.id);
      await H.glideTo(t, ox, oy);
      t.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      t.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      return;
    }
    if (action.type === "focus") {
      const t = findEl(action.id); if (!t) return;
      const [ox, oy] = frameOffsets(action.id);
      await H.glideTo(t, ox, oy);
      t.focus?.();
      t.classList.add("helm-target");
      setTimeout(() => t.classList.remove("helm-target"), 600);
      return;
    }
    if (action.type === "read") {
      const t = findEl(action.id); if (!t) return;
      const [ox, oy] = frameOffsets(action.id);
      await H.glideTo(t, ox, oy);
      t.classList.add("helm-target");
      let txt = (t.innerText || t.textContent || "").trim().replace(/\s+/g, " ");
      txt = txt.replace(/[★☆⌫×‹›↻⊞◐◷▤⋯◀▶•◦►◇◆●○]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
      await H.speak(txt);
      t.classList.remove("helm-target");
      return;
    }
    if (action.type === "key") {
      const key = action.key || "Enter";
      let t = typeof action.id === "number" ? findEl(action.id) : document.activeElement;
      if (t && t !== document.activeElement) { await H.glideTo(t); t.focus?.(); }
      const target = t || document.activeElement || document.body;
      const opts = { key, code: key, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent("keydown", opts));
      target.dispatchEvent(new KeyboardEvent("keyup",   opts));
      return;
    }
    if (action.type === "scroll") {
      const dir = action.direction || "down";
      const amount = action.amount || 400;
      let scroller = null;
      if (typeof action.id === "number") {
        let cur = findEl(action.id);
        while (cur && cur !== document.body) {
          const s = getComputedStyle(cur);
          if ((s.overflowY === "auto" || s.overflowY === "scroll") && cur.scrollHeight > cur.clientHeight) {
            scroller = cur; break;
          }
          cur = cur.parentElement;
        }
      }
      if (!scroller) scroller = document.scrollingElement || document.body;
      if (dir === "top")    scroller.scrollTo({ top: 0, behavior: "smooth" });
      else if (dir === "bottom") scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      else if (dir === "up")     scroller.scrollBy({ top: -amount, behavior: "smooth" });
      else                        scroller.scrollBy({ top:  amount, behavior: "smooth" });
      return;
    }
    if (action.type === "type" && action.text) {
      if (typeof action.id === "number") {
        const t = findEl(action.id);
        if (t) { await H.glideTo(t); t.focus?.(); }
      }
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        for (let i = 1; i <= action.text.length; i++) {
          const ch = action.text[i - 1];
          setter?.call(el, action.text.slice(0, i));
          el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
          await new Promise(r => setTimeout(r, 28));
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el && el.isContentEditable) {
        // Try execCommand first (works in most Chromium-based editors)
        const inserted = document.execCommand("insertText", false, action.text);
        if (!inserted) {
          // Fallback: manual range insertion for editors that block execCommand
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(action.text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
  };

  /* ---------- Risky action classifier ---------- */
  const RISKY_RE = /\b(delete|remove|unsubscribe|buy(\s+now)?|purchase|pay(\s+now)?|check\s*out|place\s+order|complete\s+(purchase|order)|sign\s+out|log\s+out|log\s+me\s+out|deactivate|terminate|revoke|close\s+account|cancel\s+(account|subscription|plan|membership))\b/i;

  H.isRisky = function (el) {
    const text  = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const aria  = el.getAttribute("aria-label") || "";
    const title = el.getAttribute("title") || "";
    const attrs = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("data-action")]
      .filter(Boolean).join(" ");
    const haystack = [text, aria, title, attrs].join(" ");
    if (!RISKY_RE.test(haystack)) return null;
    return (aria || title || text || "this").slice(0, 60);
  };
})();
