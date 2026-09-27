// Pure atlas composition: turn generated horizontal action strips into a
// registered 8x11 atlas (192x208 cells). Ported from the original one-off
// Python pipeline so the app can do it locally without Python.
const {
  alphaBoundingBox,
  resizeBilinear,
  rgbaFromBgra,
} = require("./imageOps.cjs");

const CELL_W = 192;
const CELL_H = 208;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 11;
const BASELINE_Y = 203;
const MAX_CELL_HEIGHT = 198;
const MAX_CELL_WIDTH = 154;
const REQUIRED_CELLS = Object.freeze({
  0: 7, 1: 8, 2: 8, 3: 4, 4: 5, 5: 8, 6: 6, 7: 6, 8: 6, 9: 8, 10: 8,
});

function newRgba(width, height) {
  return new Uint8ClampedArray(width * height * 4);
}

function cropRect(rgba, width, height, box) {
  const outW = box.right - box.left + 1;
  const outH = box.bottom - box.top + 1;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    const sourceRow = ((box.top + y) * width + box.left) * 4;
    out.set(rgba.subarray(sourceRow, sourceRow + outW * 4), y * outW * 4);
  }
  return { data: out, width: outW, height: outH };
}

function mirrorRgba(rgba, width, height) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = (y * width + (width - 1 - x)) * 4;
      out[target] = rgba[source];
      out[target + 1] = rgba[source + 1];
      out[target + 2] = rgba[source + 2];
      out[target + 3] = rgba[source + 3];
    }
  }
  return out;
}

// Cuts a horizontal strip into `count` equal frames (RGBA in, cells out).
function splitStripFrames(strip, count) {
  const frameWidth = strip.width / count;
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const left = Math.round(index * frameWidth);
    const right = Math.min(strip.width - 1, Math.round((index + 1) * frameWidth) - 1);
    frames.push(cropRect(strip.data, strip.width, strip.height, { left, top: 0, right, bottom: strip.height - 1 }));
  }
  return frames;
}

// Cyan-background keying for strips that were generated on a cyan backdrop.
function cyanKeyAlpha(rgba) {
  const out = new Uint8ClampedArray(rgba);
  const key = [0, 255, 255];
  for (let index = 0; index < out.length; index += 4) {
    const dr = out[index] - key[0];
    const dg = out[index + 1] - key[1];
    const db = out[index + 2] - key[2];
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const alpha = Math.min(255, Math.max(0, (distance - 22) * (255 / (230 - 22))));
    const a = alpha / 255;
    if (a > 0) {
      // Unmix the cyan from anti-aliased edge pixels to avoid a turquoise fringe.
      const safe = Math.max(a, 1 / 255);
      out[index] = Math.min(255, Math.max(0, (out[index] - key[0] * (1 - a)) / safe));
      out[index + 1] = Math.min(255, Math.max(0, (out[index + 1] - key[1] * (1 - a)) / safe));
      out[index + 2] = Math.min(255, Math.max(0, (out[index + 2] - key[2] * (1 - a)) / safe));
    } else {
      out[index] = 0;
      out[index + 1] = 0;
      out[index + 2] = 0;
    }
    out[index + 3] = alpha;
  }
  return out;
}

// Ramps the raw u2netp mask into sprite alpha (keeps anti-aliased edges,
// suppresses background remnants), matching the original pipeline's ramp.
// The mask (maskSize²) is sampled across frames of any size.
function maskRampAlpha(rgba, frameWidth, frameHeight, mask, maskSize) {
  const out = new Uint8ClampedArray(rgba);
  for (let y = 0; y < frameHeight; y += 1) {
    const maskY = Math.min(maskSize - 1, Math.floor((y / frameHeight) * maskSize));
    for (let x = 0; x < frameWidth; x += 1) {
      const maskX = Math.min(maskSize - 1, Math.floor((x / frameWidth) * maskSize));
      const maskValue = mask[maskY * maskSize + maskX];
      const alpha = Math.min(255, Math.max(0, (maskValue - 88) * (255 / (216 - 88))));
      const target = (y * frameWidth + x) * 4 + 3;
      out[target] = alpha;
    }
  }
  return out;
}

