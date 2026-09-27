const fs = require("node:fs");
const path = require("node:path");

const { liteAssetPath, liteManifestPath, readActiveMode } = require("./litePet.cjs");
const { slotDir, wardrobeVariantPath } = require("./wardrobe.cjs");

const CUSTOM_ATLAS_ROUTE = "assets/atlas/pet-actions-installed.webp";
const CUSTOM_ATLAS_FILENAME = "pet-actions-installed.png";
const LITE_ROUTE_PREFIX = "assets/custom/lite/";
const CLOSET_ROUTE_PREFIX = "assets/custom/closet/";
const WARDROBE_PREFIX = "assets/wardrobe/";
const WARDROBE_ATLAS_RE = /^assets\/wardrobe\/([a-z][a-z0-9-]*)\/atlas\/pet-actions-installed\.webp$/;
const EXPECTED_ATLAS_SIZE = Object.freeze({ width: 1536, height: 2288 });

function customAtlasPath(userDataPath) {
  return path.join(userDataPath, "custom-pet", CUSTOM_ATLAS_FILENAME);
}

// Resolves which appearance the pet should render: an installed full atlas
// beats a lite photo pet unless the user explicitly switched via marker.
function resolveAppearanceMode(userDataPath) {
  const markerMode = readActiveMode(userDataPath);
  if (markerMode) return markerMode;
  if (fs.existsSync(customAtlasPath(userDataPath))) return "atlas";
  if (fs.existsSync(liteManifestPath(userDataPath))) return "lite";
  return "default";
}

function resolveClientAsset(relativePath, clientRoot, userDataPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(relativePath));
  } catch {
    return null;
  }
  const normalizedPath = path.posix.normalize(decodedPath.replace(/\\/g, "/").replace(/^\/+/, ""));
  if (!normalizedPath || normalizedPath === ".") return null;

  const root = path.resolve(clientRoot);
  const bundledPath = path.resolve(root, ...normalizedPath.split("/"));
  if (bundledPath !== root && !bundledPath.startsWith(`${root}${path.sep}`)) return null;

  if (normalizedPath.startsWith(LITE_ROUTE_PREFIX)) {
    const litePath = liteAssetPath(userDataPath, normalizedPath.slice(LITE_ROUTE_PREFIX.length));
    if (litePath) return litePath;
  }
  if (normalizedPath.startsWith(CLOSET_ROUTE_PREFIX)) {
    const slotId = normalizedPath.slice(CLOSET_ROUTE_PREFIX.length).replace(/\.png$/, "");
    const slot = slotDir(userDataPath, slotId);
    const thumbnail = slot ? path.join(slot, "atlas.png") : null;
    if (thumbnail && fs.existsSync(thumbnail)) return thumbnail;
    return null;
  }
  if (normalizedPath === CUSTOM_ATLAS_ROUTE) {
    const overridePath = customAtlasPath(userDataPath);
    if (fs.existsSync(overridePath)) return overridePath;
  }
  if (normalizedPath.startsWith(WARDROBE_PREFIX)) {
    // In custom-atlas mode the wardrobe is served from user-generated files:
    // a generated variant wins, a missing one falls back to the user's own
    // base atlas, and the bundled default character is never reachable.
    if (resolveAppearanceMode(userDataPath) === "atlas") {
      const atlasMatch = normalizedPath.match(WARDROBE_ATLAS_RE);
      if (atlasMatch) {
        const variant = wardrobeVariantPath(userDataPath, atlasMatch[1]);
        if (variant && fs.existsSync(variant)) return variant;
        const base = customAtlasPath(userDataPath);
        return fs.existsSync(base) ? base : null;
      }
      // Per-sprite wardrobe art was hand-tuned for the default character;
      // it would flash the wrong persona on a custom one.
      return null;
    }
    return bundledPath;
  }
  return bundledPath;
}

function parseCustomAssetCommand(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const installIndex = args.indexOf("--install-custom-atlas");
  if (installIndex >= 0) {
    const sourcePath = args[installIndex + 1];
    if (!sourcePath || sourcePath.startsWith("--")) {
      throw new Error("--install-custom-atlas requires an image path");
    }
    return {
      type: "install",
      sourcePath,
      statusPath: valueAfter(args, "--custom-asset-status"),
    };
  }

  if (args.includes("--reset-custom-atlas")) {
    return {
      type: "reset",
      statusPath: valueAfter(args, "--custom-asset-status"),
    };
  }
  return null;
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function installCustomAtlas(sourcePath, userDataPath, nativeImage) {
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.statSync(resolvedSource).isFile()) throw new Error("The atlas source must be a file");
  const extension = path.extname(resolvedSource).toLowerCase();
  if (extension !== ".png") throw new Error("The atlas must be normalized to PNG before installation");

  const image = nativeImage.createFromPath(resolvedSource);
  if (image.isEmpty()) throw new Error("Electron could not decode the atlas image");
  const size = image.getSize();
  if (size.width !== EXPECTED_ATLAS_SIZE.width || size.height !== EXPECTED_ATLAS_SIZE.height) {
    throw new Error(`The atlas must be ${EXPECTED_ATLAS_SIZE.width}x${EXPECTED_ATLAS_SIZE.height}; received ${size.width}x${size.height}`);
  }

  const destination = customAtlasPath(userDataPath);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, image.toPNG());
  fs.renameSync(temporary, destination);
  return destination;
}

function resetCustomAtlas(userDataPath) {
  const destination = customAtlasPath(userDataPath);
  fs.rmSync(destination, { force: true });
  return destination;
}

module.exports = {
  CUSTOM_ATLAS_ROUTE,
  EXPECTED_ATLAS_SIZE,
  customAtlasPath,
  installCustomAtlas,
  parseCustomAssetCommand,
  resetCustomAtlas,
  resolveAppearanceMode,
  resolveClientAsset,
};
