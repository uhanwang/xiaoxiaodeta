// Audit driver: connects to the app's remote-debugging port and clicks
// through the onboarding wizard like a user. Run: node scripts/audit-wizard.cjs
const fs = require("node:fs");
const path = require("node:path");
const PORT = 9222;

async function json(path) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
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

const findings = [];
function check(name, ok, detail = "") {
  findings.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await sleep(4000);

  // 1. Wizard auto-opens on first run.
  let wizardStep = null;
  try {
    wizardStep = await withPage(
      (target) => target.url.includes("window=onboarding"),
      async (cdp) => evalJs(cdp, `document.querySelector(".onb-stepper li.current")?.textContent?.trim()`),
    );
  } catch (error) {
    check("wizard auto-opens on first run", false, error.message);
  }
  check("wizard auto-opens on first run", Boolean(wizardStep), `current step: ${wizardStep}`);
  check("wizard starts at welcome layer", /欢迎/.test(wizardStep || ""));

  // 2. Forward navigation through all layers.
  const nav = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => {
      const steps = [];
      const click = (selector) => evalJs(cdp, `document.querySelector(${JSON.stringify(selector)})?.click()`);
      const current = () => evalJs(cdp, `document.querySelector(".onb-stepper li.current")?.textContent?.trim()`);
      await click(".onb-primary"); await sleep(250); steps.push(await current()); // -> layer 1
      await click(".onb-primary"); await sleep(250); steps.push(await current()); // -> layer 2
      await click(".onb-primary"); await sleep(250); steps.push(await current()); // -> layer 3
      const layer3HasUploads = await evalJs(cdp, `document.querySelectorAll(".guide-upload-row").length`);
      await click(".onb-ghost"); await sleep(250); steps.push(await current()); // back -> layer 2
      return { steps, layer3HasUploads };
    },
  );
  check("forward nav reaches all layers", /生成角色图/.test(nav.steps[0] || "") && /生成动作条带/.test(nav.steps[1] || "") && /上传并生成/.test(nav.steps[2] || ""), nav.steps.join(" | "));
  check("layer 3 has 7 upload slots", nav.layer3HasUploads === 7, `found ${nav.layer3HasUploads}`);
  check("back navigation works", /生成动作条带/.test(nav.steps[3] || ""));

  // 3. Assemble button is gated until all 7 strips are uploaded.
  const gate = await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => {
      // Nav left the page on layer 2; walk forward to layer 3.
      await evalJs(cdp, `document.querySelector(".onb-primary").click()`);
      await sleep(300);
      return evalJs(cdp, `(() => {
        const step = document.querySelector(".onb-stepper li.current")?.textContent?.trim();
        const buttons = Array.from(document.querySelectorAll(".onb-primary")).map((button) => ({ text: button.textContent, disabled: button.disabled }));
        const assemble = buttons.find((button) => button.text.includes("一键生成"));
        return { step, buttons, disabled: assemble ? assemble.disabled : null, label: assemble ? assemble.text : null };
      })()`);
    },
  );
  check("assemble gated before uploads", /上传并生成/.test(gate.step || "") && gate.disabled === true, `step: ${gate.step}, label: ${gate.label}`);

  // 4. Skip from welcome: wizard closes, app stays alive and lands visibly.
  await withPage(
    (target) => target.url.includes("window=onboarding"),
    async (cdp) => {
      // Walk back to the welcome layer first; skip lives only there.
      for (let index = 0; index < 5; index += 1) {
        const step = await evalJs(cdp, `document.querySelector(".onb-stepper li.current")?.textContent?.trim()`);
        if (/欢迎/.test(step || "")) break;
        await evalJs(cdp, `document.querySelector(".onb-ghost")?.click()`);
        await sleep(220);
      }
      await evalJs(cdp, `Array.from(document.querySelectorAll(".onb-ghost")).find((button) => button.textContent.includes("跳过"))?.click()`);
      await sleep(1200);
      return true;
    },
  );
  await sleep(1500);
  const targetsAfter = await json("/json/list");
  const wizardGone = !targetsAfter.some((target) => target.type === "page" && target.url.includes("window=onboarding"));
  check("skip closes the wizard", wizardGone);
  const petAlive = targetsAfter.some((target) => target.type === "page" && target.url.includes("index.html") && !target.url.includes("window="));
  check("pet window still alive after skip", petAlive);
  const markerWritten = fs.existsSync(path.join(process.env.APPDATA || "", "xiaoxiaodeta", "onboarded.json"));
  check("skip writes the onboarding marker", markerWritten);
  console.log("AUDIT_DONE");
  console.log(JSON.stringify(findings));
  const failed = findings.filter((item) => !item.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("AUDIT_ERROR:", error.message);
  process.exit(2);
});
