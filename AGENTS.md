# PBS Deck — Agent Notes

Controller-driven Electron wrapper for pbs.org, deployed to a SteamOS HTPC.
This file is the persistent memory for agent sessions. Keep it current.

## Architecture

- `index.js` — Electron main process: window creation, `<webview>`/`BrowserWindow`
  host, auto-updater wiring, IPC (`nav:*`, `pbs-deck:*`), probe clickers/keys.
- `src/nav/navEngine.js` — the controller engine (preload world):
  - Polls `navigator.getGamepads()` every `POLL_MS=32`, edge-triggered
    (`pressed && !was`).
  - D-pad/left-stick calls `moveDirection(dir)`; face buttons call
    `handleButtonDown(name, index)` → `activate/select` etc.
  - Draws a focus ring (`.pbs-deck-ring`, `RING_COLOR #f2c10e`) over the
    current element and scans candidates via `FOCUS_SELECTOR`.
  - Overlays injected into `document.documentElement` (html) so React re-renders
    don't wipe them: `.pbs-deck-ring`, `.pbs-deck-toast`, `.pbs-deck-hints`,
    `.pbs-deck-signin`, `.pbs-deck-confirm`, `.pbs-deck-ringlet`.
- `src/nav/preload-nav.js` — thin preload: creates engine with
  `{ ipcRenderer, domDump }` and attaches. Keep it pristine.
- `package.json` scripts: `start` (electron), `build` / `build:unpacked`
  (electron-builder). No lint/test suite — verify with `node --check`.

## Navigation engine (key mechanics)

- `moveDirection` scoring: `along + across*4.5 - overlapBudget*120`, with a `+4`
  tolerance so touching rects are treated as the same position.
- Horizontal moves (left/right) are constrained to the source row by a vertical
  "sync band" (`max(80, srcHeight*1.2)` around `srcCenterY`) — prevents the ring
  from hopping to the top-nav header or other regions.
- Horizontal fallback (no forward candidate in band): pick the **vertically
  nearest forward** element. Vertical fallback (up/down): `findClosest()`
  diagonal nearest-by-center.
- `scheduleRescan` (MutationObserver) + `moveDirection` recover focus via
  `nearestTo(lastRect, ...)` when the current element is remounted/lost, instead
  of resetting to `firstInViewport`/`focusables[0]`.
- `lastRect` is snapshotted on every `setCurrent(el)`.
- Debounce: `BUTTON_DEBOUNCE_MS=150` dedupes duplicate gamepad edges;
  `CLICK_DEDUP_MS=180` (capture-phase, same-target) suppresses double-clicks.
  DIR repeat: `DIR_INITIAL_MS=380`, `DIR_REPEAT_MS=230`.
- `isAuthPage()` — hostname/`auth-ui` in path → skip sign-in card, park focus on
  the email/password input. SSO email flow is cross-origin to
  `login.publicmediasignin.org`.
- HTPC-grid real trigger: show-scroll rails where a lazy row remount detaches the
  focused node mid-navigation (recovery = the `nearestTo(lastRect)` logic).

## Auto-update ringlet (v0.1.9+)

- `autoDownload=true`, `autoInstallOnAppQuit=false` — quit never installs.
- `update-downloaded` → main caches `{version}` and sends `pbs-deck:update-ready`;
  renderer injects `.pbs-deck-ringlet` ("Update vX ready — press A to install").
- Ringlet is a plain `<button>` → already in `FOCUS_SELECTOR`; pressing A
  activates it → `nav:install-update` → `quitAndInstall()`.
- Pending version is re-sent on every `did-finish-load` (via
  `app.on('browser-window-created')`), so it survives navigation and shows on
  later launches.

## Testing

- QA launch (windowed, no GPU, CDP open, fresh profile, engine logs):
  ```
  USE_FULL_SCREEN=0 WINDOW_WIDTH=1280 WINDOW_HEIGHT=820 PBS_DECK_DOM_DUMP=1 \
  XDG_CONFIG_HOME=/tmp/opencode/pbsdeck-xdg-yrN \
  npm start -- --appname=pbs --no-sandbox --ozone-platform=x11 --disable-gpu \
  --remote-debugging-port=92NN
  ```
  Add `USER_AGENT=...`, `ZOOM_FACTOR=...` for site/zoom variants.
- Drive from CDP with `/tmp/opencode/cdp.mjs <wsUrl> '<expression>'`.
  Capture the page WS URL: `curl -s localhost:PORT/json`.
- **Fake gamepad driver**: engine runs in the isolated preload world, so patching
  `navigator.getGamepads` from the page doesn't work. The working trick (multi-
  use) is a temporary dev-only block in `preload-nav.js` gated on
  `PBS_DECK_FAKE_PAD=1` that (a) overrides `getGamepads` and (b) exposes
  `contextBridge.exposeInMainWorld('__drive', {press(i, bool)})`. Drive pattern:
  press → ~120ms → release all → ~260ms. **REMOVE the block before shipping.**
  See `docs/debugging.md`.
- Kill instances with `pkill -f '[e]lectron'` in its own bash call (never chain
  with the launch).
- Navigation across pbs.org destroys the injected-eval context, so split
  navigate-then-drive into separate CDP calls (same WS survives full navigations).

## Release workflow (learned the hard way)

1. Commit changes; run `node --check` on edited JS.
2. `npm version X.Y.Z --no-git-tag-version` (updates package.json + lock).
3. Commit "Bump version to X.Y.Z"; `git tag vX.Y.Z`; push master + tag.
4. Wait for CI to finish (`gh run list --limit 1` → `conclusion: success`).
5. electron-builder auto-creates a **DRAFT release** with 3 assets
   (`PBS_Deck_vX_linux.AppImage`, `app_unpacked.zip`, `latest-linux.yml`).
6. Publish the draft, never create a release:
   ```
   gh release edit vX.Y.Z --draft=false --title ... --notes ...
   ```
   **NEVER `gh release create`** (duplicated the v0.1.6 release; had to delete).
7. HTPC auto-updates on next launch (but NOT applied — ringlet in 0.1.9+).

## HTPC facts

- `~/Applications/PBS_Deck_linux.AppImage`; confirm version with
  `grep appVersion ~/.config/streaming-service-launcher.json`.
- Test env can't fully reproduce the HTPC geometry (1280x820 column layout vs
  the real grid), so always validate the specific row/rail geometry scenarios.
- Local signed-in profile lives at `~/.config/pbs-deck`; signed-out test profiles
  use fresh `XDG_CONFIG_HOME=/tmp/opencode/pbsdeck-xdg-YR`.

## Open workstreams / backlog

- Page-clutter hides: Donate banner, "Shop Now", newsletter, stuck re-login modal.
- Verify X (play/pause) on a signed-in session via the real player.
- Consider deeper region-awareness instead of the sync-band heuristic if the
  HTPC grid still shows odd hops.