const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  customAtlasPath,
  installCustomAtlas,
  parseCustomAssetCommand,
  resetCustomAtlas,
  resolveClientAsset,
} = require("./customAssets.cjs");
const { atlasFeedback } = require("./atlas-feedback.cjs");
const { isPetHitTarget } = require("./pet-hit-area.cjs");

const isDev = process.argv.includes("--dev");
const shouldCapture = process.argv.includes("--capture");
const startupDiag = process.env.PET_STARTUP_DIAG === "1";
const userDataOverride = process.env.PET_USER_DATA_DIR;
if (userDataOverride) {
  app.setPath("userData", path.resolve(userDataOverride));
}
let mainWindow;
let dashboardWindow;
let tray;
let savePositionTimer;
let interactionMode = { menuOpen: false };
let moveByCalls = 0;
let hitTestTimer;
let satietyTimer;
let progressionModule;
let mouseIgnored = null;
let nativeDrag = null;
let nativeDragWatchdog = null;
let quitting = false;
let dashboardRequested = false;
let dashboardRequestedTab = "home";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "pet",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-pet.log"), line);
  } catch {
    // Logging must never block app startup.
  }
}

function assetPath(...parts) {
  if (app.isPackaged) return path.join(process.resourcesPath, "assets", ...parts);
  return path.join(__dirname, "..", "public", "assets", ...parts);
}

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "shortcut-icon.ico")
    : path.join(__dirname, "..", "launcher", "shortcut-icon.ico");
}

function clampPosition(x, y, pointerPoint = null) {
  const anchor = Number.isFinite(pointerPoint?.x) && Number.isFinite(pointerPoint?.y)
    ? { x: Math.round(pointerPoint.x), y: Math.round(pointerPoint.y) }
    : { x: Math.round(x + 125), y: Math.round(y + 155) };
  const display = screen.getDisplayNearestPoint(anchor);
  const area = display.workArea;
  // The BrowserWindow is wider/taller than the painted character. Keep a small
  // part of the character visible so it can reach the edges without getting lost.
  // The generous allowance also keeps dragging usable on high-DPI and multi-monitor layouts.
  const characterBounds = { left: 48, right: 220, top: 52, bottom: 316 };
  const minVisible = 72;
  const minX = area.x - (characterBounds.right - minVisible);
  const maxX = area.x + area.width - (characterBounds.left + minVisible);
  const minY = area.y - (characterBounds.bottom - minVisible);
  const maxY = area.y + area.height - (characterBounds.top + minVisible);
  return {
    x: Math.min(Math.max(Math.round(x), minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(Math.round(y), minY), Math.max(minY, maxY)),
  };
}

function stateFile() {
  return path.join(app.getPath("userData"), "pet-state.json");
}

function progressSaveFile() {
  return path.join(app.getPath("userData"), "pet-save-v1.json");
}

async function getProgressionModule() {
  if (!progressionModule) {
    const moduleUrl = pathToFileURL(path.join(__dirname, "..", "src", "progression.js")).href;
    progressionModule = import(moduleUrl);
  }
  return progressionModule;
}

function readProgressSave() {
  try {
    return JSON.parse(fs.readFileSync(progressSaveFile(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      try {
        fs.renameSync(progressSaveFile(), `${progressSaveFile()}.corrupt-${Date.now()}`);
      } catch {
        // Keep startup available if recovery-copying a damaged save fails.
      }
    }
    return null;
  }
}

function writeProgressSave(save) {
  const destination = progressSaveFile();
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(save), "utf8");
  fs.renameSync(temporary, destination);
}

function broadcastProgressSave(save) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("pet:save-changed", save);
  }
}

function loadPosition(fallback) {
  if (shouldCapture) return fallback;
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clampPosition(saved.x, saved.y);
  } catch {
    // First launch has no saved position.
  }
  return fallback;
}

function savePosition() {
  if (!mainWindow || shouldCapture) return;
  const { x, y } = mainWindow.getBounds();
  fs.writeFileSync(stateFile(), JSON.stringify({ x, y }));
}

function isPointInteractive(point) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return false;
  if (interactionMode.dragging) return true;
  const bounds = mainWindow.getBounds();
  const localX = point.x - bounds.x;
  const localY = point.y - bounds.y;
    // Cover the full painted bounds of the atlas, gesture sheets, and legacy poses
    // so a drag can start from the hair, dress, hands, or shoes in every state.
    // A narrow gutter at each transparent window edge remains click-through.
    const character = isPetHitTarget(localX, localY);
  const menu = interactionMode.menuOpen && localX >= 0 && localX <= 64 && localY >= 0 && localY <= bounds.height;
  const playShortcut = localX >= 6 && localX <= 70 && localY >= 76 && localY <= 114;
  return character || menu || playShortcut;
}

function updateMousePassthrough() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const shouldReceiveMouse = isPointInteractive(screen.getCursorScreenPoint());
  const nextIgnored = !shouldReceiveMouse;
  if (mouseIgnored === nextIgnored) return;
  mainWindow.setIgnoreMouseEvents(nextIgnored, { forward: true });
  mouseIgnored = nextIgnored;
}

function stopNativeDrag() {
  const wasDragging = Boolean(nativeDrag);
  if (nativeDrag) {
    const sortedGaps = [...nativeDrag.gaps].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedGaps.length * 0.95) - 1);
    const sortedInputs = [...nativeDrag.inputLatencies].sort((a, b) => a - b);
    const p95InputIndex = Math.max(0, Math.ceil(sortedInputs.length * 0.95) - 1);
    writeLog(`native-drag durationMs=${Date.now() - nativeDrag.startedAt} moves=${nativeDrag.moves} p95InputMs=${sortedInputs[p95InputIndex] || 0} maxInputMs=${Math.max(0, ...sortedInputs)} p95GapMs=${sortedGaps[p95Index] || 0} maxGapMs=${nativeDrag.maxGapMs}`);
  }
  nativeDrag = null;
  clearTimeout(nativeDragWatchdog);
  nativeDragWatchdog = null;
  interactionMode.dragging = false;
  updateMousePassthrough();
  if (wasDragging) savePosition();
}

