import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist");

function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseSlides() {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const slides = [];
  let i = 0;
  const sectionRe = /<section[^>]*>([\s\S]*?)<\/section>/g;
  let m;

  while ((m = sectionRe.exec(html)) !== null) {
    const body = m[1];
    const cmd = (body.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || "";
    const out = (body.match(/<script[^>]*class="terminal-output"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || "";
    const notes = (body.match(/<aside[^>]*class="notes"[^>]*>([\s\S]*?)<\/aside>/) || [])[1] || "";

    slides.push({
      num: ++i,
      command: decodeHtmlEntities(cmd.trim()),
      output: out.trim(),
      notes: notes.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    });
  }

  return slides;
}

function buildIndexPage() {
  const slides = parseSlides();

  const rows = slides
    .map(
      (s) => `
    <div class="slide">
      <div class="slide-meta">
        <span class="num">${String(s.num).padStart(2, "0")}</span>
        <code class="cmd">${s.command}</code>
      </div>
      ${s.output ? `<pre class="output">${s.output}</pre>` : ""}
      ${s.notes ? `<p class="notes">${s.notes}</p>` : ""}
    </div>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slide Index — ICS 232</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { color-scheme: dark; }
    body {
      background: #0d1113;
      color: #d6fbff;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      padding: 48px 24px;
    }
    header {
      max-width: 780px;
      margin: 0 auto 40px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #41e8ef;
      border-bottom: 1px solid rgba(65,232,239,0.2);
      padding-bottom: 14px;
    }
    main { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
    .slide {
      border-left: 2px solid rgba(65,232,239,0.2);
      padding: 0 0 0 18px;
    }
    .slide-meta {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 8px;
    }
    .num {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: rgba(65,232,239,0.5);
      flex-shrink: 0;
    }
    .cmd {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      color: #41e8ef;
    }
    .output {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(214,251,255,0.65);
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      padding: 10px 14px;
      white-space: pre-wrap;
      margin-bottom: 10px;
    }
    .notes {
      font-size: 14px;
      color: rgba(214,251,255,0.75);
    }
  </style>
</head>
<body>
  <header>Networking Fundamentals — ICS 232 &nbsp;·&nbsp; ${slides.length} slides</header>
  <main>
${rows}
  </main>
  <script>
    window.addEventListener("keydown", (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== "f" && event.code !== "KeyF") return;

      event.preventDefault();
      event.stopPropagation();

      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      const action = fullscreenElement
        ? (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
        : (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)?.call(document.documentElement);

      Promise.resolve(action).catch(() => {});
    }, true);
  </script>
</body>
</html>`;
}

mkdirSync(resolve(DIST, "slides"), { recursive: true });
writeFileSync(resolve(DIST, "slides", "index.html"), buildIndexPage(), "utf8");
console.log("Generated dist/slides/index.html");
