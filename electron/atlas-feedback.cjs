// Maps raw atlas validation failures to actionable user-facing messages.
// Kept dependency-free so it can be unit-tested without Electron.

const SIZE_HINT = "1536x2288";

function atlasFeedback(error) {
  const raw = String((error && error.message) || error);
  if (raw.includes(SIZE_HINT)) {
    return "图集尺寸不对：需要正好 1536×2288 像素的 PNG。制作规范见项目 docs/ATLAS-FORMAT.md。";
  }
  if (raw.toLowerCase().includes("png")) {
    return "请先把图集转成 PNG 格式再导入。";
  }
  if (raw.includes("could not decode") || raw.includes("must be a file")) {
    return "这个文件无法读取为图片，请确认选择的是动作图集 PNG。";
  }
  return `导入失败：${raw}`;
}

module.exports = { atlasFeedback };