function writeCustomAssetStatus(statusPath, result) {
  if (!statusPath) return;
  try {
    const destination = path.resolve(statusPath);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(result), "utf8");
    fs.renameSync(temporary, destination);
  } catch (error) {
    writeLog(`custom-asset status write failed: ${error.message}`);
  }
}

function runCustomAssetCommand(command) {
  try {
    const destination = command.type === "install"
      ? installCustomAtlas(command.sourcePath, app.getPath("userData"), nativeImage)
      : resetCustomAtlas(app.getPath("userData"));
    const result = {
      ok: true,
      type: command.type,
      message: command.type === "install" ? "专属动作已安装。" : "已恢复默认动作。",
    };
    writeLog(`custom-atlas ${command.type} completed: ${destination}`);
    writeCustomAssetStatus(command.statusPath, result);
    return result;
  } catch (error) {
    const result = { ok: false, type: command.type, error: error.message };
    writeLog(`custom-atlas ${command.type} failed: ${error.stack || error.message}`);
    writeCustomAssetStatus(command.statusPath, result);
    return result;
  }
}

function reloadPetWindows() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.reloadIgnoringCache();
}

function installAtlasFromPath(sourcePath) {
  try {
    installCustomAtlas(sourcePath, app.getPath("userData"), nativeImage);
    writeLog(`custom-atlas install completed (in-app): ${sourcePath}`);
    reloadPetWindows();
    return { ok: true, message: "新形象已安装，桌宠马上换新造型。" };
  } catch (error) {
    writeLog(`custom-atlas install failed (in-app): ${error.message}`);
    return { ok: false, error: atlasFeedback(error) };
  }
}

function resetAtlasToDefault() {
  try {
    resetCustomAtlas(app.getPath("userData"));
    writeLog("custom-atlas reset completed (in-app)");
    reloadPetWindows();
    return { ok: true, message: "已恢复默认形象。" };
  } catch (error) {
    writeLog(`custom-atlas reset failed (in-app): ${error.message}`);
    return { ok: false, error: atlasFeedback(error) };
  }
}

async function chooseAndInstallAtlas() {
  const parent = dashboardWindow && !dashboardWindow.isDestroyed()
    ? dashboardWindow
    : mainWindow;
  const choice = await dialog.showOpenDialog(parent, {
    title: "选择动作图集 PNG",
    filters: [{ name: "动作图集 PNG", extensions: ["png"] }],
    properties: ["openFile"],
  });
  if (choice.canceled || choice.filePaths.length === 0) return { ok: false, canceled: true };
  return installAtlasFromPath(choice.filePaths[0]);
}