// Scales every frame to a shared foot baseline and centers it in a cell.
function registerRowFrames(frames) {
  const boxes = frames.map((frame) => alphaBoundingBox(frame.data, frame.width, frame.height, 168));
  if (boxes.some((box) => box === null)) {
    throw new Error("有动作帧没有检测到人物主体，生成的条带可能不完整，请重试。");
  }
  const referenceFoot = Math.max(...boxes.map((box) => box.bottom));
  const maxSpan = Math.max(...boxes.map((box) => referenceFoot - box.top));
  const maxWidth = Math.max(...boxes.map((box) => box.right - box.left + 1));
  const scale = Math.min(MAX_CELL_HEIGHT / maxSpan, MAX_CELL_WIDTH / maxWidth);
  return frames.map((frame, index) => {
    const box = boxes[index];
    const cutout = cropRect(frame.data, frame.width, frame.height, box);
    const scaledWidth = Math.max(1, Math.round(cutout.width * scale));
    const scaledHeight = Math.max(1, Math.round(cutout.height * scale));
    const scaled = resizeBilinear(cutout.data, cutout.width, cutout.height, scaledWidth, scaledHeight);
    const cell = new Uint8ClampedArray(CELL_W * CELL_H * 4);
    const x = Math.floor((CELL_W - scaledWidth) / 2);
    const baseline = BASELINE_Y - Math.round((referenceFoot - box.bottom) * scale);
    const y = baseline - scaledHeight;
    for (let row = 0; row < scaledHeight; row += 1) {
      const targetY = y + row;
      if (targetY < 0 || targetY >= CELL_H) continue;
      const sourceRow = row * scaledWidth * 4;
      const targetRow = (targetY * CELL_W + x) * 4;
      for (let column = 0; column < scaledWidth; column += 1) {
        const alpha = scaled[sourceRow + column * 4 + 3];
        if (alpha === 0) continue;
        const target = targetRow + column * 4;
        const source = sourceRow + column * 4;
        const outA = alpha / 255;
        const inA = cell[target + 3] / 255;
        const blendA = outA + inA * (1 - outA);
        for (let channel = 0; channel < 3; channel += 1) {
          cell[target + channel] = (scaled[source + channel] * outA + cell[target + channel] * inA * (1 - outA)) / (blendA || 1);
        }
        cell[target + 3] = blendA * 255;
      }
    }
    return cell;
  });
}

// rows: { [rowIndex]: cells[] } with cells as 192*208*4 RGBA.
function composeAtlas(rows) {
  const atlas = new Uint8ClampedArray(ATLAS_COLUMNS * CELL_W * ATLAS_ROWS * CELL_H * 4);
  for (const [rowIndexRaw, cells] of Object.entries(rows)) {
    const rowIndex = Number(rowIndexRaw);
    for (let column = 0; column < cells.length && column < ATLAS_COLUMNS; column += 1) {
      const cell = cells[column];
      for (let y = 0; y < CELL_H; y += 1) {
        const atlasRow = ((rowIndex * CELL_H + y) * ATLAS_COLUMNS * CELL_W + column * CELL_W) * 4;
        const cellRow = y * CELL_W * 4;
        atlas.set(cell.subarray(cellRow, cellRow + CELL_W * 4), atlasRow);
      }
    }
  }
  return atlas;
}

// Structural QA: expected non-empty cells per row, nothing touching cell edges.
function atlasQA(atlas) {
  const errors = [];
  for (let row = 0; row < ATLAS_ROWS; row += 1) {
    const required = REQUIRED_CELLS[row];
    let nonEmpty = 0;
    for (let column = 0; column < ATLAS_COLUMNS; column += 1) {
      let hasContent = false;
      let edgePixels = 0;
      for (let y = 0; y < CELL_H; y += 1) {
        for (let x = 0; x < CELL_W; x += 1) {
          const alpha = atlas[(((row * CELL_H + y) * ATLAS_COLUMNS * CELL_W) + column * CELL_W + x) * 4 + 3];
          if (alpha > 0) {
            hasContent = true;
            if (y === 0 || y === CELL_H - 1 || x === 0 || x === CELL_W - 1) edgePixels += 1;
          }
        }
      }
      if (hasContent) nonEmpty += 1;
      const used = column < required;
      if (used && !hasContent) errors.push(`row ${row} column ${column}: 必需格为空`);
      if (!used && hasContent) errors.push(`row ${row} column ${column}: 多余内容`);
      if (edgePixels > 0) errors.push(`row ${row} column ${column}: 触碰格边 ${edgePixels} 像素`);
    }
    if (nonEmpty !== required) errors.push(`row ${row}: 非空格 ${nonEmpty}，应为 ${required}`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  BASELINE_Y,
  CELL_H,
  CELL_W,
  REQUIRED_CELLS,
  atlasQA,
  composeAtlas,
  cyanKeyAlpha,
  maskRampAlpha,
  mirrorRgba,
  registerRowFrames,
  splitStripFrames,
  rgbaFromBgra,
};
