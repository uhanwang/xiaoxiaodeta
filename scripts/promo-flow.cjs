// Full-flow promo capture. Control flow runs through CDP (clicks, evals, file
// uploads); screenshots use Win32 PrintWindow via capture-window-by-title.ps1
// because CDP captureScreenshot depends on the DWM compositor and hangs when
// the machine's windows are occluded. Pet close-ups are cropped from the atlas
// files themselves at compose time (identical pixels, real transparency).
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const PORT = 9223;
const OUT = path.join(__dirname, "..", "_preserved", "promo");
const STRIPS_DIR = process.env.PET_STRIPS_DIR || path.join(__dirname, "..", "_preserved", "external-assets", "strips");
const CAPTURE_PS1 = path.join(__dirname, "..", "_preserved", "capture-window-by-title.ps1");
const LOG = path.join(OUT, "flow-debug.log");
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(LOG, `--- flow capture ${new Date().toISOString()} strips=${STRIPS_DIR} userData=${process.env.PET_USER_DATA_DIR || "?"}\n`);

function log(message) {
  fs.appendFileSync(LOG, `${new Date().toISOString().slice(11, 23)} ${message}\n`);
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
// Retries cover the window-show race (the page renders before the window is
// marked visible on Win32).
function shot(windowKind, name) {
  const titles = { pet: "桌面宠物", dashboard: "陪伴面板", wizard: "形象向导", "outfit-wizard": "换装" };
  const attempt = () => new Promise((resolve, reject) => {
    execFile("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", CAPTURE_PS1,
      "-TitlePart", titles[windowKind], "-OutFile", path.join(OUT, name),
    ], { timeout: 45000 }, (error, stdout) => {
      if (error) return reject(new Error(`printwindow ${name}: ${stdout || error.message}`));
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

const PET_PAGE = (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window=");
const WIZARD_PAGE = (target) => target.type === "page" && target.url.includes("window=onboarding");
const DASHBOARD_PAGE = (target) => target.type === "page" && target.url.includes("window=dashboard");

const STRIP_ORDER = ["idle", "waving", "jumping", "failed", "waiting", "running", "review"];

async function main() {
  log("start; waiting 4.5s for app settle");
  await sleep(4500);

  log("step 1: wizard welcome");
  await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await waitFor(() => evalJs(cdp, `Boolean(document.querySelector(".onb-step h1"))`), 20000, "wizard welcome");
    await sleep(600);
    await shot("wizard", "flow-1-welcome.png");
  });

  log("step 2: identity layer");
  await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await evalJs(cdp, `document.querySelector(".onb-primary").click()`);
    await sleep(700);
    await shot("wizard", "flow-2-identity.png");
  });

  log("step 3: strip prompt layer");
  await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await evalJs(cdp, `document.querySelector(".onb-primary").click()`);
    await sleep(900);
    await shot("wizard", "flow-3-strips.png");
  });

  log("step 4: upload layer + real files");
  const uploaded = await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await evalJs(cdp, `document.querySelector(".onb-primary").click()`);
    await sleep(700);
    const doc = await cdp.send("DOM.getDocument", { depth: 3 });
    const nodes = await cdp.send("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: ".guide-upload-row input[type=file]" });
    if (nodes.nodeIds.length !== 7) throw new Error(`expected 7 file inputs, found ${nodes.nodeIds.length}`);
    for (let index = 0; index < 7; index += 1) {
      await cdp.send("DOM.setFileInputFiles", {
        files: [path.join(STRIPS_DIR, `${STRIP_ORDER[index]}.png`)],
        nodeId: nodes.nodeIds[index],
      });
      await sleep(220);
    }
    const filled = await evalJs(cdp, `document.querySelectorAll(".guide-upload-thumb img").length`);
    await sleep(700);
    await shot("wizard", "flow-4-upload.png");
    return filled;
  });
  log(`upload thumbnails filled: ${uploaded}`);

  log("step 5: start assembly + progress shot (scrolled to feedback)");
  await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await evalJs(cdp, `Array.from(document.querySelectorAll(".onb-primary")).find((b) => !b.disabled)?.click()`);
    await sleep(2000);
    await evalJs(cdp, `document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight`);
    await sleep(600);
    await shot("wizard", "flow-5-assembling.png");
  });

  log("step 6: wait for install + auto-opened dashboard");
  const atlasFile = path.join(process.env.PET_USER_DATA_DIR || "", "custom-pet", "pet-actions-installed.png");
  await waitFor(() => fs.existsSync(atlasFile) && fs.statSync(atlasFile).size > 10000, 420000, "atlas install");
  log("atlas installed");
  await waitFor(() => json("/json/list").then((targets) => targets.some(DASHBOARD_PAGE)), 40000, "dashboard");
  await sleep(5000);
  await withPage(DASHBOARD_PAGE, "dashboard", async (cdp) => {
    await waitFor(() => evalJs(cdp, `Boolean(document.querySelector(".hero-card"))`), 30000, "hero card");
    await sleep(800);
    await shot("dashboard", "flow-7-hero-transformed.png");
  });

  log("step 7: closet + wardrobe");
  await withPage(DASHBOARD_PAGE, "dashboard", async (cdp) => {
    await evalJs(cdp, `document.querySelector('[data-dashboard-tab="collection"]')?.click()`);
    await waitFor(() => evalJs(cdp, `document.querySelectorAll(".wardrobe-card").length > 0 && Boolean(document.querySelector(".closet-block"))`), 20000, "closet + wardrobe");
    await sleep(900);
    await shot("dashboard", "flow-8-closet-wardrobe.png");
  });

  log("step 8: outfit wizard entry");
  await withPage(DASHBOARD_PAGE, "dashboard", async (cdp) => {
    await evalJs(cdp, `window.pet.openOnboarding("rose")`);
  });
  await waitFor(() => json("/json/list").then((targets) => targets.some(WIZARD_PAGE)), 20000, "outfit wizard");
  await withPage(WIZARD_PAGE, "wizard", async (cdp) => {
    await waitFor(() => evalJs(cdp, `/樱花茶会/.test(document.querySelector(".onb-step h1")?.textContent || "")`), 20000, "outfit wizard body");
    await sleep(600);
    // Outfit mode retitles the window to 「…樱花茶会换装」, so the needle differs.
    await shot("outfit-wizard", "flow-9-outfit-wizard.png");
    await evalJs(cdp, `window.pet.completeOnboarding({ close: true })`);
  });

  log("FLOW_CAPTURE_DONE");
}

main().then(() => log("done")).catch((error) => {
  log(`FLOW_CAPTURE_ERROR: ${error.message}`);
  process.exitCode = 2;
});