function registerAssetProtocol() {
  const root = path.resolve(__dirname, "..", "dist", "client");
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return protocol.handle("pet", async (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = requestUrl.pathname.replace(/^\/+/, "") || "index.html";
    const filePath = resolveClientAsset(relativePath, root, app.getPath("userData"));
    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const body = await fs.promises.readFile(filePath);
      const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      return new Response(body, { headers: { "content-type": contentType } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createWindow() {
  writeLog(`createWindow packaged=${app.isPackaged} dev=${isDev}`);
  const area = screen.getPrimaryDisplay().workArea;
  const initialPosition = {
    x: area.x + area.width - 290,
    y: area.y + area.height - 350,
  };
  mainWindow = new BrowserWindow({
    width: 250,
    height: 310,
    x: initialPosition.x,
    y: initialPosition.y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    icon: appIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const savedPosition = loadPosition(initialPosition);
  mainWindow.setPosition(savedPosition.x, savedPosition.y, false);
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  let windowShown = false;
  const showWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (windowShown) return;
    windowShown = true;
    mainWindow.showInactive();
    updateMousePassthrough();
    writeLog(`window shown at ${JSON.stringify(mainWindow.getBounds())}`);
  };

  if (startupDiag) {
    mainWindow.webContents.on("did-start-loading", () => writeLog("pet did-start-loading"));
    mainWindow.webContents.on("dom-ready", () => writeLog("pet dom-ready"));
    mainWindow.once("ready-to-show", () => writeLog("pet ready-to-show"));
  }
  mainWindow.webContents.on("did-finish-load", () => {
    writeLog(`did-finish-load ${mainWindow.webContents.getURL()}`);
    showWindow();
    clearInterval(hitTestTimer);
    hitTestTimer = setInterval(updateMousePassthrough, 20);
    if (!shouldCapture) setTimeout(() => { if (!quitting) ensureDashboard(); }, 1200);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    writeLog(`did-fail-load code=${code} description=${description} url=${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeLog(`render-process-gone ${JSON.stringify(details)}`);
  });
  mainWindow.on("unresponsive", () => writeLog("window unresponsive"));
  mainWindow.on("closed", () => {
    stopNativeDrag();
    clearInterval(hitTestTimer);
    writeLog("window closed");
    mainWindow = null;
  });

  const loadPromise = mainWindow.loadURL(createAppUrl("pet"));
  loadPromise.catch((error) => writeLog(`load rejected ${error.stack || error.message}`));
  setTimeout(() => { if (!windowShown) writeLog("window still loading after 10 seconds"); }, 10000);
  mainWindow.on("moved", () => {
    if (nativeDrag) return;
    clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(savePosition, 250);
  });

  if (shouldCapture) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        let captureFailed = false;
        try {
          const outputDir = app.isPackaged
            ? path.join(app.getPath("userData"), "capture-artifacts")
            : path.join(__dirname, "..", "artifacts");
          fs.mkdirSync(outputDir, { recursive: true });
          const capture = async (name) => {
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.join(outputDir, name), image.toPNG());
          };
          const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
          const waitUntil = async (predicate, timeout = 5000) => {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeout) {
              if (predicate()) return Date.now() - startedAt;
              await pause(40);
            }
            throw new Error(`Timed out waiting for desktop window after ${timeout} ms`);
          };
          const point = { x: 125, y: 190 };

          await capture("desktop-pet.png");
          const playShortcut = await mainWindow.webContents.executeJavaScript(`(() => {
            const button = document.querySelector(".play-shortcut");
            const rect = button?.getBoundingClientRect();
            return { label: button?.textContent?.trim(), visible: Boolean(rect && rect.width >= 50 && rect.height >= 32), bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
          })()`);
          fs.writeFileSync(path.join(outputDir, "play-shortcut-check.json"), JSON.stringify(playShortcut, null, 2));
          if (!playShortcut.visible || playShortcut.label !== "玩法") throw new Error(`Play shortcut is missing: ${JSON.stringify(playShortcut)}`);

          mainWindow.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
          mainWindow.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
          await pause(250);
          await capture("desktop-pet-click.png");
          const textLayout = await mainWindow.webContents.executeJavaScript(`(() => {
            const bubble = document.querySelector(".speech-bubble")?.getBoundingClientRect();
            const sprite = document.querySelector(".character-stage .pet-atlas-sprite, .character-stage > img")?.getBoundingClientRect();
            const shortcut = document.querySelector(".play-shortcut")?.getBoundingClientRect();
            return {
              bubbleBottom: bubble?.bottom ?? null,
              shortcutTop: shortcut?.top ?? null,
              shortcutBottom: shortcut?.bottom ?? null,
              characterTop: sprite?.top ?? null,
              textClearsCharacter: Boolean(bubble && sprite && bubble.bottom <= sprite.top),
              shortcutClearsCharacter: Boolean(shortcut && sprite && bubble && bubble.bottom <= shortcut.top && shortcut.bottom <= sprite.top),
            };
          })()`);
          fs.writeFileSync(path.join(outputDir, "text-layout-check.json"), JSON.stringify(textLayout, null, 2));
          if (!textLayout.textClearsCharacter || !textLayout.shortcutClearsCharacter) throw new Error(`Pet text or shortcut overlaps the character: ${JSON.stringify(textLayout)}`);

          mainWindow.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "right", clickCount: 1 });
          mainWindow.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "right", clickCount: 1 });
          await pause(250);
          await capture("desktop-pet-menu.png");

          mainWindow.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "right", clickCount: 1 });
          mainWindow.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "right", clickCount: 1 });
          await pause(100);
          const initialBounds = mainWindow.getBounds();
          const dragMoveCountBefore = moveByCalls;
          const dragEventCount = 48;
          const dragStartScreen = { x: initialBounds.x + point.x, y: initialBounds.y + point.y };
          const rendererDrag = await mainWindow.webContents.executeJavaScript(`(() => new Promise((resolve) => {
            const stage = document.querySelector(".character-stage");
            if (!stage || typeof PointerEvent !== "function") return resolve({ ok: false, reason: "pointer-event-unavailable" });
            const count = ${dragEventCount};
            let sent = 0;
            const makeEvent = (type, index) => new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 73,
              pointerType: "mouse",
              isPrimary: true,
              button: type === "pointermove" ? -1 : 0,
              buttons: type === "pointerup" ? 0 : 1,
              clientX: ${point.x} + index,
              clientY: ${point.y} + Math.round(index / 2),
              screenX: ${dragStartScreen.x} + index,
              screenY: ${dragStartScreen.y} + Math.round(index / 2),
            });
            stage.dispatchEvent(makeEvent("pointerdown", 0));
            const sendFrame = () => {
              const frameEnd = Math.min(sent + 3, count);
              while (sent < frameEnd) {
                sent += 1;
                window.dispatchEvent(makeEvent("pointermove", sent));
              }
              if (sent < count) requestAnimationFrame(sendFrame);
              else {
                window.dispatchEvent(makeEvent("pointerup", sent));
                resolve({ ok: true, pointerEvents: sent });
              }
            };
            requestAnimationFrame(sendFrame);
          }))()`);
          if (!rendererDrag?.ok) throw new Error(`Could not dispatch packaged renderer pointer drag: ${JSON.stringify(rendererDrag)}`);
          await pause(250);
          const finalBounds = mainWindow.getBounds();
          const dragCheck = {
            initialBounds,
            finalBounds,
            expectedDelta: { x: dragEventCount, y: Math.round(dragEventCount / 2) },
            actualDelta: { x: finalBounds.x - initialBounds.x, y: finalBounds.y - initialBounds.y },
            sizeDelta: { width: finalBounds.width - initialBounds.width, height: finalBounds.height - initialBounds.height },
            pointerEvents: rendererDrag.pointerEvents,
            movementMessages: moveByCalls - dragMoveCountBefore,
            moved: initialBounds.x !== finalBounds.x || initialBounds.y !== finalBounds.y,
          };
          fs.writeFileSync(
            path.join(outputDir, "interaction-check.json"),
            JSON.stringify({
              click: true,
              contextMenu: true,
              drag: dragCheck,
            }, null, 2),
          );
          if (!dragCheck.moved || dragCheck.movementMessages >= dragEventCount
            || Math.abs(dragCheck.actualDelta.x - dragCheck.expectedDelta.x) > 2
            || Math.abs(dragCheck.actualDelta.y - dragCheck.expectedDelta.y) > 2
            || Math.abs(dragCheck.sizeDelta.width) > 2
            || Math.abs(dragCheck.sizeDelta.height) > 2) {
            throw new Error(`Packaged pointer drag was not coalesced correctly: ${JSON.stringify(dragCheck)}`);
          }
          await capture("desktop-pet-drag.png");

          const menuAlreadyOpen = await mainWindow.webContents.executeJavaScript(`Boolean(document.querySelector(".pet-menu"))`);
          if (!menuAlreadyOpen) {
            mainWindow.webContents.sendInputEvent({ type: "mouseDown", ...point, button: "right", clickCount: 1 });
            mainWindow.webContents.sendInputEvent({ type: "mouseUp", ...point, button: "right", clickCount: 1 });
          }
          await pause(120);
          const menuOpened = await mainWindow.webContents.executeJavaScript(`Boolean(document.querySelector(".pet-menu"))`);
          if (!menuOpened) throw new Error("Packaged context menu did not open");
          await mainWindow.webContents.executeJavaScript('Array.from(document.querySelectorAll(".pet-menu button")).find((button) => button.title === "玩法")?.click()');
          await pause(180);
          if (!dashboardWindow) throw new Error("The pet menu did not open the companion dashboard");
          if (dashboardWindow.webContents.isLoading()) {
            await new Promise((resolve) => dashboardWindow.webContents.once("did-finish-load", resolve));
          }
          await pause(300);
          const menuRoutedToPlay = await dashboardWindow.webContents.executeJavaScript('Boolean(document.querySelector("[data-dashboard-tab=play].active"))');
          const petOverlayAbsent = await mainWindow.webContents.executeJavaScript('!document.querySelector(".activity-panel, .star-hunt-target-float")');
          if (!menuRoutedToPlay || !petOverlayAbsent) throw new Error("Pet menu/dashboard routing failed: " + JSON.stringify({ menuRoutedToPlay, petOverlayAbsent }));
          dashboardWindow.close();
          await pause(80);
          mainWindow.setIgnoreMouseEvents(false, { forward: true });
          mouseIgnored = false;
          const playShortcutPoint = await mainWindow.webContents.executeJavaScript(`(() => {
            const bounds = document.querySelector(".play-shortcut")?.getBoundingClientRect();
            return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null;
          })()`);
          if (!playShortcutPoint) throw new Error("The play shortcut is missing");
          mainWindow.webContents.sendInputEvent({ type: "mouseDown", ...playShortcutPoint, button: "left", clickCount: 1 });
          mainWindow.webContents.sendInputEvent({ type: "mouseUp", ...playShortcutPoint, button: "left", clickCount: 1 });
          const dashboardReopenMs = await waitUntil(() => dashboardWindow && !dashboardWindow.isDestroyed() && dashboardWindow.isVisible());
          fs.writeFileSync(path.join(outputDir, "dashboard-reopen-check.json"), JSON.stringify({ visible: true, elapsedMs: dashboardReopenMs }, null, 2));
          const captureDashboard = async (name) => {
            const image = await dashboardWindow.webContents.capturePage();
            fs.writeFileSync(path.join(outputDir, name), image.toPNG());
          };
          await captureDashboard("dashboard-menu-play.png");
          await dashboardWindow.webContents.executeJavaScript('document.querySelector("[data-dashboard-tab=home]")?.click()');
          await pause(120);
          await captureDashboard("dashboard-home.png");
          const feedBefore = await dashboardWindow.webContents.executeJavaScript("window.pet.loadSave()");
          await dashboardWindow.webContents.executeJavaScript('document.querySelector(".hero-quick-actions button")?.click()');
          await pause(420);
          const feedCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const save = await window.pet.loadSave();
            return { satiety: save.needs.satiety, biscuitCount: save.inventory.foods.biscuit, version: save.version };
          })()`);
          const expectedSatiety = Math.min(100, feedBefore.needs.satiety + 25);
          if (feedCheck.version !== 3 || feedCheck.satiety !== expectedSatiety || feedCheck.biscuitCount !== feedBefore.inventory.foods.biscuit - 1) {
            throw new Error(`Packaged feed interaction or save migration failed: ${JSON.stringify({ before: feedBefore, after: feedCheck })}`);
          }
          fs.writeFileSync(path.join(outputDir, "feed-check.json"), JSON.stringify(feedCheck, null, 2));
          await capture("desktop-pet-feed.png");
          await dashboardWindow.webContents.executeJavaScript('document.querySelectorAll(".hero-quick-actions button")[1]?.click()');
          await pause(420);
          await capture("desktop-pet-pet.png");
          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("互动玩法"))?.click()`,
          );
          await pause(120);
          await captureDashboard("dashboard-play.png");
          await dashboardWindow.webContents.executeJavaScript('document.querySelector(".rps-card .card-cta")?.click()');
          await pause(80);
          await dashboardWindow.webContents.executeJavaScript('Array.from(document.querySelectorAll(".rps-inline button")).find((button) => button.textContent === "石头")?.click()');
          const rpsPoseCheck = await mainWindow.webContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 100; attempt += 1) {
              const sprite = document.querySelector('.character-stage .pet-atlas-sprite[class*="action-rps-"]');
              const action = sprite && Array.from(sprite.classList).find((name) => /^action-rps-(rock|scissors|paper)$/.test(name));
              if (sprite && action) {
                const background = getComputedStyle(sprite).backgroundImage;
                const url = background.match(/url\\(["']?(.*?)["']?\\)/)?.[1];
                const image = new Image();
                image.src = url ? new URL(url, document.baseURI).href : "";
                try { await image.decode(); } catch { return { visible: false, action, overlay: Boolean(document.querySelector(".rps-gesture-overlay")), background, imageLoaded: false }; }
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const bounds = sprite.getBoundingClientRect();
                return { visible: true, action, overlay: Boolean(document.querySelector(".rps-gesture-overlay")), background, imageLoaded: image.naturalWidth > 0, bounds: { width: bounds.width, height: bounds.height } };
              }
              await pause(32);
            }
            return { visible: false, action: "", overlay: false, background: "", imageLoaded: false, bounds: null };
          })()`);
          if (!rpsPoseCheck.visible || !rpsPoseCheck.imageLoaded || rpsPoseCheck.bounds?.width < 150 || rpsPoseCheck.bounds?.height < 200) {
            throw new Error(`The pet did not visibly show a full-body RPS pose: ${JSON.stringify(rpsPoseCheck)}`);
          }
          fs.writeFileSync(path.join(outputDir, "rps-pose-check.json"), JSON.stringify(rpsPoseCheck, null, 2));
          await capture("desktop-pet-rps-reveal.png");
          for (const gesture of ["rock", "scissors", "paper"]) {
            await mainWindow.webContents.executeJavaScript(`window.pet.playAction("rps-${gesture}")`);
            await pause(220);
            await capture(`desktop-pet-rps-${gesture}.png`);
          }
          await captureDashboard("dashboard-rps-reveal.png");
          const rpsCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 80; attempt += 1) {
              const result = document.querySelector(".rps-result");
              if (result) return { visible: true, handCount: result.querySelectorAll("span").length, hasOutcome: Boolean(result.querySelector("strong")?.textContent) };
              await pause(40);
            }
            return { visible: false, handCount: 0, hasOutcome: false };
          })()`);
          if (!rpsCheck.visible || rpsCheck.handCount !== 2 || !rpsCheck.hasOutcome) throw new Error(`Packaged rock-paper-scissors feedback failed: ${JSON.stringify(rpsCheck)}`);
          fs.writeFileSync(path.join(outputDir, "rps-check.json"), JSON.stringify(rpsCheck, null, 2));
          await captureDashboard("dashboard-rps.png");
          await capture("desktop-pet-rps.png");
          const hugClicked = await dashboardWindow.webContents.executeJavaScript(`(() => {
            const card = Array.from(document.querySelectorAll(".play-card")).find((item) => item.querySelector("h2")?.textContent.includes("抱抱互动"));
            card?.querySelector("button")?.click();
            return Boolean(card);
          })()`);
          if (!hugClicked) throw new Error("Packaged hug interaction is missing");
          await pause(420);
          await capture("desktop-pet-hug.png");
          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("文字聊天"))?.click()`,
          );
          await pause(120);
          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".chat-suggestions button")).find((button) => button.textContent.includes("给我打气"))?.click()`,
          );
          await pause(120);
          await captureDashboard("dashboard-chat-reply.png");

          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("动作收藏"))?.click()`,
          );
          await pause(140);
          await captureDashboard("dashboard-actions.png");
          const actionCheck = await dashboardWindow.webContents.executeJavaScript(`(() => {
            const actions = Array.from(document.querySelectorAll(".action-card:not(.legacy-action)"));
            const names = actions.map((button) => button.querySelector("strong")?.textContent?.trim());
            const rpsActionsPresent = ["猜拳 · 石头", "猜拳 · 剪刀", "猜拳 · 布"].every((name) => names.includes(name));
            return { count: actions.length, newActionsPresent: ["比心", "害羞", "庆祝"].every((name) => names.includes(name)), rpsActionsPresent };
          })()`);
          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".action-card")).find((button) => button.textContent.includes("庆祝"))?.click()`,
          );
          await pause(360);
          await capture("desktop-celebrate.png");

          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("记忆翻牌"))?.click()`,
          );
          await pause(140);
          await captureDashboard("dashboard-memory.png");
          const memoryCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const seen = new Map();
            const tested = new Set();
            let loops = 0;
            while (loops < 40) {
              loops += 1;
              let cards = Array.from(document.querySelectorAll(".memory-card"));
              if (cards.length !== 12) throw new Error("Expected a 12-card memory board");
              if (cards.every((card) => card.classList.contains("matched"))) break;
              const index = cards.findIndex((card, cardIndex) => !card.classList.contains("matched") && !card.classList.contains("revealed") && !tested.has(cardIndex));
              if (index < 0) {
                const pair = Array.from(seen.values()).find((indexes) => indexes.length === 2 && !cards[indexes[0]].classList.contains("matched"));
                if (!pair) throw new Error("Could not resolve the remaining memory pairs");
                cards[pair[0]].click(); await pause(25); cards[pair[1]].click(); await pause(45);
                continue;
              }
              cards[index].click(); await pause(25);
              const label = cards[index].getAttribute("aria-label");
              if (!label || label.startsWith("卡片 ")) throw new Error("A clicked memory card did not reveal");
              tested.add(index);
              const indexes = seen.get(label) || [];
              const known = indexes.find((cardIndex) => cardIndex !== index && !cards[cardIndex].classList.contains("matched"));
              if (known !== undefined) {
                cards[known].click(); await pause(25); cards[index].click(); await pause(50);
              } else {
                indexes.push(index); seen.set(label, indexes);
                cards = Array.from(document.querySelectorAll(".memory-card"));
                const second = cards.findIndex((card, cardIndex) => cardIndex !== index && !card.classList.contains("matched") && !card.classList.contains("revealed") && !tested.has(cardIndex));
                if (second >= 0) {
                  cards[second].click(); await pause(30);
                  const secondLabel = cards[second].getAttribute("aria-label");
                  if (secondLabel && !secondLabel.startsWith("卡片 ")) {
                    const secondIndexes = seen.get(secondLabel) || [];
                    secondIndexes.push(second); seen.set(secondLabel, secondIndexes);
                  }
                  tested.add(second);
                  const updated = Array.from(document.querySelectorAll(".memory-card"));
                  if (!updated[index].classList.contains("matched") && !updated[second].classList.contains("matched")) await pause(760);
                }
              }
            }
            const cards = Array.from(document.querySelectorAll(".memory-card"));
            await pause(150);
            const save = await window.pet.loadSave();
            return { cards: cards.length, matched: cards.filter((card) => card.classList.contains("matched")).length, complete: cards.every((card) => card.classList.contains("matched")), rewardClaimed: save.claims.some((claim) => claim.startsWith("memory-game:")), loops };
          })()`);
          if (!memoryCheck.complete || !memoryCheck.rewardClaimed) throw new Error(`Packaged memory game failed: ${JSON.stringify(memoryCheck)}`);
          fs.writeFileSync(path.join(outputDir, "memory-game-check.json"), JSON.stringify(memoryCheck, null, 2));
          await captureDashboard("dashboard-memory-complete.png");

          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("互动玩法"))?.click()`,
          );
          await pause(120);
          const beginStarHunt = await dashboardWindow.webContents.executeJavaScript(`(() => {
            const button = document.querySelector(".star-hunt-card .card-cta");
            if (!button) return false;
            button.click();
            return true;
          })()`);
          if (!beginStarHunt) throw new Error("Could not start the packaged star hunt");
          await pause(80);
          await captureDashboard("dashboard-star-hunt.png");
          const starCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            let hits = 0;
            for (; hits < 5; hits += 1) {
              const target = document.querySelector(".star-hunt-field .star-target");
              if (!target) throw new Error("Star target disappeared before five hits");
              target.click(); await pause(70);
            }
            await pause(150);
            const save = await window.pet.loadSave();
            const text = document.querySelector(".star-hunt-card p")?.textContent || "";
            return { hits, complete: text.includes("今天这轮完成啦"), rewardClaimed: save.claims.some((claim) => claim.startsWith("star-game:")) };
          })()`);
          if (!starCheck.complete || !starCheck.rewardClaimed) throw new Error(`Packaged star hunt failed: ${JSON.stringify(starCheck)}`);
          fs.writeFileSync(path.join(outputDir, "star-hunt-check.json"), JSON.stringify(starCheck, null, 2));
          await captureDashboard("dashboard-star-hunt-complete.png");
          fs.writeFileSync(path.join(outputDir, "action-check.json"), JSON.stringify(actionCheck, null, 2));
          if (actionCheck.count !== 18 || !actionCheck.newActionsPresent || !actionCheck.rpsActionsPresent) throw new Error(`Packaged action registry is incomplete: ${JSON.stringify(actionCheck)}`);

          await dashboardWindow.webContents.executeJavaScript('Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("互动玩法"))?.click()');
          await pause(100);
          await dashboardWindow.webContents.executeJavaScript('document.querySelector(".star-catch-card .card-cta")?.click()');
          await pause(100);
          const starCatchCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            for (let index = 0; index < 6; index += 1) {
              const target = document.querySelector(".star-catch-target");
              if (!target) throw new Error("The catch-stars game did not create a target");
              target.click(); await pause(45);
            }
            const score = Number(document.querySelector(".star-catch-status")?.textContent?.match(/得分 (\\d+)/)?.[1] || 0);
            return { score, targets: Boolean(document.querySelector(".star-catch-target")), active: document.querySelector(".star-catch-heading")?.textContent?.includes("剩余") };
          })()`);
          if (starCatchCheck.score < 6 || !starCatchCheck.targets || !starCatchCheck.active) throw new Error(`Packaged catch-stars play failed: ${JSON.stringify(starCatchCheck)}`);
          fs.writeFileSync(path.join(outputDir, "star-catch-check.json"), JSON.stringify(starCatchCheck, null, 2));
          await captureDashboard("dashboard-star-catch.png");

          await dashboardWindow.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".dashboard-tabs button")).find((button) => button.textContent.includes("徽章装扮"))?.click()`,
          );
          await pause(120);
          const wardrobeCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            for (let index = 0; index < 6; index += 1) await window.pet.applyProgressEvent("pet");
            await new Promise((resolve) => setTimeout(resolve, 160));
            const card = Array.from(document.querySelectorAll(".wardrobe-card")).find((item) => item.querySelector("strong")?.textContent === "樱花茶会");
            const button = card?.querySelector("button");
            if (!button || button.disabled) throw new Error("The rose outfit was not available for the test save");
            button.click();
            await new Promise((resolve) => setTimeout(resolve, 180));
            card.querySelector("button")?.click();
            await new Promise((resolve) => setTimeout(resolve, 180));
            const save = await window.pet.loadSave();
            return { outfit: save.progression.equipped.outfit, owned: save.progression.collection.includes("outfit-rose"), stars: save.currencies.stars, affection: save.stats.affection };
          })()`);
          if (wardrobeCheck.outfit !== "rose" || !wardrobeCheck.owned || wardrobeCheck.affection < 35) throw new Error(`Packaged wardrobe equip failed: ${JSON.stringify(wardrobeCheck)}`);
          fs.writeFileSync(path.join(outputDir, "wardrobe-check.json"), JSON.stringify(wardrobeCheck, null, 2));
          await captureDashboard("dashboard-collection-rose.png");
          await capture("desktop-pet-rose-outfit.png");
          await dashboardWindow.webContents.executeJavaScript('document.querySelector(".action-collection-section")?.scrollIntoView({ block: "start" })');
          await pause(140);
          const actionCollectionCheck = await dashboardWindow.webContents.executeJavaScript(`(async () => {
            const card = document.querySelector('.action-collection-card[data-action-id="rps-scissors"]');
            if (!card) return { cardPresent: false, total: 0, collected: false };
            card.click();
            await new Promise((resolve) => setTimeout(resolve, 220));
            const save = await window.pet.loadSave();
            return {
              cardPresent: true,
              total: document.querySelectorAll(".action-collection-card").length,
              collected: save.progression.actionCollection.includes("rps-scissors"),
              badgeCount: save.progression.badges.length,
              wardrobeCount: save.progression.collection.length,
            };
          })()`);
          if (!actionCollectionCheck.cardPresent || actionCollectionCheck.total !== 20 || !actionCollectionCheck.collected) {
            throw new Error(`Offline action collection failed: ${JSON.stringify(actionCollectionCheck)}`);
          }
          fs.writeFileSync(path.join(outputDir, "action-collection-check.json"), JSON.stringify(actionCollectionCheck, null, 2));
          await captureDashboard("dashboard-action-collection.png");
        } catch (error) {
          captureFailed = true;
          writeLog(`capture failed ${error.stack || error.message}`);
        } finally {
          if (captureFailed) app.exit(1);
          else app.quit();
        }
      }, 1200);
    });
  }
}

