# PBS Deck

Controller-friendly PBS streaming for SteamOS / Bazzite / SteamFork HTPCs,
forked from [StreamingServiceLauncher](https://github.com/aarron-lee/StreamingServiceLauncher) (MIT).

Adds a `pbs` service that loads [pbs.org/video](https://www.pbs.org/video/) inside
a castlabs (Widevine) Electron window, plus a **controller navigation layer**
(`src/nav/`) that turns a gamepad into a TV-style remote for the PBS website.

## What the fork changes

- `services.json` — added `"pbs"` entry with `"controllerNavigation": true`.
- `src/nav/navEngine.js` — gamepad → DOM remote: D-pad/stick focus movement over
  cards, focus ring, carousel scrolling, search jump, back/exit, hints overlay.
- `src/nav/preload-nav.js` — preload that boots the engine (only attached to
  services flagged `controllerNavigation`).
- `index.js` — attaches the nav preload per-service and handles `nav:exit` IPC.
- Renamed scripts / installer for the fork (`pbs-deck`, `pbs-deck-install-steam`);
  other services and their behavior are unchanged.

## Controller buttons

| Input | Action |
|---|---|
| D-pad / stick | Move focus (hold to repeat, TV-style) |
| A / Enter | Select / play |
| B (or Esc / back) | Go back one page; **B on the PBS home page exits the app** |
| Y | Jump to search box |
| LB / RB | Scroll a carousel / row horizontally |
| Menu (or View) | Toggle the on-screen hints overlay |

The focus ring is drawn in PBS yellow; the engine re-scans the DOM via
`MutationObserver` so newly loaded carousel rows are picked up automatically.

Note: while typing in a text field the engine's gamepad shortcuts are suppressed.

## Install (after publishing a fork release)

Set `REPO` in `install.sh` to `<you>/PBS-Deck`, then:

```bash
curl -L https://raw.githubusercontent.com/<you>/PBS-Deck/refs/heads/main/install.sh | sh
```

Rerun to update. Uninstall:

```bash
rm $HOME/Applications/PBS-Deck.AppImage
rm -rf $HOME/Applications/pbs_deck_scripts
rm $HOME/.local/bin/pbs-deck
rm $HOME/.local/bin/pbs-deck-install-steam
rm $HOME/.local/bin/pbs-deck-add-desktop-entry
rm -f $HOME/.local/share/applications/pbsdeck*.desktop
```

## Usage

```bash
$HOME/.local/bin/pbs-deck pbs
```

## Signing in (PBS Passport)

On the first launch while signed out, a **Sign in to PBS Passport** card appears
and is pre-focused:

- **A / Enter** on the card starts the sign-in flow: it opens the site's Sign-In
  modal, then the PBS SSO page (`login.publicmediasignin.org`) loads in the same
  window. Pick **Sign in with Email** (or Google / Apple / Facebook) and type
  your credentials.
- While typing in a text field all gamepad shortcuts are muted, so the Steam
  Deck / SteamOS on-screen keyboard (or a real keyboard/mouse during setup)
  works without fighting the focus engine. **B** exits the field after typing.
- **Any D-pad / stick movement (or B)** on the card dismisses it and you can
  browse the free (~30-day) catalog unsigned.

The session persists across launches (cookies live in the app's userData), so
this is a **one-time** step: authenticate once with the OSK/keyboard, and every
later launch is fully controller-driven with Passport unlocked.

## Steam Deck / HTPC Game Mode

Your distro must ship `steamos-add-to-steam` (SteamOS, Bazzite, SteamFork, …):

```bash
$HOME/.local/bin/pbs-deck-install-steam pbs
```

This creates `$HOME/Applications/pbs_deck_scripts/pbs.sh`, adds it as a
non-Steam game, and the session tiles/apps pick it up from there.

Add a desktop shortcut instead:

```bash
$HOME/.local/bin/pbs-deck-add-desktop-entry pbs
```

## DOM inspection (verifying the nav selectors)

The engine emits what it sees without any browser tooling:

```bash
PBS_DECK_DOM_DUMP=1 $HOME/Applications/PBS-Deck.AppImage --appname=pbs --no-sandbox
```

Every focused candidate is printed to stdout as it's scanned (`attach`, `load`,
`mutation`, or after SPA navigation):

```
==== PBS DOM DUMP (mutation) ====
url: https://www.pbs.org/video/
candidates: 42
(y,x) WxH  tag#id.class  href  "text"
```

Use it to confirm the focus ring matches the real grid (and to re-tune the
`FOCUS_SELECTOR` in `src/nav/navEngine.js` when PBS changes their markup).

## Custom app URL (unchanged from upstream)

```bash
APP_URL=https://tv-mix.org/ $HOME/Applications/PBS-Deck.AppImage --no-sandbox
```

Optional: `USER_AGENT`, `ZOOM_FACTOR`, `USE_FULL_SCREEN=0`, `DISABLE_MENU_BAR=0`,
`ENABLE_APP_INDICATOR=1` + `APP_ICON_PATH` + `APP_NAME`.

## Local development

```bash
npm install            # pulls castlabs Electron (Widevine)
npm run start -- -- --appname=pbs
# or just npm start and use the on-screen menu
```

Build an AppImage:

```bash
npm run build
```

## Troubleshooting

- **No DRM / black video**: a message about missing components means Widevine
  was not bundled; reinstall with the castlabs `electron` devDependency.
- **Controller not responding**: PBS may not have rendered cards yet; the engine
  retries. Try `Menu` to confirm the overlay appears (proves the preload loaded).
- **4K/HDR**: Linux playback via Widevine is capped at 1080p SDR; this is a
  platform limit, not an app bug.

## Attribution

Derived from [StreamingServiceLauncher](https://github.com/aarron-lee/StreamingServiceLauncher)
by aarron-lee, MIT licensed. Remote/launcher design language borrowed from
[StreamHub-Deck](https://github.com/filipedeptulski/StreamHub-Deck).