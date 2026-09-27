// "Q 版形象工坊": turn a user photo into a full 8x11 action atlas.
// Pipeline (ported from the original manual workflow):
//   photo --images/edits--> Q版 character sheet --> per-action strips
//   --> per-frame cutout (u2netp ramp / cyan key) --> baseline registration
//   --> 1536x2288 atlas --> structural QA --> install.
// Generation calls use the user's own OpenAI-compatible image API key; the
// photo and intermediates never leave the machine except to that endpoint.
const fs = require("node:fs");
const path = require("node:path");

const {
  atlasQA,
  composeAtlas,
  cyanKeyAlpha,
  maskRampAlpha,
  mirrorRgba,
  registerRowFrames,
  splitStripFrames,
} = require("./atlasCompose.cjs");
const { inferMask } = require("./litePet.cjs");
const { rgbaFromBgra } = require("./imageOps.cjs");

const SETTINGS_NAME = "qpet-settings.json";
const DEFAULT_SETTINGS = Object.freeze({
  baseUrl: "https://api.wenle.ai/v1",
  model: "gpt-image-2.5",
  size: "1536x1024",
  quality: "high",
  apiKey: "",
});

function settingsPath(userDataPath) {
  return path.join(userDataPath, SETTINGS_NAME);
}

function loadSettings(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(userDataPath), "utf8"));
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(userDataPath, patch) {
  const merged = { ...loadSettings(userDataPath), ...(patch && typeof patch === "object" ? patch : {}) };
  fs.mkdirSync(path.dirname(settingsPath(userDataPath)), { recursive: true });
  fs.writeFileSync(settingsPath(userDataPath), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

const STRIP_SPECS = Object.freeze([
  { name: "idle", frames: 6, background: "white", action: "自然待机呼吸的连续姿势，身体轻轻起伏，眼睛偶尔闭合再睁开" },
  { name: "waving", frames: 4, background: "white", action: "开心挥手的连续动作，一只手臂高举左右挥动，脸上带笑" },
  { name: "jumping", frames: 5, background: "white", action: "开心跳跃的连续动作：下蹲蓄力、腾空、落地站稳" },
  { name: "failed", frames: 8, background: "white", action: "失落沮丧的连续动作：低头、垂肩、小幅度叹气晃动" },
  { name: "waiting", frames: 6, background: "white", action: "原地等待的连续姿势：东张西望、轻轻晃动、小动作" },
  { name: "running", frames: 6, background: "cyan", action: "朝画面右侧奔跑的连续动作：迈步、摆臂，人物方向明确朝右" },
  { name: "review", frames: 6, background: "white", action: "认真查看的连续姿势：低头端详、歪头思考、点点头" },
]);

const IDENTITY_PROMPT = [
  "把照片中的人物转换成日系精致 Q 版 Windows 桌宠角色，约 2.5 头身，头大腿长，线条圆润干净。",
  "严格保留照片人物的发型发色、五官特征和标志性服装配色；五官清晰锐利，边缘无模糊、融化或重影。",
  "输出横向 4 列 × 2 行动作精灵表，8 个完整不重叠的同一角色，角色大小与脚底基线一致。",
  "动作依次为：待机站立、眨眼、向左走、向右走、坐下、睡觉、开心挥手、被拖起惊讶。",
  "纯白均匀背景，无阴影、无文字、无编号、无道具、无额外人物，适合后续逐格切分为透明 PNG。",
].join("");

function stripPrompt(spec) {
  const background = spec.background === "cyan"
    ? "纯青色（#00FFFF）均匀背景"
    : "纯白均匀背景";
  return [
    `基于参考图中同一个 Q 版桌宠角色，重新绘制同一角色的「${spec.name}」动作精灵表。`,
    `横向 ${spec.frames} 个完整不重叠的同一角色，角色大小和脚底基线完全一致，动作连续自然：${spec.action}。`,
    `${background}，无阴影、无文字、无编号、无道具、无额外人物，适合逐格切分。`,
  ].join("");
}

async function imageEdit({ imagePath, prompt, settings, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  const bytes = fs.readFileSync(imagePath);
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), "input.png");
  form.append("prompt", prompt);
  form.append("model", settings.model);
  form.append("size", settings.size);
  form.append("quality", settings.quality);
  form.append("n", "1");
  const response = await doFetch(`${settings.baseUrl.replace(/\/+$/, "")}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`图像生成服务返回 ${response.status}：${text.slice(0, 240)}`);
  }
  const payload = await response.json();
  const first = payload?.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const download = await doFetch(first.url, { signal: AbortSignal.timeout(120000) });
    if (!download.ok) throw new Error(`下载生成结果失败（${download.status}）。`);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图像生成服务没有返回图片数据。");
}

function bufferToRgba(buffer, nativeImage) {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error("生成的图片无法解码，请重试。");
  const { width, height } = image.getSize();
  return { data: rgbaFromBgra(image.toBitmap(), width, height), width, height };
}

async function frameCutout(frame, session, ort) {
  const mask = await inferMask(ort, session, frame.data, frame.width, frame.height);
  return maskRampAlpha(frame.data, frame.width, frame.height, mask, 320);
}

async function generateQPet({ photoPath, userDataPath, deps }) {
  const { nativeImage, ort, modelPath, onProgress, fetchImpl } = deps;
  const settings = loadSettings(userDataPath);
  if (!settings.apiKey) throw new Error("请先在「生成设置」里填写图像生成 API Key。");
  const resolvedPhoto = path.resolve(photoPath);
  if (!fs.existsSync(resolvedPhoto)) throw new Error("找不到选择的照片，请重新选择。");

  const workDir = path.join(userDataPath, "custom-pet", `.qpet-work-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const total = 1 + STRIP_SPECS.length;
  try {
    const session = await ort.InferenceSession.create(modelPath);

    onProgress({ stage: "identity", done: 0, total, message: `第 1/${total} 步：把照片转成 Q 版角色…（约 1 分钟）` });
    const identityBuffer = await imageEdit({ imagePath: resolvedPhoto, prompt: IDENTITY_PROMPT, settings, fetchImpl });
    const identityPath = path.join(workDir, "identity-sheet.png");
    fs.writeFileSync(identityPath, identityBuffer);

    const stripCells = {};
    let step = 1;
    for (const spec of STRIP_SPECS) {
      step += 1;
      onProgress({ stage: spec.name, done: step - 1, total, message: `第 ${step}/${total} 步：生成「${spec.name}」动作条带…` });
      const stripBuffer = await imageEdit({ imagePath: identityPath, prompt: stripPrompt(spec), settings, fetchImpl });
      const strip = bufferToRgba(stripBuffer, nativeImage);
      const frames = splitStripFrames(strip, spec.frames);
      const cutouts = [];
      for (const frame of frames) {
        cutouts.push(spec.background === "cyan"
          ? cyanKeyAlpha(frame.data)
          : await frameCutout(frame, session, ort));
      }
      const cutoutFrames = cutouts.map((data, index) => ({ data, width: frames[index].width, height: frames[index].height }));
      stripCells[spec.name] = registerRowFrames(cutoutFrames);
    }

    onProgress({ stage: "compose", done: total, total, message: "拼装动作图集并做质量校验…" });
    const running = stripCells.running;
    const runRight = [...running];
    while (runRight.length < 8) runRight.push(runRight[runRight.length - 8] || running[0]);
    const runLeft = mirrorFrames(runRight);
    const idleFull = [...stripCells.idle];
    while (idleFull.length < 7) idleFull.push(idleFull[0]);
    const gaze = new Array(8).fill(stripCells.idle[0]);

    const atlas = composeAtlas({
      0: idleFull,
      1: runRight,
      2: runLeft,
      3: stripCells.waving,
      4: stripCells.jumping,
      5: stripCells.failed,
      6: stripCells.waiting,
      7: running,
      8: stripCells.review,
      9: gaze,
      10: gaze,
    });

    const qa = atlasQA(atlas);
    const candidatePath = path.join(workDir, "qpet-atlas.png");
    writeAtlasPng(atlas, candidatePath, nativeImage);
    if (!qa.ok) {
      const error = new Error(`生成的图集没有通过质量校验（${qa.errors.slice(0, 3).join("；")}）。已保留候选文件，可重试一次。`);
      error.candidatePath = candidatePath;
      throw error;
    }

    onProgress({ stage: "install", done: total, total, message: "安装新形象…" });
    const { installCustomAtlas } = require("./customAssets.cjs");
    installCustomAtlas(candidatePath, userDataPath, nativeImage);
    const { writeActiveMode, resetLitePet } = require("./litePet.cjs");
    resetLitePet(userDataPath);
    writeActiveMode(userDataPath, "atlas");
    onProgress({ stage: "done", done: total, total, message: "新形象生成完成，桌宠已换装！", finished: true });
    return { ok: true, candidatePath };
  } finally {
    // The work dir holds the user's photo derivatives; keep nothing behind.
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function mirrorFrames(cells) {
  return cells.map((cell) => mirrorRgba(cell, 192, 208));
}

function writeAtlasPng(atlas, destination, nativeImage) {
  const width = 192 * 8;
  const height = 208 * 11;
  const bgra = Buffer.alloc(atlas.length);
  for (let index = 0; index < atlas.length; index += 4) {
    bgra[index] = atlas[index + 2];
    bgra[index + 1] = atlas[index + 1];
    bgra[index + 2] = atlas[index];
    bgra[index + 3] = atlas[index + 3];
  }
  const image = nativeImage.createFromBitmap(bgra, { width, height });
  fs.writeFileSync(destination, image.toPNG());
}

module.exports = {
  DEFAULT_SETTINGS,
  IDENTITY_PROMPT,
  STRIP_SPECS,
  generateQPet,
  loadSettings,
  saveSettings,
  settingsPath,
  stripPrompt,
};