function createAppUrl(windowType, tab = "home") {
  const base = isDev ? "http://127.0.0.1:4173/" : "pet://app/index.html";
  if (!windowType || windowType === "pet") return shouldCapture ? `${base}?capture=1` : base;
  const query = new URLSearchParams({ window: windowType });
  if (windowType === "dashboard" && tab !== "home") query.set("tab", tab);
  return `${base}?${query}`;
}

function activateDashboardTab(tab) {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  dashboardWindow.webContents.executeJavaScript(
    `document.querySelector('[data-dashboard-tab="${tab}"]')?.click()`,
  ).catch((error) => writeLog(`dashboard tab failed ${error.message}`));
}

function ensureDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return;
  dashboardWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#faf4f5",
    title: "小小的她 · 陪伴面板",
    icon: appIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  dashboardWindow.once("ready-to-show", () => {
    writeLog("dashboard ready-to-show");
  });
  const createdDashboard = dashboardWindow;
  createdDashboard.webContents.on("did-finish-load", () => {
    writeLog("dashboard did-finish-load");
    if (dashboardRequested && !createdDashboard.isDestroyed()) {
      createdDashboard.show();
      createdDashboard.focus();
      activateDashboardTab(dashboardRequestedTab);
    }
  });
  createdDashboard.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    dashboardRequested = false;
    createdDashboard.hide();
  });
  createdDashboard.on("closed", () => {
    if (dashboardWindow === createdDashboard) dashboardWindow = null;
  });
  createdDashboard.loadURL(createAppUrl("dashboard", "home")).catch((error) => writeLog(`dashboard load rejected ${error.stack || error.message}`));
}

