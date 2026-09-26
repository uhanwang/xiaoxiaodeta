// Local "lite pet" pipeline: turn user photos into transparent sprite PNGs
// (u2netp via onnxruntime-node, fully offline) plus a manifest describing
// which role each sprite plays. The renderer maps these onto its animations.
const fs = require("node:fs");
const path = require("node:path");
const {
  alphaBoundingBox,
  applyMaskAlpha,
  bgraFromRgba,
  cropRgba,
  resizeBilinear,
  rgbaFromBgra,
} = require("./imageOps.cjs");

const LITE_DIR = path.join("custom-pet", "lite");
const ACTIVE_MODE_NAME = "active-mode.json";
const MANIFEST_NAME = "manifest.json";
const MODEL_INPUT = 320;
const NORMALIZE_MEAN = [0.485, 0.456, 0.406];
const NORMALIZE_STD = [0.229, 0.224, 0.225];
const ALLOWED_SOURCE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const LITE_ROLES = ["idle", "wave", "happy", "shy", "fail", "waiting", "review", "sit", "sleep"];
const ROLE_LABELS = {
  idle: "日常站姿（必选）",
  wave: "挥手打招呼",
  happy: "开心笑脸",
  shy: "害羞表情",
  fail: "失落神态",
  waiting: "等待等待",
  review: "认真查看",
  sit: "坐姿",
  sleep: "睡觉",
};

function liteDir(userDataPath) {
  return path.join(userDataPath, "custom-pet", "lite");
}

function liteManifestPath(userDataPath) {
  return path.join(liteDir(userDataPath), MANIFEST_NAME);
}

function activeModePath(userDataPath) {
  return path.join(userDataPath, "custom-pet", ACTIVE_MODE_NAME);
}

function validateLitePlan(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "至少需要一张照片（作为日常站姿）。" };
  }
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "照片数据格式不正确。" };
    if (!LITE_ROLES.includes(entry.role)) return { ok: false, error: `未知的姿势类型：${entry.role}` };
    if (seen.has(entry.role)) return { ok: false, error: `姿势“${ROLE_LABELS[entry.role] || entry.role}”重复了，一张就够。` };
    seen.add(entry.role);
    const extension = path.extname(String(entry.sourcePath || "")).toLowerCase();
    if (!ALLOWED_SOURCE_EXTENSIONS.includes(extension)) {
      return { ok: false, error: "照片需要是 PNG / JPG / WebP 格式。" };
    }
  }
  if (!seen.has("idle")) return { ok: false, error: "需要一张“日常站姿”照片作为基础形象。" };
  return { ok: true, roles: [...seen] };
}

function manifestFor(entries) {
  const images = {};
  for (const entry of entries) images[entry.role] = `${entry.role}.png`;
  return { version: 1, type: "lite", images, generatedAt: new Date().toISOString() };
}

let cachedSession = null;
let cachedSessionKey = "";

async function getCutoutSession(ort, modelPath) {
  if (cachedSession && cachedSessionKey === modelPath) return cachedSession;
  cachedSession = await ort.InferenceSession.create(modelPath);
  cachedSessionKey = modelPath;
  return cachedSession;
}

// Runs u2netp on a decoded image and returns a Float32 [0,1] mask of MODEL_INPUT².
async function inferMask(ort, session, rgba, width, height) {
  const small = resizeBilinear(rgba, width, height, MODEL_INPUT, MODEL_INPUT);
  const input = new Float32Array(3 * MODEL_INPUT * MODEL_INPUT);
  const plane = MODEL_INPUT * MODEL_INPUT;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    const source = pixel * 4;
    input[pixel] = (small[source] / 255 - NORMALIZE_MEAN[0]) / NORMALIZE_STD[0];
    input[plane + pixel] = (small[source + 1] / 255 - NORMALIZE_MEAN[1]) / NORMALIZE_STD[1];
    input[2 * plane + pixel] = (small[source + 2] / 255 - NORMALIZE_MEAN[2]) / NORMALIZE_STD[2];
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, MODEL_INPUT, MODEL_INPUT]) };
  const outputs = await session.run(feeds);
  const raw = outputs[session.outputNames[0]].data;
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] < min) min = raw[index];
    if (raw[index] > max) max = raw[index];
  }
  const span = max - min || 1;
  const mask = new Uint8ClampedArray(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    mask[index] = ((raw[index] - min) / span) * 255;
  }
  return mask;
}

