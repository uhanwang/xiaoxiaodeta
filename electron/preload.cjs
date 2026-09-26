const { contextBridge, ipcRenderer, webUtils } = require("electron");
ipcRenderer.send("pet:preload-ready");

contextBridge.exposeInMainWorld("pet", {
  getBounds: () => ipcRenderer.invoke("pet:get-bounds"),
  moveBy: (dx, dy, inputAt, pointerPoint) => ipcRenderer.send("pet:move-by", { dx, dy, inputAt, pointerPoint }),
  startDrag: () => ipcRenderer.send("pet:drag-start"),
  endDrag: () => ipcRenderer.send("pet:drag-end"),
  nudge: (dx, dy) => ipcRenderer.send("pet:nudge", { dx, dy }),
  setInteractionMode: (mode) => ipcRenderer.send("pet:interaction-mode", mode),
  cursorPoint: () => ipcRenderer.invoke("pet:cursor-point"),
  openDashboard: (tab = "home") => ipcRenderer.send("pet:open-dashboard", tab),
  closeDashboard: () => ipcRenderer.send("pet:close-dashboard"),
  playAction: (actionId) => ipcRenderer.send("pet:play-action", actionId),
  onActionRequest: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, actionId) => callback(actionId);
    ipcRenderer.on("pet:action-request", listener);
    return () => ipcRenderer.removeListener("pet:action-request", listener);
  },
  loadSave: () => ipcRenderer.invoke("pet:load-save"),
  seedSave: (save) => ipcRenderer.invoke("pet:seed-save", save),
  applyProgressEvent: (event) => ipcRenderer.invoke("pet:apply-progress-event", event),
  onSaveChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, save) => callback(save);
    ipcRenderer.on("pet:save-changed", listener);
    return () => ipcRenderer.removeListener("pet:save-changed", listener);
  },
  hide: () => ipcRenderer.send("pet:hide"),
  quit: () => ipcRenderer.send("pet:quit"),
  chooseCustomAtlas: () => ipcRenderer.invoke("pet:choose-custom-atlas"),
  installCustomAtlas: (filePath) => ipcRenderer.invoke("pet:install-custom-atlas", { path: String(filePath || "") }),
  resetCustomAtlas: () => ipcRenderer.invoke("pet:reset-custom-atlas"),
  customAtlasStatus: () => ipcRenderer.invoke("pet:custom-atlas-status"),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
});
