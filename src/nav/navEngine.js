const POLL_MS = 32;
const AXIS_DEADZONE = 0.45;
const DIR_INITIAL_MS = 380;
const DIR_REPEAT_MS = 230;
const SCROLL_STEP_FACTOR = 0.8;
const RING_COLOR = '#f2c10e';
const OVERLAY_BG = 'rgba(10, 14, 20, 0.82)';
const OVERLAY_TEXT = '#ffffff';
const NOISE_CLASS = /(MyListButton|KabobMenu|Station(Button|Menu)|ChangeStationButton|VideoPlayerOverlay|Search(ButtonLink|Menu|Button)|SocialLinks|footer|Newsletter|DonateRow)/i;
const MIN_FOCUS_WIDTH = 24;
const MIN_FOCUS_HEIGHT = 24;
const MIN_FOCUS_AREA = 1200;
const RESCAN_THROTTLE_MS = 160;

const BUTTON_INDEX = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  VIEW: 8,
  MENU: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};

const FOCUS_SELECTOR = [
  'a[href*="/video/"]',
  'a[href*="/show/"]',
  'button[type="submit"]',
  'input[type="search"]',
  'input[aria-label]',
  'button',
  '[role="button"]',
  'a[href]',
  'iframe[src*="player.pbs.org"]',
].join(', ');