// Async wrapper kept separate so callers can await; see cutoutToFile.
async function cutoutRGBA(rgba, width, height, ort, session) {
  const mask = await inferMask(ort, session, rgba, width, height);
  const masked = applyMaskAlpha(rgba, width, height, mask, MODEL_INPUT, MODEL_INPUT);
  const box = alphaBoundingBox(masked, width, height, 8);
  if (!box) throw new Error("没有在照片里找到清晰的人物主体，换一张人物更大、背景更简单的照片试试。");
  const padded = {
    left: Math.max(0, box.left - 2),
    top: Math.max(0, box.top - 2),
    right: Math.min(width - 1, box.right + 2),
    bottom: Math.min(height - 1, box.bottom + 2),
  };
  return cropRgba(masked, width, height, padded);
}

async function cutoutToFile(sourcePath, destination, deps) {
  const { nativeImage, ort, modelPath } = deps;
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) throw new Error(`无法读取这张图片：${path.basename(String(sourcePath))}`);
  const { width, height } = image.getSize();
  const rgba = rgbaFromBgra(image.toBitmap(), width, height);
  const session = await getCutoutSession(ort, modelPath);
  const cropped = await cutoutRGBA(rgba, width, height, ort, session);
  const bgra = bgraFromRgba(cropped.data);
  const output = nativeImage.createFromBitmap(Buffer.from(bgra.buffer, bgra.byteOffset, bgra.byteLength), {
    width: cropped.width,
    height: cropped.height,
  });
  fs.writeFileSync(destination, output.toPNG());
  return { width: cropped.width, height: cropped.height };
}

async function installLitePet(entries, userDataPath, deps) {
  const check = validateLitePlan(entries);
  if (!check.ok) throw new Error(check.error);
  const directory = liteDir(userDataPath);
  const staging = path.join(userDataPath, "custom-pet", `.lite-staging-${process.pid}-${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    for (const entry of entries) {
      const resolvedSource = path.resolve(entry.sourcePath);
      if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) {
        throw new Error(`找不到这张照片：${path.basename(String(entry.sourcePath))}`);
      }
      await cutoutToFile(resolvedSource, path.join(staging, `${entry.role}.png`), deps);
    }
    fs.writeFileSync(path.join(staging, MANIFEST_NAME), JSON.stringify(manifestFor(entries), null, 2), "utf8");
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    const previous = `${directory}.old-${Date.now()}`;
    if (fs.existsSync(directory)) fs.renameSync(directory, previous);
    fs.renameSync(staging, directory);
    fs.rmSync(previous, { recursive: true, force: true });
    writeActiveMode(userDataPath, "lite");
    return { dir: directory, roles: check.roles };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function resetLitePet(userDataPath) {
  fs.rmSync(liteDir(userDataPath), { recursive: true, force: true });
}

function writeActiveMode(userDataPath, mode) {
  const marker = activeModePath(userDataPath);
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, JSON.stringify({ mode }), "utf8");
}

function readActiveMode(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(activeModePath(userDataPath), "utf8"));
    return ["default", "atlas", "lite"].includes(parsed?.mode) ? parsed.mode : null;
  } catch {
    return null;
  }
}

function readLiteManifest(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(liteManifestPath(userDataPath), "utf8"));
    return parsed?.type === "lite" && parsed.images && typeof parsed.images === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Serves pet://assets/custom/lite/<role>.png; the name is restricted to known
// safe characters so the route can never escape the lite directory.
function liteAssetPath(userDataPath, requestedName) {
  if (!/^[a-z][a-z0-9-]*\.png$/.test(String(requestedName || ""))) return null;
  const resolved = path.join(liteDir(userDataPath), requestedName);
  return fs.existsSync(resolved) ? resolved : null;
}

module.exports = {
  LITE_ROLES,
  ROLE_LABELS,
  liteAssetPath,
  liteDir,
  liteManifestPath,
  readActiveMode,
  readLiteManifest,
  resetLitePet,
  validateLitePlan,
  writeActiveMode,
  // exposed for tests
  cutoutRGBA,
  inferMask,
  manifestFor,
  installLitePet,
};
