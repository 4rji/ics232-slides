import Reveal from "reveal.js";
import Notes from "reveal.js/plugin/notes/notes.esm.js";
import "reveal.js/dist/reveal.css";
import "reveal.js/dist/theme/black.css";
import "./styles.css";

const params = new URLSearchParams(location.search);
const isReceiver = params.has("receiver");
const isAdmin = !isReceiver && (location.pathname === "/cyber404" || params.has("cyber404"));

const deck = new Reveal({
  hash: false,
  keyboard: false,
  controls: false,
  progress: false,
  slideNumber: false,
  touch: isAdmin,
  transition: "fade",
  plugins: [Notes]
});

const TYPE_SPEED = 28;
const OUTPUT_SPEED = 5;
let applyingRemoteSlide = false;
let syncReady = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (isAdmin && location.hash) {
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

async function typeText(target, text, speed) {
  for (const char of text) {
    target.textContent += char;
    await wait(char === "\n" ? speed * 3 : speed);
  }
}

async function runTerminal(section) {
  const terminal = section.querySelector(".terminal-run");
  if (!terminal) return;

  const command = terminal.dataset.command || "";
  const output = terminal.querySelector(".terminal-output")?.textContent.trim() || "";
  const media = terminal.querySelector(".terminal-media");

  terminal.querySelectorAll(".terminal-line, .terminal-cursor, .terminal-output-line").forEach((node) => node.remove());
  terminal.classList.remove("terminal-complete");
  if (media) media.classList.remove("is-visible");

  const line = document.createElement("div");
  line.className = "terminal-line";

  const prompt = document.createElement("span");
  prompt.className = "prompt";
  prompt.textContent = "net@ics232:~$ ";

  const commandNode = document.createElement("span");
  commandNode.className = "terminal-command";

  const cursor = document.createElement("span");
  cursor.className = "terminal-cursor";

  line.append(prompt, commandNode, cursor);
  terminal.prepend(line);

  await wait(260);
  await typeText(commandNode, command, TYPE_SPEED);
  await wait(240);

  if (output) {
    const outputNode = document.createElement("pre");
    outputNode.className = "terminal-output-line";
    const outputText = document.createElement("span");
    line.after(outputNode);
    outputNode.append(outputText, cursor);

    await typeText(outputText, `\n${output}`, OUTPUT_SPEED);
  }

  if (media) {
    await wait(180);
    media.classList.add("is-visible");
  }

  terminal.classList.add("terminal-complete");
}

function currentState() {
  const indices = deck.getIndices();
  return {
    indexh: indices.h,
    indexv: indices.v
  };
}

function goToSyncedSlide(state) {
  if (!Number.isInteger(state.indexh) || !Number.isInteger(state.indexv)) return;

  const { indexh, indexv } = currentState();
  if (indexh === state.indexh && indexv === state.indexv) return;

  applyingRemoteSlide = true;
  deck.slide(state.indexh, state.indexv);
  queueMicrotask(() => {
    applyingRemoteSlide = false;
  });
}

async function publishSlide() {
  if (!isAdmin || !syncReady || applyingRemoteSlide) return;

  try {
    await fetch("/presentation-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(currentState())
    });
  } catch {
    // The deck still works as a normal local presentation if sync is unavailable.
  }
}

async function startSync() {
  if (isReceiver) return;

  if (isAdmin) {
    syncReady = true;
    deck.slide(0, 0);
    await publishSlide();
  } else {
    try {
      const response = await fetch("/presentation-state");
      if (response.ok) {
        goToSyncedSlide(await response.json());
      }
    } catch {
      return;
    }

    syncReady = true;
  }

  const events = new EventSource("/presentation-events");
  events.onmessage = (event) => {
    try {
      goToSyncedSlide(JSON.parse(event.data));
    } catch {
      // Ignore malformed sync events and keep the presentation usable.
    }
  };
}

function toggleIndex() {
  const existing = document.getElementById("slide-index-overlay");
  if (existing) {
    existing.remove();
    return;
  }

  const slides = Array.from(document.querySelectorAll(".reveal .slides > section"));
  const currentH = deck.getIndices().h;

  const overlay = document.createElement("div");
  overlay.id = "slide-index-overlay";

  const panel = document.createElement("div");
  panel.className = "slide-index-panel";

  const header = document.createElement("div");
  header.className = "slide-index-header";
  header.textContent = "— slide index —";
  panel.appendChild(header);

  const list = document.createElement("div");
  list.className = "slide-index-list";

  slides.forEach((slide, i) => {
    const title = slide.querySelector(".terminal-bar strong")?.textContent?.trim() || `slide ${i + 1}`;
    const rawNote = slide.querySelector(".notes")?.textContent?.trim() || "";
    const note = rawNote.replace(/\s+/g, " ").substring(0, 90);

    const item = document.createElement("div");
    item.className = "slide-index-item" + (i === currentH ? " is-current" : "");

    const num = document.createElement("span");
    num.className = "slide-index-num";
    num.textContent = String(i + 1).padStart(2, "0");

    const info = document.createElement("div");
    info.className = "slide-index-info";

    const titleEl = document.createElement("div");
    titleEl.className = "slide-index-title";
    titleEl.textContent = title;
    info.appendChild(titleEl);

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "slide-index-note";
      noteEl.textContent = note + (rawNote.length > 90 ? "…" : "");
      info.appendChild(noteEl);
    }

    item.append(num, info);
    item.addEventListener("click", () => {
      deck.slide(i, 0);
      overlay.remove();
    });
    list.appendChild(item);
  });

  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const current = list.querySelector(".is-current");
  if (current) current.scrollIntoView({ block: "center" });
}

function installKeyboardShortcuts() {
  if (!isAdmin) return;

  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      toggleIndex();
      return;
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      deck.getPlugin("notes")?.open();
      return;
    }

    if (event.key === "Escape") {
      const idx = document.getElementById("slide-index-overlay");
      if (idx) { idx.remove(); return; }
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown" || event.key === " " || event.key === "Enter") {
      event.preventDefault();
      deck.next();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      deck.prev();
    }
  });
}

deck.on("ready", (event) => {
  runTerminal(event.currentSlide);
  installKeyboardShortcuts();
  startSync();
});
deck.on("slidechanged", (event) => {
  runTerminal(event.currentSlide);
  publishSlide();
});

deck.initialize();
