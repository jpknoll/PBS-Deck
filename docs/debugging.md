# Debugging — how to drive and instrument the engine

Reusable techniques for testing PBS Deck locally. All paths are examples under
`/tmp/opencode/`; adapt names per session.

## CDP entry point

Helper `cdp.mjs` evaluates JS in the renderer over a WebSocket:

```js
// usage
bun cdp.mjs "$WS" "document.title"          // eval one expression
bun cdp.mjs "$WS" "window.__res || 'pending'" // read an async result you set
```

Get the page WS URL after launching with `--remote-debugging-port=92NN`:

```sh
curl -s http://127.0.0.1:92NN/json | python3 -c 'import sys,json; d=json.load(sys.stdin); print([p["webSocketDebuggerUrl"] for p in d if p["type"]=="page"][0])'
```

Typical async pattern: start a runner that stashes results on `window.__*`,
then poll from a **separate** `bun cdp.mjs` call. Spawn the runner, `sleep`, then read.

## Fake gamepad driver (isolated-world problem)

The engine runs in the preload (isolated) world, and it reads gamepads via
`navigator.getGamepads()`. Patching the page-world `navigator` does **nothing** —
the preload world has its own. To drive it remotely:

1. Temporarily add a dev-only block at the top of `src/nav/preload-nav.js`,
   gated behind `process.env.PBS_DECK_FAKE_PAD === '1'`:
   - Override `navigator.getGamepads` to return one fake pad built from a
     local 17-button `state` array (buttons report `pressed`/`value`/`touched`).
   - Expose a bridge: `contextBridge.exposeInMainWorld('__drive', { press(i, bool) })`
     that flips `state[i].pressed`.
2. Launch with `PBS_DECK_FAKE_PAD=1`.
3. Drive from CDP:
   ```js
   const sleep = (m) => new Promise((r) => setTimeout(r, m));
   const tap = (i) => window.__drive.press(i, true);
   const rel = async () => { await sleep(120); for (let k = 0; k < 17; k++) window.__drive.press(k, false); await sleep(260); };
   tap(15); await rel(); // 15=right 14=left 13=down 12=up 0=A 1=B
   ```
4. **Remove the block before shipping.** It is gated, but keeping preload-nav.js
   pristine avoids surprises. `node --check` both files afterwards.

Button map: 12 up, 13 down, 14 left, 15 right, 0 A, 1 B, 3 X, 2 Y (standard
mapping). Note `press-120ms-release-260ms` ≈ one deliberate step; shorter gaps
can hit the debounce/edge logic.

## Reproducing/sanitizing a nav bug

- Read the ring position:
  ```js
  const rec = () => { const r = document.querySelector('.pbs-deck-ring'); const b = r && r.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width)] : null; };
  ```
- Log a walk: press right/left N times, record `rec()` after each release.
- **Remount test** (focus-continuity): find the focused element under the ring,
  climb to its focusable ancestor, replace it with `cloneNode(true)`, wait ~1.2s
  for the MutationObserver rescan, then `rec()`. With `nearestTo(lastRect)`
  recovery the ring stays put; the old behavior snapped to the row start/page top.
- Navigation across pbs.org destroys the eval context on full page loads. Split
  into two calls: (1) `window.location.href='...'`, (2) sleep, then drive on the
  same WS. The page target survives navigation.

## Logs

- `PBS_DECK_DOM_DUMP=1` enables engine `console.log` diagnostics (focus recovery,
  debounce drops, ring dumps). Capture the app stdout to a file on launch.
- Hook-free sanity checks: `node --check src/nav/navEngine.js && node --check index.js`.