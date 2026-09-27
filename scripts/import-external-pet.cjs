// Import externally sourced strips through the EXACT production pipeline and
// install into the real app userData. Run: npx electron scripts/import-external-pet.cjs
const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const STRIPS = {
  idle: String(process.argv[2] || ""),
  waving: String(process.argv[3] || ""),
  jumping: String(process.argv[4] || ""),
  failed: String(process.argv[5] || ""),
  waiting: String(process.argv[6] || ""),
  running: String(process.argv[7] || ""),
  review: String(process.argv[8] || ""),
};

async function main() {
  const { assembleQPet } = require("../electron/qpet.cjs");
  const missing = Object.entries(STRIPS).filter(([, value]) => !value || !fs.existsSync(value));
  if (missing.length) {
    console.error("MISSING:", missing.map(([key]) => key).join(","));
    app.exit(2);
    return;
  }
  const result = await assembleQPet({
    strips: STRIPS,
    userDataPath: app.getPath("userData"),
    deps: {
      nativeImage: require("electron").nativeImage,
      ort: require("onnxruntime-node"),
      modelPath: path.join(__dirname, "..", "electron", "models", "u2netp.onnx"),
      onProgress: (progress) => console.log(`[${progress.done}/${progress.total}] ${progress.message}`),
    },
  });
  console.log("IMPORT_OK", JSON.stringify({ candidate: result.candidatePath, userData: app.getPath("userData") }));
  app.exit(0);
}

app.whenReady().then(main).catch((error) => {
  console.error("IMPORT_FAIL:", error.message);
  app.exit(1);
});
