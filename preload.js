const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronUtils", {
  showContextMenu: async (txt) =>
    await ipcRenderer.invoke("show-context-menu", txt),
  // From main to render.
  receive: (channel, listener) => {
    ipcRenderer.on(channel, (event, ...args) => listener(...args));
  },
});
