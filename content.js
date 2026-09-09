(function () {
  'use strict';

  // Renderer tags whose whole card should disappear when the channel inside
  // them is blocked. Covers old Polymer renderers and the newer lockup
  // view-models YouTube has been migrating feeds to.
  const RENDERER_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-channel-renderer',
    'ytd-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-reel-item-renderer',
    'ytd-comment-renderer',
    'ytd-comment-view-model',
    'ytd-comment-thread-renderer',
    'yt-lockup-view-model',
    'ytm-video-with-context-renderer'
  ];
  const RENDERER_SELECTOR = RENDERER_SELECTORS.join(',');

  const CHANNEL_LINK_SELECTOR =
    'a#channel-name, ytd-channel-name a, #avatar-link, a[href^="/@"], a[href*="youtube.com/@"], ' +
    'a[href^="/channel/"], a[href*="youtube.com/channel/"]';

  const CHANNEL_NAME_SELECTOR =
    '#channel-name #text, ytd-channel-name #text, #text.ytd-channel-name, ' +
    '.yt-lockup-metadata-view-model__text, #author-text span, #channel-name';

  let blockList = [];
  let enabled = true;
  let listVersion = 0;

  function normalizedList() {
    return blockList.map((e) => ({ type: e.type, value: e.value.toLowerCase() }));
  }

  function extractChannelInfo(scopeEl) {
    let id = null;
    let handle = null;

    const links = scopeEl.querySelectorAll(CHANNEL_LINK_SELECTOR);
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!id) {
        const idMatch = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
        if (idMatch) id = idMatch[1];
      }
      if (!handle) {
        const handleMatch = href.match(/\/(@[A-Za-z0-9._-]{3,30})/);
        if (handleMatch) handle = handleMatch[1].toLowerCase();
      }
      if (id && handle) break;
    }

    let name = null;
    const nameEl = scopeEl.querySelector(CHANNEL_NAME_SELECTOR);
    if (nameEl && nameEl.textContent) name = nameEl.textContent.trim();
    if (!name && links.length) {
      const withText = Array.from(links).find((l) => l.textContent && l.textContent.trim());
      if (withText) name = withText.textContent.trim();
    }

    return { id, handle, name };
  }

  function matchEntry(info) {
    if (!enabled || blockList.length === 0) return null;
    for (const entry of blockList) {
      if (entry.type === 'id' && info.id && entry.value === info.id) return entry;
      if (entry.type === 'handle' && info.handle && entry.value.toLowerCase() === info.handle) return entry;
      if (entry.type === 'name' && info.name &&
          info.name.toLowerCase().includes(entry.value.toLowerCase())) return entry;
    }
    return null;
  }

  function setHidden(renderer, hidden) {
    if (hidden) {
      if (renderer.getAttribute('data-ycb-hidden') === '1') return;
      renderer.setAttribute('data-ycb-hidden', '1');
      renderer.style.setProperty('display', 'none', 'important');
    } else if (renderer.getAttribute('data-ycb-hidden') === '1') {
      renderer.removeAttribute('data-ycb-hidden');
      renderer.style.removeProperty('display');
    }
  }

  function removeDialog() {
    const existing = document.querySelector('.ycb-dialog');
    if (existing) existing.remove();
  }

  function showConfirmDialog(label, onChoice) {
    removeDialog();

    const box = document.createElement('div');
    box.className = 'ycb-dialog';
    box.innerHTML =
      '<p class="ycb-dialog-title">Block this channel?</p>' +
      '<p class="ycb-dialog-msg">' + label + '</p>' +
      '<div class="ycb-dialog-row">' +
      '<button type="button" class="ycb-dialog-btn ycb-dialog-btn-no">No</button>' +
      '<button type="button" class="ycb-dialog-btn ycb-dialog-btn-yes">Yes, block</button>' +
      '</div>';
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('ycb-dialog-show'));

    box.querySelector('.ycb-dialog-btn-yes').addEventListener('click', () => {
      removeDialog();
      onChoice(true);
    });
    box.querySelector('.ycb-dialog-btn-no').addEventListener('click', () => {
      removeDialog();
      onChoice(false);
    });
  }

  function showResultDialog(message, tone) {
    removeDialog();

    const box = document.createElement('div');
    box.className = 'ycb-dialog';
    box.innerHTML =
      '<div class="ycb-dialog-result">' +
      '<span class="ycb-dialog-result-icon ' + (tone || 'ok') + '"></span>' +
      '<span class="ycb-dialog-msg" style="margin:0;color:#EDEEF0;">' + message + '</span>' +
      '</div>' +
      '<button type="button" class="ycb-dialog-ok-btn">OK</button>';
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('ycb-dialog-show'));

    box.querySelector('.ycb-dialog-ok-btn').addEventListener('click', removeDialog);
    setTimeout(removeDialog, 3000);
  }

  async function confirmAndBlock(entry, label) {
    showConfirmDialog(label || entry.value, async (yes) => {
      if (!yes) {
        showResultDialog('Cancelled — channel was not blocked.', 'cancel');
        return;
      }
      const { added } = await ycbAddEntry(entry, label);
      showResultDialog(
        added ? ((label || entry.value) + ' has been blocked.') : ((label || entry.value) + ' was already blocked.'),
        'ok'
      );
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'ycb-confirm-block' && message.entry) {
      confirmAndBlock(message.entry, message.entry.value);
    }
  });

  function attachBlockButton(renderer, info) {
    if (!info.id && !info.handle) return;
    if (renderer.querySelector(':scope > .ycb-block-btn')) return;

    renderer.classList.add('ycb-hoverable');
    const cs = getComputedStyle(renderer);
    if (cs.position === 'static') renderer.style.position = 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ycb-block-btn';
    btn.title = 'Block this channel';
    btn.textContent = '🚫';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const entry = info.id
        ? { type: 'id', value: info.id }
        : { type: 'handle', value: info.handle };
      confirmAndBlock(entry, info.name || entry.value);
    });
    renderer.appendChild(btn);
  }

  function processRenderer(renderer) {
    if (renderer.getAttribute('data-ycb-v') === String(listVersion)) return;
    renderer.setAttribute('data-ycb-v', String(listVersion));

    const info = extractChannelInfo(renderer);
    const entry = matchEntry(info);
    setHidden(renderer, !!entry);
    if (!entry) attachBlockButton(renderer, info);
  }

  function scan(root) {
    if (root.matches && root.matches(RENDERER_SELECTOR)) processRenderer(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(RENDERER_SELECTOR).forEach(processRenderer);
    }
  }

  function removeOverlay() {
    const existing = document.querySelector('.ycb-overlay');
    if (existing) existing.remove();
    const player = document.querySelector('#player, #movie_player');
    if (player) player.style.removeProperty('visibility');
  }

  function showOverlay(entry, label) {
    if (document.querySelector('.ycb-overlay')) return;
    const container = document.querySelector('#player, #movie_player, ytd-watch-flexy #player-container-inner');
    if (!container) return;

    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'ycb-overlay';
    overlay.innerHTML =
      '<div class="ycb-overlay-card">' +
      '<div class="ycb-overlay-icon"></div>' +
      '<p class="ycb-overlay-title">This channel is blocked</p>' +
      '<p class="ycb-overlay-sub">' + (label || entry.value) + '</p>' +
      '<button type="button" class="ycb-overlay-btn">Unblock and watch</button>' +
      '</div>';

    overlay.querySelector('.ycb-overlay-btn').addEventListener('click', async () => {
      await ycbRemoveEntry(entry);
      removeOverlay();
    });

    container.appendChild(overlay);

    const video = document.querySelector('video');
    if (video) video.pause();
  }

  function checkWatchPage() {
    if (!location.pathname.startsWith('/watch')) {
      removeOverlay();
      return;
    }
    const owner = document.querySelector(
      'ytd-video-owner-renderer, #owner, ytd-watch-metadata #owner'
    );
    if (!owner) return;
    const info = extractChannelInfo(owner);
    const entry = matchEntry(info);
    if (entry) showOverlay(entry, info.name);
    else removeOverlay();
  }

  function rescanAll() {
    listVersion++;
    scan(document.body || document.documentElement);
    checkWatchPage();
  }

  async function refreshState() {
    const state = await ycbGetState();
    blockList = state.list;
    enabled = state.enabled;
    rescanAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[YCB_STORAGE_KEY] || changes[YCB_ENABLED_KEY]) refreshState();
  });

  const observer = new MutationObserver((mutations) => {
    let touched = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        scan(node);
        touched = true;
      }
    }
    if (touched) checkWatchPage();
  });

  function start() {
    refreshState().then(() => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
    document.addEventListener('yt-navigate-finish', () => rescanAll());
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
