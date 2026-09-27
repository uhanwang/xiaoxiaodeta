// Follow-up capture: assemble the genuinely recolored MOON outfit variant
// (violet strips) through the real pipeline via the dashboard IPC, wait for
// the variant file, then capture the wardrobe card in its equipped state.
// Green strips are NOT touched here — the base look stays the adventurer.
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const PORT = 9223;
const OUT = path.join(__dirname, "..", "_preserved", "promo");
const MOON_STRIPS_DIR = process.env.PET_MOON_STRIPS_DIR || path.join(__dirname, "..", "_preserved", "external-assets", "strips-moon");
const AUDIT_DIR = process.env.PET_USER_DATA_DIR || path.join(process.env.TEMP || ".", "qpet-promo-flow");
const CAPTURE_PS1 = path.join(__dirname, "..", "_preserved", "capture-window-by-title.ps1");
const LOG = path.join(OUT, "flow-debug.log");
fs.mkdirSync(OUT, { recursive: true });

function log(message) {
  fs.appendFileSync(LOG, `${new Date().toISOString().slice(11, 23)} ${message}\n`);
  console.log(message);
}

async function json(pathname) {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => reject(new Error("ws connect timeout")), 10000);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        send: (method, params = {}) => new Promise((res2, rej2) => {
          const sendTimer = setTimeout(() => rej2(new Error(`cdp ${method} timeout`)), 30000);
          id += 1;
          pending.set(id, { res: res2, rej: rej2, timer: sendTimer });
          ws.send(JSON.stringify({ id, method, params }));
        }),
        close: () => ws.close(),
      });
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("ws error")); };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej, timer: pendingTimer } = pending.get(message.id);
        clearTimeout(pendingTimer);
        pending.delete(message.id);
        if (message.error) rej(new Error(message.error.message));
        else res(message.result);
      }
    };
  });
}

async function withPage(match, label, fn) {
  const targets = await json("/json/list");
  const page = targets.find((target) => target.type === "page" && match(target));
  if (!page) throw new Error(`no page for ${label}; pages: ${targets.map((t) => t.url).join(" | ")}`);
  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    return await fn(cdp, page);
  } finally {
    cdp.close();
  }
}

async function evalJs(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.exception?.description || result.exceptionDetails.exception?.description || "page eval failed");
  return result.result?.value;
}

// Screenshot by window title via PrintWindow — compositor-independent.
function shot(windowKind, name) {
  const titles = { dashboard: "陪伴面板", wizard: "形象向导", "outfit-wizard": "换装" };
  const attempt = () => new Promise((resolve, reject) => {
    execFile("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CAPTURE_PS1,
      "-TitlePart", titles[windowKind], "-OutFile", path.join(OUT, name),
    ], { timeout: 45000 }, (error, stdout) => {
      if (error) return reject(new Error(`printwindow ${name}: ${String(stdout).trim() || error.message}`));
      log(`saved ${name} (${String(stdout).trim().split(/\r?\n/)[0]})`);
      resolve();
    });
  });
  return (async () => {
    let lastError = null;
    for (let tries = 0; tries < 5; tries += 1) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = error;
        await sleep(1500);
      }
    }
    throw lastError;
  })();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try { const value = await predicate(); if (value) return value; } catch (error) { last = error; }
    await sleep(900);
  }
  throw new Error(`timeout: ${label}${last ? ` (${last.message})` : ""}`);
};

const DASHBOARD_PAGE = (target) => target.type === "page" && target.url.includes("window=dashboard");
const STRIP_ORDER = ["idle", "waving", "jumping", "failed", "waiting", "running", "review"];

async function main() {
  if (!fs.existsSync(MOON_STRIPS_DIR)) throw new Error(`moon strips dir missing: ${MOON_STRIPS_DIR}`);
  const stripPayload = {};
  for (const name of STRIP_ORDER) stripPayload[name] = path.join(MOON_STRIPS_DIR, `${name}.png`);

  log("moon outfit: start assembly via dashboard IPC");
  await withPage(DASHBOARD_PAGE, "dashboard", async (cdp) => {
    await waitFor(() => evalJs(cdp, `Boolean(window.pet)`), 20000, "preload ready");
    const started = await evalJs(cdp, `window.pet.qpetAssemble(${JSON.stringify(stripPayload)}, { outfit: "moon" }).then((r) => ({ ok: r.ok, error: r.error || null })).catch((e) => ({ ok: false, error: String(e) }))`);
    log(`assemble accepted: ${JSON.stringify(started)}`);
    if (!started?.ok) throw new Error(`assemble rejected: ${started?.error}`);
  });

  const moonFile = path.join(AUDIT_DIR, "custom-pet", "wardrobe", "moon.png");
  await waitFor(() => fs.existsSync(moonFile) && fs.statSync(moonFile).size > 10000, 420000, "moon variant file");
  log("moon variant installed (grant + equip happen in main)");

  // Main grants, equips, lands the dashboard on collection and reloads —
  // give it a moment, then verify the card state and capture.
  await sleep(5000);
  await withPage(DASHBOARD_PAGE, "dashboard", async (cdp) => {
    await waitFor(() => evalJs(cdp, `Array.from(document.querySelectorAll(".wardrobe-card")).some((card) => card.textContent.includes("月光庆典") && card.className.includes("equipped"))`), 30000, "moon equipped card");
    await evalJs(cdp, `Array.from(document.querySelectorAll(".wardrobe-card")).find((card) => card.textContent.includes("月光庆典"))?.scrollIntoView({ block: "center" })`);
    await sleep(900);
    await shot("dashboard", "flow-10-outfit-equipped.png");
  });
  log("FOLLOW_UP_DONE");
}

main().then(() => log("followup done")).catch((error) => {
  log(`FOLLOW_UP_ERROR: ${error.message}`);
  process.exitCode = 2;
});
