// v1.8.0 audit driver: runs against an app instance launched with a FRESH
// PET_USER_DATA_DIR and --remote-debugging-port=9222. Exercises the outfit
// variant pipeline, wardrobe routing, closet slots and anchors end to end.
//   set PET_AUDIT_DIR=<fresh userData>
//   set PET_STRIPS_DIR=<dir with the 7 strip pngs>
//   node scripts/audit-v180.cjs
const fs = require("node:fs");
const path = require("node:path");
const PORT = 9222;

const AUDIT_DIR = process.env.PET_AUDIT_DIR;
const STRIPS_DIR = process.env.PET_STRIPS_DIR;
if (!AUDIT_DIR || !STRIPS_DIR) {
  console.error("AUDIT_ERROR: PET_AUDIT_DIR and PET_STRIPS_DIR are required");
  process.exit(2);
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(1500);
  }
  throw new Error(`timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

const findings = [];
function check(name, ok, detail = "") {
  findings.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function stripPayload() {
  const names = ["idle", "waving", "jumping", "failed", "waiting", "running", "review"];
  const payload = {};
  for (const name of names) {
    const file = path.join(STRIPS_DIR, `${name}.png`);
    if (!fs.existsSync(file)) throw new Error(`missing strip: ${file}`);
    payload[name] = file;
  }
  return payload;
}

async function main() {
  await sleep(4500);

  // 1. First run opens the wizard at the welcome layer.
  const welcome = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => evalJs(cdp, `document.querySelector(".onb-stepper li.current")?.textContent?.trim()`),
  ).catch(() => null);
  check("wizard auto-opens on fresh profile", /欢迎/.test(welcome || ""), `step: ${welcome}`);

  // 2. Switch the wizard into outfit mode (rose) via navigation.
  const nav = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp, page) => {
      const base = page.url.split("&outfit=")[0];
      await cdp.send("Page.navigate", { url: `${base}&outfit=rose` });
      await sleep(2500);
      return evalJs(cdp, `(() => ({
        title: document.querySelector(".onb-head strong")?.textContent,
        steps: document.querySelectorAll(".onb-stepper li").length,
        h1: document.querySelector(".onb-step h1")?.textContent,
        primary: document.querySelector(".onb-primary")?.textContent,
      }))()`);
    },
  );
  check("outfit mode strips the identity layer", nav.steps === 4, `steps: ${nav.steps}`);
  check("outfit mode names the theme", /樱花茶会/.test(nav.title || "") && /樱花茶会/.test(nav.h1 || ""), `title: ${nav.title}`);

  const outfitPrompts = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => {
      await evalJs(cdp, `document.querySelector(".onb-primary")?.click()`);
      await sleep(600);
      return evalJs(cdp, `(() => ({
        count: document.querySelectorAll(".prompt-box").length,
        first: document.querySelector(".prompt-box textarea")?.value?.slice(0, 120),
        heading: document.querySelector(".onb-step h2")?.textContent,
      }))()`);
    },
  );
  check("outfit prompts generated for all 7 strips", outfitPrompts.count === 7, `count: ${outfitPrompts.count}`);
  check("outfit prompts carry the theme and identity lock", /樱花茶会/.test(outfitPrompts.first || "") && /完全一致/.test(outfitPrompts.first || ""), (outfitPrompts.first || "").slice(0, 60));

  // 3. Run the outfit assembly through the real IPC pipeline.
  const strips = JSON.stringify(stripPayload());
  const started = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => evalJs(cdp, `window.pet.qpetAssemble(${strips}, { outfit: "rose" })`),
  );
  check("outfit assembly job starts", started?.ok === true, JSON.stringify(started));

  const variantFile = path.join(AUDIT_DIR, "custom-pet", "wardrobe", "rose.png");
  await waitFor(() => fs.existsSync(variantFile), 300000, "wardrobe variant file");
  check("outfit variant written to custom-pet/wardrobe", fs.statSync(variantFile).size > 10000, `${fs.statSync(variantFile).size} bytes`);
  check("outfit variant leaves the active look untouched", !fs.existsSync(path.join(AUDIT_DIR, "custom-pet", "pet-actions-installed.png")));

  // 4. Assembly opened the dashboard on the collection tab; the outfit is
  //    granted + equipped automatically.
  await waitFor(() => json("/json/list").then((targets) => targets.some((target) => target.type === "page" && target.url.includes("window=dashboard"))), 30000, "dashboard window");
  const saveState = await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => evalJs(cdp, `window.pet.loadSave().then((save) => ({
      owned: save.progression.collection.includes("outfit-rose"),
      outfit: save.progression.equipped.outfit,
    }))`),
  );
  check("generated outfit granted for free", saveState?.owned === true, JSON.stringify(saveState));
  check("generated outfit equipped automatically", saveState?.outfit === "rose", `outfit: ${saveState?.outfit}`);

  const roseCard = await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => waitFor(() => evalJs(cdp, `(() => {
      const cards = Array.from(document.querySelectorAll(".wardrobe-card"));
      const rose = cards.find((card) => card.textContent.includes("樱花茶会"));
      return rose ? { button: rose.querySelector("button")?.textContent, pending: rose.className.includes("pending") } : null;
    })()`), 30000, "wardrobe card"),
  );
  check("wardrobe card shows the outfit as worn", roseCard?.button === "已穿上" && !roseCard.pending, JSON.stringify(roseCard));

  // 5. Full active assembly: installs the atlas, writes anchors, saves a closet slot.
  await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => evalJs(cdp, `window.pet.qpetAssemble(${strips})`),
  );
  const activeAtlas = path.join(AUDIT_DIR, "custom-pet", "pet-actions-installed.png");
  await waitFor(() => fs.existsSync(activeAtlas), 300000, "active atlas install");
  await sleep(1500);
  check("active install writes the atlas", fs.statSync(activeAtlas).size > 10000, `${fs.statSync(activeAtlas).size} bytes`);
  check("active install writes anchors.json", fs.existsSync(path.join(AUDIT_DIR, "custom-pet", "anchors.json")));

  const closet = await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => evalJs(cdp, `window.pet.closetList().then((data) => ({ slots: data.slots.length, ids: data.slots.map((slot) => slot.id), variants: data.outfitVariants }))`),
  );
  check("closet auto-saved the installed pet", closet?.slots >= 1, JSON.stringify(closet));
  check("closet reports the generated outfit variant", Array.isArray(closet?.variants) && closet.variants.includes("rose"), JSON.stringify(closet?.variants));

  // 6. Wardrobe routing inside the pet window: variant wins, missing falls
  //    back to base, legacy sprite wardrobe art is blocked.
  const routing = await withPage(
    (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="),
    async (cdp) => evalJs(cdp, `Promise.all([
      fetch("./assets/wardrobe/rose/atlas/pet-actions-installed.webp").then((r) => r.status),
      fetch("./assets/wardrobe/sky/atlas/pet-actions-installed.webp").then((r) => r.status),
      fetch("./assets/wardrobe/rose/sprites/idle.png").then((r) => r.status),
    ]).then((statuses) => ({ variant: statuses[0], fallback: statuses[1], sprite: statuses[2] }))`),
  );
  check("wardrobe route serves the generated variant", routing?.variant === 200, JSON.stringify(routing));
  check("missing variant falls back to the base atlas", routing?.fallback === 200, JSON.stringify(routing));
  check("legacy per-sprite wardrobe art is blocked in custom mode", routing?.sprite === 404, JSON.stringify(routing));

  // 7. Pet window renders the custom atlas with the equipped wardrobe route.
  const petRender = await withPage(
    (target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="),
    async (cdp) => evalJs(cdp, `(() => {
      const sprite = document.querySelector(".pet-atlas-sprite");
      const style = sprite ? getComputedStyle(sprite).backgroundImage : "";
      return { bg: style, hasWardrobe: style.includes("wardrobe/rose/"), hasAtlas: style.includes("pet-actions-installed.webp") };
    })()`),
  );
  check("pet renders from the custom atlas", petRender?.hasAtlas === true, petRender?.bg?.slice(0, 90));
  check("pet renders the equipped outfit variant", petRender?.hasWardrobe === true, petRender?.bg?.slice(0, 90));

  // 8. Closet switch round-trip: manual save adds a slot, switching works,
  //    invalid ids fail safely.
  const closetAfterSave = await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => evalJs(cdp, `window.pet.closetSave().then((saved) => window.pet.closetList().then((data) => ({ saved: saved.ok, slots: data.slots.length, firstId: data.slots[0]?.id })))`),
  );
  check("manual closet save adds a slot", closetAfterSave?.saved === true && closetAfterSave?.slots >= 2, JSON.stringify({ slots: closetAfterSave?.slots }));

  const switchResult = await withPage(
    (target) => target.type === "page" && target.url.includes("window=dashboard"),
    async (cdp) => evalJs(cdp, `Promise.all([
      window.pet.closetSwitch(${JSON.stringify(closetAfterSave.firstId)}),
      window.pet.closetSwitch("bad-slot"),
    ]).then(([good, bad]) => ({ good: good.ok, bad: bad.ok }))`),
  );
  check("switching to a saved slot works", switchResult?.good === true, JSON.stringify(switchResult));
  check("switching to an invalid slot fails safely", switchResult?.bad === false, JSON.stringify(switchResult));

  console.log("AUDIT_DONE");
  console.log(JSON.stringify(findings, null, 1));
  const failed = findings.filter((item) => !item.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("AUDIT_ERROR:", error.message);
  process.exit(2);
});
