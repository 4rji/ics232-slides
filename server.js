import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createServer as createViteServer } from "vite";

const HOST = "0.0.0.0";
const PREVIEW = process.argv.includes("--preview");
const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist");
const STATE_FILE = resolve(ROOT, process.env.PRESENTATION_STATE_FILE || ".presentation-state.json");

function getPort() {
  const portFlagIndex = process.argv.indexOf("--port");
  const portValue = portFlagIndex === -1 ? process.env.PORT : process.argv[portFlagIndex + 1];
  const port = Number(portValue || 5173);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${portValue}`);
    process.exit(1);
  }

  return port;
}

const PORT = getPort();

const DEFAULT_STATE = { indexh: 0, indexv: 0 };

function validState(value) {
  return value
    && Number.isInteger(value.indexh)
    && value.indexh >= 0
    && Number.isInteger(value.indexv)
    && value.indexv >= 0;
}

function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return { ...DEFAULT_STATE };

    const savedState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return validState(savedState)
      ? { indexh: savedState.indexh, indexv: savedState.indexv }
      : { ...DEFAULT_STATE };
  } catch (error) {
    console.warn(`Could not restore presentation state from ${STATE_FILE}: ${error.message}`);
    return { ...DEFAULT_STATE };
  }
}

function persistState(nextState) {
  const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`;

  try {
    writeFileSync(temporaryFile, `${JSON.stringify(nextState)}\n`, "utf8");
    renameSync(temporaryFile, STATE_FILE);
  } catch (error) {
    console.warn(`Could not persist presentation state to ${STATE_FILE}: ${error.message}`);
  }
}

let state = loadState();
const clients = new Set();

const mimeTypes = {
  ".css": "text/css",
  ".eot": "application/vnd.ms-fontobject",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function send(client, payload) {
  client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(payload) {
  for (const client of clients) send(client, payload);
}

function readJson(request) {
  return new Promise((resolveJson, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolveJson(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleSync(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/presentation-state") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(state));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/presentation-events") {
    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    response.write("\n");
    clients.add(response);
    send(response, state);

    request.on("close", () => {
      clients.delete(response);
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/presentation-state") {
    try {
      const body = await readJson(request);
      const indexh = Number(body.indexh);
      const indexv = Number(body.indexv);

      if (validState({ indexh, indexv })) {
        state = { indexh, indexv };
        persistState(state);
        broadcast(state);
        response.writeHead(204);
        response.end();
        return true;
      }
    } catch {
      response.writeHead(400);
      response.end();
      return true;
    }

    response.writeHead(422);
    response.end();
    return true;
  }

  return false;
}

function previewFilePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const requested = normalize(pathname === "/" ? "/index.html" : pathname);
  const candidate = resolve(DIST, `.${sep}${requested}`);

  if (!candidate.startsWith(DIST)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  return join(DIST, "index.html");
}

function servePreview(request, response) {
  const filePath = previewFilePath(request.url);

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
  createReadStream(filePath).pipe(response);
}

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

function serveIndexPage(response) {
  try {
    const html = buildIndexPage();
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
  } catch (err) {
    response.writeHead(500);
    response.end(String(err));
  }
}

function printUrls() {
  console.log(`\nPresentation server ready`);
  console.log(`  Control: http://localhost:${PORT}/cyber404`);
  console.log(`  Viewer:  http://localhost:${PORT}/`);
  console.log(`  Index:   http://localhost:${PORT}/index`);
  console.log(`  Network: use this computer's LAN IP, for example http://<your-ip>:${PORT}/cyber404 and http://<your-ip>:${PORT}/\n`);
}

async function start() {
  let vite = null;

  const server = createServer(async (request, response) => {
    if (await handleSync(request, response)) return;

    const pathname = new URL(request.url, "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/index") {
      serveIndexPage(response);
      return;
    }

    if (vite) {
      vite.middlewares(request, response);
      return;
    }

    servePreview(request, response);
  });

  if (!PREVIEW) {
    vite = await createViteServer({
      appType: "spa",
      server: {
        allowedHosts: true,
        hmr: {
          server
        },
        middlewareMode: true,
        watch: {
          ignored: [STATE_FILE, `${STATE_FILE}.*.tmp`]
        }
      }
    });
  }

  server.listen(PORT, HOST, printUrls);
}

start();
