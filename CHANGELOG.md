# Changelog

All versioned changes to PBS Deck. Order: newest first.

## 0.1.9 — Deferred-update ringlet
- No more silent install-on-quit (`autoInstallOnAppQuit=false`).
- Persistent bottom-right focusable ringlet ("Update vX ready — press A to
  install") replaces the transient toast; activating it calls `quitAndInstall`.
- Pending update cached in main and re-sent on `did-finish-load`, so it
  reappears across navigations and on later launches.
- Files: `index.js`, `src/nav/navEngine.js`. Commit `b52ff8e`.

## 0.1.8 — Fix horizontal navigation skipping items
- End-of-rail backward lurch fixed: no more snapping ~2 cards back at row ends
  (`findClosest` ignored direction).
- Cross-region hops into the top-nav header eliminated: horizontal moves stay on
  the source row via a vertical sync band.
- Focus-continuity: recovery now lands nearest the last known position
  (`nearestTo(lastRect)`) instead of the row start / page top on remount/loss.
- Up/down diagonal fallback unchanged.
- Files: `src/nav/navEngine.js`. Commit `787cc6f`.

## 0.1.7 — Debounce duplicate button activations
- `BUTTON_DEBOUNCE_MS=150` dedupes duplicate gamepad edges (`handleButtonDown`).
- `CLICK_DEDUP_MS=180` capture-phase same-target click dedupe in `attach()`
  suppresses double-clicks vs native keyboard duplicates.
- Files: `src/nav/navEngine.js`. Commits `85494b7` + `b251a0a`.

## 0.1.6 — SSO login page support
- `isAuthPage()` (hostname signin/sso/auth + `auth-ui` path) skips the sign-in
  card and start-highlight on the cross-origin
  `login.publicmediasignin.org/.../auth-ui/v2/login` page.
- Focus parked on first visible auth input (email), password + SSO buttons
  reachable.
- FOCUS_SELECTOR gained `input[type=email/password/text/tel/number]`; newsletter
  inputs filtered.
- Files: `src/nav/navEngine.js`. Commits `2d63b5b` + `5a84293`.

## 0.1.5 — Modal/overlay focus discipline
- Keep focus inside overlays and on the sign-in provider.
- Files: `src/nav/navEngine.js`. Commits `5c7b9cd` + `c78445d`.

## 0.1.4 — Sign-in focus
- Keep sign-in focus on the card CTA and make it dpad-reachable; reverted
  auto-open-at-launch experiments (Game Mode flex issue).
- Commits: `a0fc892`, plus reverts `6ac9571`/`16ea8e2`.

## 0.1.3 — updates groundwork
- Add automatic updates via electron-updater (`6d99e9b`, `80934af` release).
- Fix CI release build (`fda5c11`).

## Earlier
- Pre-0.1.3 history lives in git; releases before 0.1.3 were manual.