function openDashboard(tab = "home") {
  const safeTab = ["home", "play", "memory", "actions", "collection", "chat"].includes(tab) ? tab : "home";
  writeLog(`openDashboard requested tab=${safeTab}`);
  dashboardRequested = true;
  dashboardRequestedTab = safeTab;
  ensureDashboard();
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  if (dashboardWindow.webContents.isLoading()) {
    writeLog("dashboard open deferred until load completes");
    return;
  }
  if (dashboardWindow.isMinimized()) dashboardWindow.restore();
  dashboardWindow.show();
  dashboardWindow.focus();
  activateDashboardTab(safeTab);
  writeLog(`dashboard visible=${dashboardWindow.isVisible()}`);
}

function createTray() {
  const icon = nativeImage.createFromPath(assetPath("brand", "mascot-icon.png")).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("小小的她 · 桌面陪伴");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示小小的她", click: () => mainWindow?.showInactive() },
    { label: "打开陪伴面板", click: () => openDashboard("home") },
    { label: "打开互动玩法", click: () => openDashboard("play") },
    { type: "separator" },
    { label: "更换形象…", click: () => { chooseAndInstallAtlas(); } },
    { label: "恢复默认形象", click: () => { resetAtlasToDefault(); } },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
  tray.on("double-click", () => mainWindow?.showInactive());
}

