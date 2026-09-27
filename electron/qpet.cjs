// Assemble a user-generated Q-version pet. The user creates the character
// sheet and the action strips in any image tool they like (the guide page
// provides copyable prompts); this module does the local part only:
// per-frame cutout (u2netp ramp / cyan key) -> baseline registration ->
// 8x11 atlas composition -> structural QA -> install. No API, no cost.
const fs = require("node:fs");
const path = require("node:path");

const STRIPS_GUIDE = require("../shared/qpet-strips.json");

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

const CELL_W = 192;
const CELL_H = 208;

function stripSpecs() {
  return STRIPS_GUIDE.strips;
}

async function frameCutout(frame, session, ort) {
  const mask = await inferMask(ort, session, frame.data, frame.width, frame.height);
  return maskRampAlpha(frame.data, frame.width, frame.height, mask, 320);
}

function mirrorFrames(cells) {
  return cells.map((cell) => mirrorRgba(cell, CELL_W, CELL_H));
}

function padCells(cells, target, padWith) {
  const result = [...cells];
  while (result.length < target) result.push(padWith);
  return result.slice(0, target);
}

async function assembleQPet({ strips, userDataPath, deps }) {
  const { nativeImage, ort, modelPath, onProgress } = deps;
  const specs = stripSpecs();
  const missing = specs.filter((spec) => !strips || typeof strips[spec.name] !== "string" || !strips[spec.name]);
  if (missing.length) {
    throw new Error(`还缺少动作条带：${missing.map((spec) => spec.label).join("、")}。`);
  }
  const resolved = {};
  for (const spec of specs) {
    const sourcePath = path.resolve(strips[spec.name]);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`找不到「${spec.label}」的图片，请重新上传。`);
    }
    resolved[spec.name] = sourcePath;
  }

  const workDir = path.join(userDataPath, "custom-pet", `.qpet-work-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const total = specs.length + 1;
  try {
    const session = await ort.InferenceSession.create(modelPath);
    const stripCells = {};
    let step = 0;
    for (const spec of specs) {
      step += 1;
      onProgress({ stage: spec.name, done: step - 1, total, message: `第 ${step}/${total} 步：本地处理「${spec.label}」（抠图、对齐基线）…` });
      const image = nativeImage.createFromPath(resolved[spec.name]);
      if (image.isEmpty()) throw new Error(`「${spec.label}」的图片无法读取，请换一张。`);
      const { width, height } = image.getSize();
      const strip = { data: rgbaFromBgra(image.toBitmap(), width, height), width, height };
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

    onProgress({ stage: "compose", done: specs.length, total, message: "拼装动作图集并做质量校验…" });
    const idle = padCells(stripCells.idle, 7, stripCells.idle[0]);
    const runRight = padCells(stripCells.running, 8, stripCells.running[0]);
    const runLeft = mirrorFrames(runRight);
    const gaze = new Array(8).fill(stripCells.idle[0]);

    const atlas = composeAtlas({
      0: idle,
      1: runRight,
      2: runLeft,
      3: stripCells.waving,
      4: stripCells.jumping,
      5: stripCells.failed,
      6: stripCells.waiting,
      7: stripCells.running,
      8: stripCells.review,
      9: gaze,
      10: gaze,
    });

    const qa = atlasQA(atlas);
    const candidatePath = path.join(workDir, "qpet-atlas.png");
    writeAtlasPng(atlas, candidatePath, nativeImage);
    if (!qa.ok) {
      const error = new Error(`生成的图集没有通过质量校验（${qa.errors.slice(0, 3).join("；")}）。候选图已保留在 ${candidatePath}，调整条带后可重试。`);
      error.candidatePath = candidatePath;
      throw error;
    }

    onProgress({ stage: "install", done: total, total, message: "安装新形象…" });
    const { installCustomAtlas } = require("./customAssets.cjs");
    installCustomAtlas(candidatePath, userDataPath, nativeImage);
    const { writeActiveMode, resetLitePet } = require("./litePet.cjs");
    resetLitePet(userDataPath);
    writeActiveMode(userDataPath, "atlas");
    onProgress({ stage: "done", done: total, total, message: "你的专属桌宠已就位，正在打开陪伴面板！", finished: true });
    // Success: the candidate is installed; nothing else needs to be kept.
    fs.rmSync(workDir, { recursive: true, force: true });
    return { ok: true, candidatePath };
  } catch (error) {
    if (!error.candidatePath) {
      // Keep nothing behind unless a failed candidate was preserved on purpose.
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    throw error;
  }
}

function writeAtlasPng(atlas, destination, nativeImage) {
  const width = CELL_W * 8;
  const height = CELL_H * 11;
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
  assembleQPet,
  stripSpecs,
  writeAtlasPng,
};
