/* Helm content script — DOM helpers
 * Element discovery, page summary, cursor animation, action executor.
 */
(function () {
  const H = window.__helm;
  if (!H) return;

  const INTERACTIVE_SELECTOR = [
    "button", "a[href]",
    "input:not([type='hidden'])", "textarea", "select",
    "[role='button']", "[role='link']", "[role='tab']",
    "[role='checkbox']", "[role='switch']",
    "[role='menuitem']", "[role='option']",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
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
    if (text) return text.slice(0, 80);
    const role = el.getAttribute("role");
    return `[${(role || el.tagName).toLowerCase()}]`;
  }

  H.collectElements = function (root = document) {
    const seen = new Set();
    const items = [];
    const nodes = root.querySelectorAll(INTERACTIVE_SELECTOR);
    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (el.closest("[data-helm-overlay]")) continue;
      if (!isVisible(el)) continue;
      seen.add(el);
      const label = deriveLabel(el).slice(0, 120);
      const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140);
      items.push({
        id: items.length,
        label,
        section: sectionContext(el),
        kind: ((el.getAttribute("role") || el.tagName || "el") + "").toLowerCase(),
        text: text && text !== label ? text : "",
        el,
      });
    }
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

  H.glideTo = async function (el) {
    H.aiDriving = true;
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    await new Promise(res => setTimeout(res, 100));
    await H.animateTo(H.cursorPos.x, H.cursorPos.y, tx, ty, 480, (x, y) => {
      H.cursorPos.x = x; H.cursorPos.y = y;
      H.renderCursor?.();
    });
    H.aiDriving = false;
  };

  H.glideToAndClick = async function (el) {
    await H.glideTo(el);
    el.classList.add("helm-target");
    await new Promise(r => setTimeout(r, 160));
    el.click();
    await new Promise(r => setTimeout(r, 220));
    el.classList.remove("helm-target");
  };

  /* ---------- Action executor ---------- */
  H.executeAction = async function (action, elements) {
    const fresh = H.collectElements();
    const findEl = (id) => {
      const initial = elements[id];
      if (initial && document.body.contains(initial.el)) return initial.el;
      if (initial) { const m = fresh.find(e => e.label === initial.label); if (m) return m.el; }
      return fresh[id]?.el || null;
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
      await H.glideToAndClick(t);
      H.logAction(`click "${t.getAttribute("data-helm-label") || (t.innerText||"").slice(0,40)}"`);
      return;
    }
    if (action.type === "hover") {
      const t = findEl(action.id); if (!t) return;
      await H.glideTo(t);
      t.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      t.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      return;
    }
    if (action.type === "focus") {
      const t = findEl(action.id); if (!t) return;
      await H.glideTo(t);
      t.focus?.();
      t.classList.add("helm-target");
      setTimeout(() => t.classList.remove("helm-target"), 600);
      return;
    }
    if (action.type === "read") {
      const t = findEl(action.id); if (!t) return;
      await H.glideTo(t);
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
          setter?.call(el, action.text.slice(0, i));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise(r => setTimeout(r, 28));
        }
      } else if (el && el.isContentEditable) {
        for (const ch of action.text) {
          document.execCommand("insertText", false, ch);
          await new Promise(r => setTimeout(r, 28));
        }
      }
      return;
    }
  };
})();