function createNavEngine({ ipcRenderer, domDump = false } = {}) {
  let focusables = [];
  let current = null;
  let ring = null;
  let overlay = null;
  let styleEl = null;
  let hintsVisible = false;
  let heldButtons = new Set();
  let lastDir = null;
  let dirTimer = null;
  let rescanTimer = null;
  let pollingTimer = null;
  let observer = null;
  let lastUrl = null;
  let locationTimer = null;
  let navDumpTimer = null;
  let signInCard = null;
  let signInCta = null;
  let signInDismissed = false;
  let playerPlaying = null;

  if (typeof window !== 'undefined') {
    window.addEventListener('message', (e) => {
      if (!e.origin || e.origin.indexOf('player.pbs.org') === -1) return;
      let data = e.data;
      if (data && data.event) {
        if (data.event === 'videojs:play' && playerPlaying !== true) {
          playerPlaying = true;
          showToast('\u25b6\ufe0f playing');
        } else if (data.event === 'videojs:pause' && playerPlaying !== false) {
          playerPlaying = false;
          showToast('\u23f8 paused');
        }
      }
      if (domDump) {
        let payload = data;
        if (typeof payload === 'object') {
          try {
            payload = JSON.stringify(payload).slice(0, 300);
          } catch (ignored) {
            payload = '[unserializable]';
          }
        }
        console.log(`[pbs-deck] msg from ${e.origin}: ${payload}`);
      }
    });
  }

  function ensureReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
      return;
    }
    attach();
  }

  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.textContent = `
      .pbs-deck-ring {
        position: fixed;
        z-index: 2147483646;
        pointer-events: none;
        box-sizing: border-box;
        border: 3px solid ${RING_COLOR};
        border-radius: 6px;
        box-shadow: 0 0 0 3px rgba(10, 14, 20, 0.55), 0 0 18px rgba(242, 193, 14, 0.5);
        transition: top 90ms ease-out, left 90ms ease-out, width 90ms ease-out, height 90ms ease-out;
        background: transparent;
      }
      .pbs-deck-hints {
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        z-index: 2147483647;
        pointer-events: none;
        background: ${OVERLAY_BG};
        color: ${OVERLAY_TEXT};
        font: 15px/1.5 system-ui, -apple-system, sans-serif;
        padding: 12px 18px;
        border-radius: 10px;
        max-width: 90vw;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
      }
      .pbs-deck-hints table { border-collapse: collapse; }
      .pbs-deck-hints td { padding: 2px 10px; }
      .pbs-deck-hints td:first-child { color: ${RING_COLOR}; font-weight: 700; text-align: right; white-space: nowrap; }
      .pbs-deck-signin {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2147483646;
        pointer-events: none;
        box-sizing: border-box;
        max-width: 560px;
        width: calc(100vw - 64px);
        background: rgba(10, 14, 20, 0.94);
        color: ${OVERLAY_TEXT};
        font: 15px/1.55 system-ui, -apple-system, sans-serif;
        text-align: center;
        padding: 30px 36px 34px;
        border: 2px solid ${RING_COLOR};
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
      }
      .pbs-deck-signin h1 {
        margin: 0 0 10px;
        font-size: 24px;
        line-height: 1.2;
        color: ${RING_COLOR};
      }
      .pbs-deck-signin p { margin: 0 0 6px; color: #d8dde4; }
      .pbs-deck-signin .pbs-deck-signin-cta {
        margin-top: 18px;
        display: inline-block;
        padding: 12px 30px;
        font: 700 16px/1.2 system-ui, sans-serif;
        color: #14181d;
        background: ${RING_COLOR};
        border: none;
        border-radius: 9px;
        box-shadow: 0 0 0 3px rgba(242, 193, 14, 0.35);
        cursor: pointer;
      }
      .pbs-deck-signin .pbs-deck-signin-note {
        margin-top: 12px;
        font-size: 12.5px;
        color: #98a2ad;
      }
      .pbs-deck-toast {
        position: fixed;
        left: 50%;
        top: 14%;
        transform: translateX(-50%);
        z-index: 2147483647;
        pointer-events: none;
        background: ${OVERLAY_BG};
        color: ${OVERLAY_TEXT};
        font: 600 18px/1.3 system-ui, -apple-system, sans-serif;
        padding: 10px 22px;
        border-radius: 999px;
        border: 1.5px solid rgba(242, 193, 14, 0.45);
        opacity: 0;
        transition: opacity 260ms ease;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(styleEl);
  }

  function inSidewaysScrollContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const st = window.getComputedStyle(node);
      const ox = st.overflowX;
      if (
        (ox === 'auto' || ox === 'scroll' || ox === 'hidden') &&
        node.scrollWidth > node.clientWidth * 1.5 + 2
      ) {
        return true;
      }
      if (st.position === 'fixed' || st.position === 'sticky') return false;
      node = node.parentElement;
    }
    return false;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest('script, style, noscript, template')) return false;
    if (el.closest('.pbs-deck-signin, .pbs-deck-hints')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (+style.opacity === 0) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tagName !== 'INPUT' && NOISE_CLASS.test(String(el.className || ''))) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_FOCUS_WIDTH || rect.height < MIN_FOCUS_HEIGHT) return false;
    if (rect.width * rect.height < MIN_FOCUS_AREA) return false;
    const vw = window.innerWidth;
    if ((rect.right < -4 || rect.left > vw + 4) && !inSidewaysScrollContainer(el)) {
      return false;
    }
    return true;
  }

  function scanFocusables() {
    const seen = new Set();
    const result = [];
    for (const el of document.querySelectorAll(FOCUS_SELECTOR)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (isVisible(el)) result.push(el);
    }
    return result;
  }

  function candidateInfo(el) {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
      href: el.getAttribute('href') || '',
      role: el.getAttribute('role') || '',
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  }

  function emitDump(reason) {
    if (!ipcRenderer || !domDump) return;
    const candidates = scanFocusables()
      .map(candidateInfo)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const si = document.querySelector('input[type="search"], input[name="q"], input[aria-label="Search PBS"]');
    let searchDebug = 'absent';
    if (si) {
      const r = si.getBoundingClientRect();
      const st = window.getComputedStyle(si);
      searchDebug = `tag=${si.tagName} w=${Math.round(r.width)} h=${Math.round(r.height)} display=${st.display} vis=${st.visibility} aria=${si.getAttribute('aria-label')}`;
    }
    ipcRenderer.send('nav:dom-dump', {
      url: location.href,
      reason,
      title: (document.title || '').slice(0, 100),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      search: searchDebug,
      count: candidates.length,
      candidates,
    });
  }

  function scheduleDumpAfterNav() {
    if (!domDump || navDumpTimer) return;
    navDumpTimer = setTimeout(() => {
      navDumpTimer = null;
      emitDump('nav');
    }, 1500);
  }

  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      const fresh = scanFocusables();
      if (fresh.join('|') === focusables.join('|')) {
        if (!current && fresh.length) setCurrent(fresh[0]);
        return;
      }
      focusables = fresh;
      if (current && !current.isConnected) {
        current = null;
      }
      if (!current && fresh.length) {
        setCurrent(fresh[0]);
      }
      updateRing();
      emitDump('mutation');
      showSignInCardIfNeeded();
    }, RESCAN_THROTTLE_MS);
  }

  function findClosest(source) {
    const srcRect = source.getBoundingClientRect();
    const srcBottom = srcRect.bottom;
    const srcTop = srcRect.top;
    const srcHeight = Math.max(srcRect.height, 1);
    let best = null;
    let bestScore = Infinity;
    let largest = null;
    let largestArea = 0;

    for (const el of focusables) {
      if (el === source || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      const verticalOverlap = Math.max(
        0,
        Math.min(rect.bottom, srcBottom) - Math.max(rect.top, srcTop),
      );
      const dx = Math.abs(rect.left + rect.width / 2 - (srcRect.left + srcRect.width / 2));
      const dy = Math.abs(rect.top + rect.height / 2 - (srcRect.top + srcRect.height / 2));
      const score = Math.hypot(dx, dy) - verticalOverlap * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
      const area = rect.width * rect.height;
      if (area > largestArea) {
        largestArea = area;
        largest = el;
      }
    }

    if (best) {
      const rect = best.getBoundingClientRect();
      const verticalOverlap = Math.max(
        0,
        Math.min(rect.bottom, srcBottom) - Math.max(rect.top, srcTop),
      );
      if (verticalOverlap < srcHeight * 0.2) return best;
    }
    return largest || best;
  }

  function moveDirection(dir) {
    focusables = scanFocusables();
    if (focusables.length === 0) return;

    const source = current && current.isConnected ? current : null;
    if (!source) {
      setCurrent(focusables[0]);
      return;
    }

    const srcRect = source.getBoundingClientRect();
    const srcCenterX = srcRect.left + srcRect.width / 2;
    const srcCenterY = srcRect.top + srcRect.height / 2;
    const srcLeft = srcRect.left;
    const srcRight = srcRect.right;
    const srcTop = srcRect.top;
    const srcBottom = srcRect.bottom;

    let best = null;
    let bestScore = Infinity;

    for (const el of focusables) {
      if (el === source || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      if (dir === 'right' && rect.left <= srcRight + 4) continue;
      if (dir === 'left' && rect.right >= srcLeft - 4) continue;
      if (dir === 'down' && rect.top <= srcBottom - 4) continue;
      if (dir === 'up' && rect.bottom >= srcTop + 4) continue;

      const verticalOverlap = Math.max(
        0,
        Math.min(rect.bottom, srcBottom) - Math.max(rect.top, srcTop),
      );
      const horizontalOverlap = Math.max(
        0,
        Math.min(rect.right, srcRight) - Math.max(rect.left, srcLeft),
      );
      const perpOverlap =
        dir === 'right' || dir === 'left' ? verticalOverlap : horizontalOverlap;
      const perpLen = dir === 'right' || dir === 'left' ? srcRect.height : srcRect.width;
      const overlapBudget = perpOverlap / Math.max(perpLen, 1);

      const dx = rect.left + rect.width / 2 - srcCenterX;
      const dy = rect.top + rect.height / 2 - srcCenterY;
      const along = dir === 'right' || dir === 'left' ? Math.abs(dx) : Math.abs(dy);
      const across = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 4.5 - overlapBudget * 120;

      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (!best) best = findClosest(source);
    if (best) setCurrent(best);
  }

  function setCurrent(el) {
    if (!el || !el.isConnected) return;
    if (signInCard && el !== signInCta) {
      signInDismissed = true;
      hideSignInCard();
    }
    current = el;
    try {
      el.focus({ preventScroll: true });
    } catch (ignored) {
      // focus() is best-effort for non-focusable nodes.
    }
    scrollToElement(el);
    updateRing();
  }

  function scrollToElement(el) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.top < 0 || rect.bottom > vh || rect.left < 0 || rect.right > vw) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }
  }

  function activate() {
    if (current === signInCta) {
      startSignIn();
      return;
    }
    if (!current || !current.isConnected) return;
    if (
      current.tagName === 'INPUT' ||
      current.tagName === 'TEXTAREA' ||
      current.isContentEditable
    ) {
      try {
        current.focus({ preventScroll: false });
        current.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      } catch (ignored) {
        // focus() can throw for exotic elements.
      }
    }
    current.click();
  }

  function goBack() {
    if (signInCard) {
      signInDismissed = true;
      hideSignInCard();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (ipcRenderer) ipcRenderer.send('nav:exit');
  }

  function scrollBy(dx) {
    window.scrollBy({ left: dx, behavior: 'smooth' });
  }

  function showHints() {
    hintsVisible = true;
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'pbs-deck-hints';
    overlay.innerHTML = `
      <table>
        <tr><td>D-pad / Stick</td><td>Move focus</td></tr>
        <tr><td>A / Enter</td><td>Select</td></tr>
        <tr><td>B / Esc</td><td>Back (B at home exits)</td></tr>
        <tr><td>Y</td><td>Jump to search</td></tr>
        <tr><td>X</td><td>Play / Pause (on a video)</td></tr>
        <tr><td>LB / RB</td><td>Seek 10s on a video, else scroll rows</td></tr>
        <tr><td>Menu</td><td>Toggle these hints</td></tr>
      </table>
    `;
    document.documentElement.appendChild(overlay);
  }

  function hideHints() {
    hintsVisible = false;
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function toggleHints() {
    if (hintsVisible) hideHints();
    else showHints();
  }

  function findSignInButton() {
    for (const el of document.querySelectorAll('button, a')) {
      if (
        isVisible(el) &&
        el.textContent &&
        el.textContent.trim() === 'Sign In'
      ) {
        return el;
      }
    }
    return null;
  }

  function isSignedIn() {
    return !findSignInButton() && !document.querySelector(
      'input[type="email"], input[name="email"], input[type="password"], input[name="password"]',
    );
  }

  function hideSignInCard() {
    if (signInCard) {
      signInCard.remove();
      signInCard = null;
      signInCta = null;
    }
  }

  function buildSignInCard() {
    injectStyles();
    signInCard = document.createElement('div');
    signInCard.className = 'pbs-deck-signin';
    signInCard.innerHTML = `
      <h1>Sign in to PBS Passport</h1>
      <p>Passport unlocks the full catalog &mdash; seasons, episodes and the full archive.</p>
      <p>Pick <b>Sign In</b> to log in with PBS (or Google / Apple / Facebook).</p>
      <button class="pbs-deck-signin-cta">Sign In</button>
      <div class="pbs-deck-signin-note">A / Enter to sign in &middot; B / dpad to keep browsing free shows</div>
    `;
    document.documentElement.appendChild(signInCard);
    signInCta = signInCard.querySelector('.pbs-deck-signin-cta');
    signInCta.addEventListener('click', startSignIn);
  }

  function showSignInCardIfNeeded() {
    if (signInCard || signInDismissed) return;
    if (isSignedIn()) return;
    buildSignInCard();
    setCurrent(signInCta);
    if (domDump) console.log('[pbs-deck] sign-in card shown');
  }

  function startSignIn() {
    signInDismissed = true;
    hideSignInCard();
    const real = findSignInButton();
    if (real) real.click();
    if (domDump) console.log('[pbs-deck] sign-in flow started');
  }

  function focusSearch() {
    const input =
      document.querySelector('input[type="search"]') ||
      document.querySelector('input[name="q"]') ||
      document.querySelector('input[aria-label="Search PBS"]');
    if (input && input.getBoundingClientRect().width > 0) {
      setCurrent(input);
      try {
        input.focus({ preventScroll: false });
      } catch (ignored) {
        // continue
      }
      if (domDump) console.log('[pbs-deck] search input focused');
      return;
    }
    const opener = document.querySelector('button[aria-label="Open Search Menu"]');
    if (opener && opener.getBoundingClientRect().width > 0) {
      opener.click();
      setTimeout(focusSearch, 300);
      return;
    }
    if (domDump) console.log('[pbs-deck] search entry not found');
  }

  function findPlayer() {
    return document.querySelector('iframe[src*="player.pbs.org"]');
  }

  function sendKey(keyCode) {
    if (!ipcRenderer) return;
    ipcRenderer.send('nav:key', keyCode);
  }

  function showToast(text) {
    injectStyles();
    let toast = document.querySelector('.pbs-deck-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'pbs-deck-toast';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast.__t);
    toast.__t = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1400);
  }

  function handlePlayPause() {
    const player = findPlayer();
    if (player && player.getBoundingClientRect().width > 0) {
      try {
        player.focus();
      } catch (ignored) {
        // continue
      }
      player.scrollIntoView({ block: 'center', inline: 'nearest' });
      sendKey('Space');
      showToast('\u25b6\ufe0f / \u23f8 play / pause');
      if (domDump) console.log('[pbs-deck] play/pause key sent to player');
      return true;
    }
    const video = document.querySelector('video');
    if (video && !video.paused) {
      video.pause();
      showToast('\u23f8 paused');
      return true;
    } else if (video) {
      video.play().catch(function () {});
      showToast('\u25b6\ufe0f playing');
      return true;
    }
    return false;
  }

  function handleSeek(dir) {
    const player = findPlayer();
    if (!player || player.getBoundingClientRect().width <= 0) return false;
    sendKey(dir > 0 ? 'ArrowRight' : 'ArrowLeft');
    showToast(dir > 0 ? '\u23e9 +10s' : '\u23ea -10s');
    return true;
  }

  function updateRing() {
    if (!current || !current.isConnected) {
      if (ring) ring.style.display = 'none';
      return;
    }
    injectStyles();
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'pbs-deck-ring';
      document.documentElement.appendChild(ring);
    }
    const rect = current.getBoundingClientRect();
    ring.style.display = 'block';
    ring.style.top = `${rect.top}px`;
    ring.style.left = `${rect.left}px`;
    ring.style.width = `${rect.width}px`;
    ring.style.height = `${rect.height}px`;
  }

  function guardControls() {
    const active = document.activeElement;
    if (!active) return false;
    return (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable
    );
  }

  function findGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  function heldDirections(gamepad) {
    const names = [];
    if (gamepad.buttons[12]?.pressed) names.push('up');
    if (gamepad.buttons[13]?.pressed) names.push('down');
    if (gamepad.buttons[14]?.pressed) names.push('left');
    if (gamepad.buttons[15]?.pressed) names.push('right');
    return names;
  }

  function directionFrom(gamepad) {
    if (!gamepad) return null;
    const dpad = heldDirections(gamepad);
    if (dpad.length) return dpad[0];
    const x = gamepad.axes[0] || 0;
    const y = gamepad.axes[1] || 0;
    if (Math.hypot(x, y) < AXIS_DEADZONE) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  function clearDirTimer() {
    if (dirTimer) {
      clearTimeout(dirTimer);
      dirTimer = null;
    }
  }

  function reportDir(dir) {
    const changed = dir !== lastDir;
    lastDir = dir;
    if (!dir) {
      clearDirTimer();
      return;
    }
    if (!changed) return;
    clearDirTimer();
    moveDirection(dir);
    dirTimer = setTimeout(function repeat() {
      if (lastDir !== dir) return;
      moveDirection(dir);
      dirTimer = setTimeout(repeat, DIR_REPEAT_MS);
    }, DIR_INITIAL_MS);
  }

  function handleButtonDown(name) {
    if (guardControls()) return;
    switch (name) {
      case 'A':
        activate();
        break;
      case 'B':
        goBack();
        break;
      case 'Y':
        focusSearch();
        break;
      case 'X':
        handlePlayPause();
        break;
      case 'VIEW':
      case 'MENU':
        toggleHints();
        break;
      case 'LB':
        if (!handleSeek(-1)) scrollBy(-Math.floor(window.innerWidth * SCROLL_STEP_FACTOR));
        break;
      case 'RB':
        if (!handleSeek(1)) scrollBy(Math.floor(window.innerWidth * SCROLL_STEP_FACTOR));
        break;
      default:
        break;
    }
  }

  function poll() {
    const pad = findGamepad();
    if (!pad) {
      clearDirTimer();
      lastDir = null;
      return;
    }

    for (const [name, index] of Object.entries(BUTTON_INDEX)) {
      const pressed = Boolean(pad.buttons[index]?.pressed);
      const was = heldButtons.has(index);
      if (pressed && !was) handleButtonDown(name);
      if (pressed) heldButtons.add(index);
      else heldButtons.delete(index);
    }

    reportDir(directionFrom(pad));
  }

  function attach() {
    if (pollingTimer) return;
    injectStyles();
    focusables = scanFocusables();
    const player = findPlayer();
    if (player && player.getBoundingClientRect().width > 0) {
      setCurrent(player);
    } else {
      current = focusables[0] || null;
      if (current) setCurrent(current);
    }
    showSignInCardIfNeeded();
    showHints();

    observer = new MutationObserver(() => scheduleRescan());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('scroll', updateRing, { passive: true });
    window.addEventListener('resize', updateRing);

    if (domDump) {
      setTimeout(() => emitDump('attach'), 1500);
      window.addEventListener('load', () => emitDump('load'));
      window.addEventListener('popstate', scheduleDumpAfterNav);
      lastUrl = location.href;
      locationTimer = setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          scheduleDumpAfterNav();
        }
      }, 1000);
    }

    pollingTimer = setInterval(poll, POLL_MS);
  }

  return { attach: ensureReady };
}

module.exports = { createNavEngine };