ipcMain.handle("pet:get-bounds", () => mainWindow?.getBounds());
ipcMain.on("pet:preload-ready", () => { if (startupDiag) writeLog("pet preload-ready"); });
ipcMain.on("pet:move-by", (_event, movement) => {
  if (!mainWindow || mainWindow.isDestroyed() || !nativeDrag
    || !Number.isFinite(movement?.dx) || !Number.isFinite(movement?.dy)) return;
  moveByCalls += 1;
  if (Number.isFinite(movement.inputAt)) {
    nativeDrag.inputLatencies.push(Math.max(0, Date.now() - movement.inputAt));
  }
  const next = clampPosition(
    nativeDrag.origin.x + movement.dx,
    nativeDrag.origin.y + movement.dy,
    movement.pointerPoint,
  );
  const current = mainWindow.getBounds();
  if (current.x !== next.x || current.y !== next.y) {
    // setPosition grows transparent windows one pixel per call under Windows
    // display scaling; fixed-size bounds keep the hit area and drag response steady.
    mainWindow.setBounds({
      x: next.x,
      y: next.y,
      width: nativeDrag.origin.width,
      height: nativeDrag.origin.height,
    }, false);
    if (nativeDrag) {
      const now = Date.now();
      const gap = now - nativeDrag.lastMoveAt;
      if (nativeDrag.moves > 0) nativeDrag.gaps.push(gap);
      nativeDrag.maxGapMs = Math.max(nativeDrag.maxGapMs, gap);
      nativeDrag.lastMoveAt = now;
      nativeDrag.moves += 1;
    }
  }
});
ipcMain.on("pet:nudge", (_event, movement) => {
  if (!mainWindow || !Number.isFinite(movement?.dx) || !Number.isFinite(movement?.dy)) return;
  const current = mainWindow.getBounds();
  const next = clampPosition(current.x + movement.dx, current.y + movement.dy);
  mainWindow.setBounds({ x: next.x, y: next.y, width: current.width, height: current.height }, true);
});
ipcMain.on("pet:interaction-mode", (_event, mode) => {
  interactionMode.menuOpen = Boolean(mode?.menuOpen);
  updateMousePassthrough();
});
ipcMain.on("pet:drag-start", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (nativeDrag) stopNativeDrag();
  clearTimeout(savePositionTimer);
  savePositionTimer = null;
  const now = Date.now();
  const { x, y, width, height } = mainWindow.getBounds();
  nativeDrag = {
    startedAt: now,
    lastMoveAt: now,
    origin: { x, y, width, height },
    maxGapMs: 0,
    moves: 0,
    gaps: [],
    inputLatencies: [],
  };
  interactionMode.dragging = true;
  updateMousePassthrough();
  nativeDragWatchdog = setTimeout(stopNativeDrag, 30000);
});
ipcMain.on("pet:drag-end", stopNativeDrag);
ipcMain.handle("pet:cursor-point", () => screen.getCursorScreenPoint());
ipcMain.on("pet:open-dashboard", (_event, tab) => openDashboard(typeof tab === "string" ? tab : "home"));
ipcMain.on("pet:close-dashboard", () => dashboardWindow?.close());
ipcMain.on("pet:play-action", (_event, request) => {
  const validString = typeof request === "string" && request.length > 0 && request.length < 80;
  const validRps = request && typeof request === "object" && request.type === "rps"
    && ["countdown", "reveal", "result", "cancel"].includes(request.phase)
    && typeof request.roundId === "string" && request.roundId.length < 120;
  if ((!validString && !validRps) || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pet:action-request", request);
  mainWindow.showInactive();
});
async function loadNormalizedProgressSave() {
  const { migrateSave } = await getProgressionModule();
  const raw = readProgressSave();
  const normalized = migrateSave(raw, null, new Date());
  if (!raw || raw.version !== normalized.version || JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeProgressSave(normalized);
  }
  return normalized;
}

ipcMain.handle("pet:load-save", () => readProgressSave() ? loadNormalizedProgressSave() : null);
ipcMain.handle("pet:seed-save", async (_event, candidate) => {
  if (readProgressSave()) return loadNormalizedProgressSave();
  const { migrateSave } = await getProgressionModule();
  const normalized = migrateSave(candidate, null, new Date());
  writeProgressSave(normalized);
  broadcastProgressSave(normalized);
  return normalized;
});
ipcMain.handle("pet:apply-progress-event", async (_event, event) => {
  const { applyProgressEvent, migrateSave } = await getProgressionModule();
  const current = await loadNormalizedProgressSave() || migrateSave(null, null, new Date());
  const result = applyProgressEvent(current, event, new Date());
  if (result.applied) {
    writeProgressSave(result.save);
    broadcastProgressSave(result.save);
  }
  return result;
});

async function persistSatietyMinute() {
  try {
    const { applyProgressEvent } = await getProgressionModule();
    const current = await loadNormalizedProgressSave();
    const result = applyProgressEvent(current, { type: "satietyTick", elapsedMs: 60_000 }, new Date());
    if (!result.applied) return;
    writeProgressSave(result.save);
    broadcastProgressSave(result.save);
  } catch (error) {
    writeLog(`satiety tick failed ${error.message}`);
  }
}

function startSatietyClock() {
  clearInterval(satietyTimer);
  satietyTimer = setInterval(persistSatietyMinute, 60_000);
}
ipcMain.on("pet:hide", () => mainWindow?.hide());
ipcMain.on("pet:quit", () => app.quit());
ipcMain.handle("pet:choose-custom-atlas", () => chooseAndInstallAtlas());
ipcMain.handle("pet:install-custom-atlas", (_event, payload) => {
  const sourcePath = typeof payload === "string" ? payload : payload?.path;
  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    return { ok: false, error: "没有拿到图集文件路径，请重新选择或拖入 PNG 文件。" };
  }
  return installAtlasFromPath(sourcePath);
});
ipcMain.handle("pet:reset-custom-atlas", () => resetAtlasToDefault());
ipcMain.handle("pet:custom-atlas-status", () => ({
  custom: fs.existsSync(customAtlasPath(app.getPath("userData"))),
}));

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    let command;
    try {
      command = parseCustomAssetCommand(commandLine);
    } catch (error) {
      writeLog(`custom-atlas command rejected: ${error.message}`);
      return;
    }
    if (command) {
      const result = runCustomAssetCommand(command);
      if (result.ok) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
        if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.reloadIgnoringCache();
      }
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    writeLog("second-instance activation: opening companion panel");
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    openDashboard("home");
  });
}

app.whenReady().then(async () => {
  if (!singleInstanceLock) return;
  app.setAppUserModelId("com.xiaoxiaodeta.pet");
  writeLog("app ready");

  let customAssetCommand;
  try {
    customAssetCommand = parseCustomAssetCommand(process.argv.slice(1));
  } catch (error) {
    writeLog(`custom-atlas command rejected: ${error.message}`);
    app.exit(1);
    return;
  }
  if (customAssetCommand) {
    const result = runCustomAssetCommand(customAssetCommand);
    app.exit(result.ok ? 0 : 1);
    return;
  }

  if (!isDev) await registerAssetProtocol();
  if (readProgressSave()) await loadNormalizedProgressSave();
  startSatietyClock();
  createWindow();
  createTray();
}).catch((error) => writeLog(`startup rejected ${error.stack || error.message}`));

app.on("window-all-closed", () => {
  writeLog("window-all-closed");
});
app.on("before-quit", () => {
  quitting = true;
  stopNativeDrag();
  clearInterval(satietyTimer);
  savePosition();
});
