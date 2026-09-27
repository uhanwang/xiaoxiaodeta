// Promo screenshot driver: captures the pet window, the wardrobe tab and the
// onboarding wizard via CDP Page.captureScreenshot (full quality, ignores
// occlusion). Run after launching: npx electron . --remote-debugging-port=9223
const fs = require("node:fs");
const path = require("node:path");
const PORT = 9223;
const OUT = path.join(__dirname, "..", "_preserved", "promo");
fs.mkdirSync(OUT, { recursive: true });

async function json(pathname) {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res2, rej2) => {
        id += 1;
        pending.set(id, { res: res2, rej: rej2 });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      close: () => ws.close(),
    });
    ws.onerror = (event) => reject(new Error(`ws error: ${event.message || "failed"}`));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(message.error.message));
        else res(message.result);
      }
    };
  });
}

async function withPage(match, fn) {
  const targets = await json("/json/list");
  const page = targets.find((target) => target.type === "page" && match(target));
  if (!page) throw new Error(`no page matching ${match}`);
  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    return await fn(cdp, page);
  } finally {
    cdp.close();
  }
}

async function evalJs(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "page eval failed");
  return result.result?.value;
}

async function shot(cdp, name) {
  const data = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data.data, "base64"));
  console.log(`saved ${name}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch { /* retry */ }
    await sleep(800);
  }
  throw new Error(`timeout: ${label}`);
};

async function main() {
  await sleep(4000);

  // 1. Pet idle — let it settle, then screenshot (transparent background).
  await withPage(
    (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="),
    async (cdp) => {
      await waitFor(() => evalJs(cdp, `Boolean(document.querySelector(".pet-atlas-sprite"))`), 20000, "pet sprite");
      await sleep(1200);
      await shot(cdp, "shot-pet.png");
    },
  );

  // 2. Dashboard collection tab — wardrobe cards + closet.
  await withPage(
    (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="),
    async (cdp) => evalJs(cdp, `window.pet.openDashboard("collection")`),
  );
  await waitFor(() => json("/json/list").then((targets) => targets.some((target) => target.type === "page" && target.url.includes("window=dashboard"))), 20000, "dashboard");
  await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => {
      await waitFor(() => evalJs(cdp, `document.querySelectorAll(".wardrobe-card").length > 0`), 20000, "wardrobe cards");
      await sleep(1000);
      await shot(cdp, "shot-wardrobe.png");
    },
  );

  // 3. Dashboard home (hero card).
  await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => {
      await evalJs(cdp, `document.querySelector('[data-dashboard-tab="home"]')?.click()`);
      await sleep(900);
      await shot(cdp, "shot-home.png");
    },
  );

  // 4. Onboarding wizard welcome layer.
  await withPage(
    (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="),
    async (cdp) => evalJs(cdp, `window.pet.openOnboarding()`),
  );
  await waitFor(() => json("/json/list").then((targets) => targets.some((target) => target.type === "page" && target.url.includes("window=onboarding"))), 20000, "wizard");
  await withPage(
    (target) => target.type === "page" && target.url.includes("window=onboarding"),
    async (cdp) => {
      await waitFor(() => evalJs(cdp, `Boolean(document.querySelector(".onb-step h1"))`), 20000, "wizard body");
      await sleep(700);
      await shot(cdp, "shot-wizard.png");
      // Wizard strip-prompt layer for a richer shot.
      await evalJs(cdp, `document.querySelector(".onb-primary")?.click()`);
      await sleep(600);
      await evalJs(cdp, `document.querySelector(".onb-primary")?.click()`);
      await sleep(900);
      await shot(cdp, "shot-wizard-prompts.png");
    },
  );

  console.log("PROMO_SHOTS_DONE");
}

main().catch((error) => {
  console.error("PROMO_SHOTS_ERROR:", error.message);
  process.exit(2);
});
