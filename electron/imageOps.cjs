// Pure RGBA buffer math for the local photo cutout pipeline.
// Kept free of Electron and ONNX dependencies so the math is unit-testable.

function rgbaFromBgra(bgra, width, height) {
  const pixels = width * height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    const source = index * 4;
    rgba[source] = bgra[source + 2];
    rgba[source + 1] = bgra[source + 1];
    rgba[source + 2] = bgra[source];
    rgba[source + 3] = bgra[source + 3];
  }
  return rgba;
}

function bgraFromRgba(rgba) {
  const pixels = rgba.length / 4;
  const bgra = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    const source = index * 4;
    bgra[source] = rgba[source + 2];
    bgra[source + 1] = rgba[source + 1];
    bgra[source + 2] = rgba[source];
    bgra[source + 3] = rgba[source + 3];
  }
  return bgra;
}

function sampleBilinear(rgba, width, height, x, y, channel) {
  const clampedX = Math.min(Math.max(x, 0), width - 1);
  const clampedY = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const at = (px, py) => rgba[(py * width + px) * 4 + channel];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function resizeBilinear(rgba, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return rgba;
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * scaleY - 0.5;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * scaleX - 0.5;
      const target = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[target + channel] = sampleBilinear(rgba, sourceWidth, sourceHeight, sourceX, sourceY, channel);
      }
    }
  }
  return output;
}

// Scales the [0,255] single-channel mask to the image size and multiplies alpha.
function applyMaskAlpha(rgba, width, height, mask, maskWidth, maskHeight) {
  const output = new Uint8ClampedArray(rgba);
  for (let y = 0; y < height; y += 1) {
    const maskY = Math.min(maskHeight - 1, Math.max(0, Math.floor((y / height) * maskHeight)));
    for (let x = 0; x < width; x += 1) {
      const maskX = Math.min(maskWidth - 1, Math.max(0, Math.floor((x / width) * maskWidth)));
      const maskValue = mask[maskY * maskWidth + maskX] / 255;
      const target = (y * width + x) * 4 + 3;
      output[target] = rgba[target] * maskValue;
    }
  }
  return output;
}

function alphaBoundingBox(rgba, width, height, threshold = 8) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, right, bottom };
}

function cropRgba(rgba, width, height, box) {
  const outWidth = box.right - box.left + 1;
  const outHeight = box.bottom - box.top + 1;
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const sourceRow = ((box.top + y) * width + box.left) * 4;
    output.set(rgba.subarray(sourceRow, sourceRow + outWidth * 4), y * outWidth * 4);
  }
  return { data: output, width: outWidth, height: outHeight };
}

module.exports = {
  alphaBoundingBox,
  applyMaskAlpha,
  bgraFromRgba,
  cropRgba,
  resizeBilinear,
  rgbaFromBgra,
};
