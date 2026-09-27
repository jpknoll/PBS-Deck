const streamingServices = require("./services.json");
const path = require("path");
const {
  app,
  components,
  BrowserWindow,
  shell,
  ipcMain,
  Menu,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { initializeSettings } = require("./src/settings");
const { initializeTray, createTray } = require("./src/appIndicator");

const { setIsHidden, getIsHidden } = initializeSettings(app);

const userData = app.getPath("userData");
const sessionData = path.join(userData, "sessionData");
app.setPath("sessionData", sessionData);

const getServiceName = () => {
  let extractedAppname;

  for (let i = 0; i < process.argv.length; i++) {
    let flag = process.argv[i];
    const appname = flag?.match(/--appname=([a-zA-Z0-9]+)/);
    if (appname) extractedAppname = appname[1];
  }
  const serviceName = extractedAppname || process.env?.APP_NAME || "default";

  return serviceName;
};

const createCopyMenu = () => {
  ipcMain.handle("show-context-menu", async (event, txt) => {
    const template = [
      {
        label: "Copy",
        click: () => {
          event.sender.send("context-menu-command", txt);
        },
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(BrowserWindow.fromWebContents(event.sender));
  });
};

function createWindow() {
  let serviceName, appUrl, userAgent, zoomFactor, controllerNavigation;

  if (process.env.APP_URL) {
    createCopyMenu();
    return handleCustomAppUrl();
  } else {
    serviceName = getServiceName();

    if (serviceName === "default") {
      return showDefaultApp();
    }

    ({ appUrl, userAgent, zoomFactor, controllerNavigation } =
      streamingServices[serviceName] || {});
  }

  let useFullScreen = true;

  if (process.env.USE_FULL_SCREEN == "0") {
    useFullScreen = false;
  }

  const win = new BrowserWindow({
    fullscreen: useFullScreen,
    autoHideMenuBar: true,
    ...(useFullScreen
      ? {}
      : {
          width: parseInt(process.env.WINDOW_WIDTH, 10) || 800,
          height: parseInt(process.env.WINDOW_HEIGHT, 10) || 600,
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...(controllerNavigation
        ? {
            sandbox: false,
            preload: path.join(__dirname, "./src/nav/preload-nav.js"),
          }
        : {}),
    },
  });
  // pressing alt can bring up the menu bar even when its hidden. This accounts for that and disables it entirely
  win.setMenu(null);

  win.loadURL(
    appUrl,
    userAgent?.length
      ? {
          userAgent,
        }
      : {},
  );

  if (process.env.PBS_DECK_DOM_DUMP === "1") {
    win.webContents.on("did-start-loading", () =>
      console.log("[pbs-probe] did-start-loading"),
    );
    win.webContents.on(
      "did-finish-load",
      () => console.log("[pbs-probe] did-finish-load", win.webContents.getURL()),
    );
    win.webContents.on(
      "did-fail-load",
      (_e, code, desc, url) =>
        console.log("[pbs-probe] did-fail-load", code, desc, url),
    );
    win.webContents.on(
      "render-process-gone",
      (_e, details) => console.log("[pbs-probe] render-process-gone", details),
    );
  }

  if (zoomFactor && zoomFactor > 0) {
    win.webContents.on("did-finish-load", () => {
      win.webContents.setZoomFactor(zoomFactor);
    });
  }

  registerProbeClicker(win.webContents);
  registerProbeKeys(win.webContents);
  registerProbeArrows(win.webContents);
}

function handleCustomAppUrl() {
  const appUrl = process.env.APP_URL;
  const domDumpProbe = process.env.PBS_DECK_DOM_DUMP === "1";

  let zoomFactor;
  let userAgent = {};
  let useFullScreen = true;
  let disableMenuBar = true;
  let show = true;
  let appIndicatorEnabled = false;

  // other manual overrides
  if (process.env.USER_AGENT) userAgent = { userAgent: process.env.USER_AGENT };
  if (process.env.ZOOM_FACTOR) zoomFactor = parseFloat(process.env.ZOOM_FACTOR);

  if (process.env.USE_FULL_SCREEN == "0") {
    useFullScreen = false;
  }
  if (process.env.DISABLE_MENU_BAR == "0") {
    disableMenuBar = false;
  }
  if (
    process.env.ENABLE_APP_INDICATOR == "1" &&
    process.env.APP_ICON_PATH &&
    process.env.APP_NAME
  ) {
    app.setName(process.env.APP_NAME);
    appIndicatorEnabled = true;
    show = !getIsHidden(appUrl);
    initializeTray({
      application: app,
      appUrl,
      setHidden: setIsHidden,
      getHidden: getIsHidden,
      appName: process.env.APP_NAME,
      iconPath: process.env.APP_ICON_PATH,
    });
  }

  const win = new BrowserWindow({
    fullscreen: useFullScreen,
    autoHideMenuBar: disableMenuBar,
    show,
    ...(useFullScreen
      ? {}
      : {
          width: parseInt(process.env.WINDOW_WIDTH, 10) || 800,
          height: parseInt(process.env.WINDOW_HEIGHT, 10) || 600,
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...(domDumpProbe
        ? {
            sandbox: false,
            preload: path.join(__dirname, "./src/nav/preload-nav.js"),
          }
        : {}),
    },
  });
  if (disableMenuBar) {
    // pressing alt can bring up the menu bar even when its hidden. This accounts for that and disables it entirely
    win.setMenu(null);
  }

  if (appIndicatorEnabled) {
    createTray(win);
  }

  win.on("closed", () => {
    windows.delete(win);
  });

  win.loadURL(appUrl, userAgent);

  if (domDumpProbe) {
    win.webContents.on("did-start-loading", () =>
      console.log("[pbs-probe] did-start-loading"),
    );
    win.webContents.on(
      "did-finish-load",
      () => console.log("[pbs-probe] did-finish-load", win.webContents.getURL()),
    );
    win.webContents.on(
      "did-fail-load",
      (_e, code, desc, url) =>
        console.log("[pbs-probe] did-fail-load", code, desc, url),
    );
    win.webContents.on(
      "render-process-gone",
      (_e, details) => console.log("[pbs-probe] render-process-gone", details),
    );
  }

  if (zoomFactor && zoomFactor > 0) {
    win.webContents.on("did-finish-load", () => {
      win.webContents.setZoomFactor(zoomFactor);
    });
  }

  registerProbeClicker(win.webContents);
  registerProbeKeys(win.webContents);
  registerProbeArrows(win.webContents);
  registerProbeShow(win.webContents);
}

function showDefaultApp() {
  createCopyMenu();
  // render index.html, since no appName was provided
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    maxWidth: 1280,
    maxHeight: 720,
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "./preload.js"),
    },
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  win.loadFile("./index.html");
}

const sendKeyTo = (wc, keyCode) => {
  if (!wc || wc.isDestroyed()) return;
  wc.sendInputEvent({ type: "keyDown", keyCode });
  wc.sendInputEvent({ type: "char", keyCode });
  wc.sendInputEvent({ type: "keyUp", keyCode });
};

const registerProbeArrows = (webContents) => {
  if (process.env.PBS_DECK_PROBE_ARROWS !== "1") return;
  const findAndLog = (tag) => {
    webContents
      .executeJavaScript(`(() => {
        const out = [];
        const mk = (el) => {
          const r = el.getBoundingClientRect();
          return [
            el.tagName.toLowerCase(),
            (el.getAttribute('aria-label') || '').slice(0, 30),
            String(el.className || '').slice(0, 60),
            Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
            el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 20),
          ].join(' | ');
        };
        const re = /(chevron|arrow|next|scroll|carousel|season|select)/i;
        for (const el of document.querySelectorAll('button, a, [role="button"], [role="listbox"], [role="combobox"], select, svg, img, i, span')) {
          if (el.tagName.toLowerCase() === 'select') { out.push(mk(el)); continue; }
          const cls = String(el.className || '');
          const aria = el.getAttribute('aria-label') || '';
          const tf = el.getAttribute('data-testid') || '';
          if (re.test(cls) || re.test(aria) || re.test(tf)) {
            const host = el.closest('button, a') || el;
            out.push(mk(host));
          }
        }
        return [...new Set(out)];
      })()`)
      .then((rows) => {
        console.log(`[pbs-probe] arrows (${tag}):`);
        for (const row of rows) console.log("  " + row);
      })
      .catch(() => {});
  };
  findAndLog("load");
  setTimeout(() => findAndLog("+3s"), 3000);
  setTimeout(() => findAndLog("+6s"), 6000);
};

const registerProbeShow = (webContents) => {
  if (process.env.PBS_DECK_PROBE_SHOW !== "1") return;
  setTimeout(() => {
    webContents
      .executeJavaScript(`(() => {
        const els = [...document.querySelectorAll('a[href^="/show/"]')];
        const vis = els.find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
        });
        if (vis) {
          vis.scrollIntoView({ block: "center" });
          setTimeout(() => vis.click(), 400);
          return "clicked show: " + vis.getAttribute("href");
        }
        return "no visible show poster";
      })()`)
      .then((s) => console.log("[pbs-probe] " + s))
      .catch(() => {});
  }, 9000);
};

const registerProbeKeys = (webContents) => {
  const tokens = (process.env.PBS_DECK_PROBE_KEY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasKeys = tokens.some((t) => !/^\d+$/.test(t));
  if (!hasKeys && process.env.PBS_DECK_PROBE_BACK !== "1") return;
  const logUrl = (tag) => {
    webContents
      .executeJavaScript("location.href")
      .then((u) => console.log(`[pbs-probe] ${tag}: ${u}`))
      .catch(() => {});
  };
  let i = 0;
  const step = () => {
    if (webContents.isDestroyed()) return;
    if (i >= tokens.length) return;
    const token = tokens[i++];
    if (/^\d+$/.test(token)) {
      const delay = Number(token);
      console.log(`[pbs-probe] waiting ${delay}ms`);
      setTimeout(() => {
        logUrl("after wait");
        step();
      }, delay);
      return;
    }
    console.log(`[pbs-probe] sending key: ${token}`);
    if (token === "X") {
      webContents.send("nav:probe-x");
    } else {
      sendKeyTo(webContents, token);
    }
    setTimeout(() => {
      logUrl("after key " + token);
      step();
    }, 600);
  };
  setTimeout(() => {
    if (webContents.isDestroyed()) return;
    if (process.env.PBS_DECK_PROBE_BACK === "1") {
      console.log("[pbs-probe] invoking goBack");
      webContents.send("nav:probe-back");
    }
    step();
  }, 9000);
};

const registerProbeClicker = (webContents) => {
  const targets = (process.env.PBS_DECK_PROBE_CLICK || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (targets.length === 0) return;
  let step = 0;
  const timer = setInterval(() => {
    if (step >= targets.length || webContents.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    const target = targets[step];
    webContents
      .executeJavaScript(
        `(() => {
          const target = ${JSON.stringify(target)};
          const el = [...document.querySelectorAll('button, a')].find(
            (b) =>
              (b.textContent && b.textContent.trim() === target) ||
              b.getAttribute('aria-label') === target,
          );
          if (el) { el.click(); return true; }
          return false;
        })()`,
      )
      .then((done) => {
        if (done && !webContents.isDestroyed()) {
          step++;
          console.log("[pbs-probe] clicked:", target);
        }
      })
      .catch(() => {});
  }, 1000);
};

const setupAutoUpdate = () => {
  if (!app.isPackaged) {
    console.log("[auto-update] disabled (unpackaged dev run)");
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;
  autoUpdater.on("error", (err) => {
    console.error("[auto-update] error:", err.message || err);
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send("pbs-deck:update-failed");
    }
  });
  autoUpdater.on("update-available", () => {
    console.log("[auto-update] update available, downloading…");
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[auto-update] already up to date");
  });
  autoUpdater.on("download-progress", (p) => {
    if (p && Math.floor(p.percent) % 25 === 0) {
      console.log(`[auto-update] download ${Math.floor(p.percent)}%`);
    }
  });
  autoUpdater.on("update-downloaded", () => {
    console.log("[auto-update] update downloaded; installs on quit");
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send("pbs-deck:update-ready");
    }
  });
  setTimeout(() => {
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err) => console.error("[auto-update] check failed:", err.message || err));
  }, 15000);
};

const registerNavHandlers = () => {
  ipcMain.on("nav:exit", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on("nav:key", (event, keyCode) => {
    const wc = event.sender;
    if (!wc || wc.isDestroyed() || typeof keyCode !== "string") return;
    wc.sendInputEvent({ type: "keyDown", keyCode });
    wc.sendInputEvent({ type: "char", keyCode });
    wc.sendInputEvent({ type: "keyUp", keyCode });
  });

  ipcMain.on("nav:mouse", (event, { x, y } = {}) => {
    const wc = event.sender;
    if (!wc || wc.isDestroyed() || typeof x !== "number" || typeof y !== "number") return;
    wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  });

  ipcMain.on("nav:dom-dump", (_event, payload) => {
    console.log(`\n==== PBS DOM DUMP (${payload?.reason || "?"}) ====`);
    console.log(`url: ${payload?.url || ""}`);
    console.log(`title: ${payload?.title || ""}`);
    console.log(`viewport: ${payload?.viewport || ""}`);
    console.log(`search input: ${payload?.search || "absent"}`);
    console.log(`candidates: ${payload?.count ?? 0}`);
    for (const c of payload?.candidates || []) {
      const label = c.href || (c.role ? `role=${c.role}` : "");
      console.log(
        `(${c.y},${c.x}) ${c.w}x${c.h}  ${c.tag}${c.id ? "#" + c.id : ""}${c.cls ? "." + c.cls : ""}  ${label}  ${c.text ? JSON.stringify(c.text) : ""}`,
      );
    }
  });
};

app.whenReady().then(async () => {
  await components.whenReady();
  console.log("components ready:", components.status());
  registerNavHandlers();
  createWindow();
  setupAutoUpdate();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
