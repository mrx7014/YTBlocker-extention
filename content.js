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
    'ytd-backstage-post-renderer',
    'ytd-post-renderer',
    'ytd-rich-grid-media',
    'ytd-reel-shelf-renderer',
    'ytd-shelf-renderer',
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
  const VIDEO_TITLE_SELECTOR =
    'a#video-title, #video-title, .yt-lockup-metadata-view-model__title, ' +
    'yt-lockup-metadata-view-model__title, a[href^="/watch"], a[href*="youtube.com/watch"]';
  const TITLE_FILTER_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
    'ytd-grid-video-renderer', 'ytd-reel-item-renderer', 'ytd-rich-grid-media',
    'yt-lockup-view-model', 'ytm-video-with-context-renderer'
  ].join(',');

  let blockList = [];
  let allowedList = [];
  let enabled = true;
  let filterMode = 'hide';
  let titleKeywords = [];
  let listVersion = 0;
  let expiryTimer = null;
  let blockedWatchPage = false;
  const allowedVideoIds = new Set();
  const blockedVideoStates = new WeakMap();
  const blockedPlayerStates = new WeakMap();

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

  function extractVideoTitle(scopeEl) {
    if (!scopeEl || !scopeEl.querySelector) return '';
    const titleEl = scopeEl.querySelector(VIDEO_TITLE_SELECTOR);
    if (!titleEl) return '';
    return (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
  }

  function matchTitleKeywordInCard(renderer) {
    if (!enabled || titleKeywords.length === 0 || !renderer.matches(TITLE_FILTER_RENDERER_SELECTOR)) return null;
    return ycbMatchTitleKeyword(extractVideoTitle(renderer), titleKeywords);
  }

  function currentVideoId() {
    try { return new URL(location.href).searchParams.get('v') || ''; }
    catch (_) { return ''; }
  }

  function currentWatchTitle() {
    const title = document.querySelector(
      'ytd-watch-metadata h1, ytd-video-primary-info-renderer h1, #title h1, h1.title'
    );
    const text = title && title.textContent ? title.textContent.trim() : '';
    return text;
  }

  function matchEntry(info) {
    if (!enabled || blockList.length === 0) return null;
    if (allowedList.some((entry) => {
      if (entry.type === 'id') return !!info.id && entry.value === info.id;
      if (entry.type === 'handle') return !!info.handle && entry.value.toLowerCase() === info.handle.toLowerCase();
      return entry.type === 'name' && !!info.name && entry.value.toLowerCase() === info.name.toLowerCase();
    })) return null;
    for (const entry of blockList) {
      if (entry.type === 'id' && info.id && entry.value === info.id) return entry;
      if (entry.type === 'handle' && info.handle && entry.value.toLowerCase() === info.handle) return entry;
      if (entry.type === 'name' && info.name &&
          info.name.toLowerCase().includes(entry.value.toLowerCase())) return entry;
    }
    return null;
  }

  // Cards may mention several channels (for example, a collaboration).
  // Match every channel URL inside the card, not only its primary author.
  function matchAnyChannelIn(scopeEl) {
    const candidates = [scopeEl, ...scopeEl.querySelectorAll(CHANNEL_LINK_SELECTOR)];
    for (const candidate of candidates) {
      const href = candidate.getAttribute && candidate.getAttribute('href');
      if (href) {
        const id = href.match(/(?:^|\/)channel\/(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/);
        const handle = href.match(/(?:^|\/)(@[A-Za-z0-9._-]{3,30})(?:[/?#]|$)/);
        const entry = matchEntry({ id: id && id[1], handle: handle && handle[1].toLowerCase(), name: null });
        if (entry) return entry;
      }
    }
    return matchEntry(extractChannelInfo(scopeEl));
  }

  function currentChannelEntry() {
    const path = location.pathname;
    const idMatch = path.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/);
    const handleMatch = path.match(/^\/@([A-Za-z0-9._-]{3,30})(?:\/|$)/);
    const info = {
      id: idMatch ? idMatch[1] : null,
      handle: handleMatch ? ('@' + handleMatch[1]).toLowerCase() : null,
      name: null
    };
    const heading = document.querySelector(
      'ytd-c4-tabbed-header-renderer #text, ytd-channel-name #text, #channel-header #text, yt-page-header-view-model h1'
    );
    if (heading && heading.textContent) info.name = heading.textContent.trim();
    if (!info.id && !info.handle && !info.name) return null;
    return matchEntry(info);
  }

  function showChannelPageBlock(entry) {
    if (!document.body) return;
    const key = entry.type + ':' + entry.value;
    let veil = document.querySelector('.ycb-channel-page-block');
    if (veil && veil.dataset.ycbKey !== key) {
      veil.remove();
      veil = null;
    }
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'ycb-channel-page-block';
      const card = document.createElement('div');
      card.className = 'ycb-overlay-card';
      const title = document.createElement('p');
      title.className = 'ycb-overlay-title';
      title.textContent = 'This channel is blocked';
      const subtitle = document.createElement('p');
      subtitle.className = 'ycb-overlay-sub';
      subtitle.textContent = entry.label || entry.value;
      const unblock = document.createElement('button');
      unblock.type = 'button';
      unblock.className = 'ycb-overlay-btn';
      unblock.textContent = 'Unblock and view channel';
      unblock.addEventListener('click', async () => {
        await ycbRemoveEntry(entry);
        veil.remove();
      });
      card.append(title, subtitle, unblock);
      veil.appendChild(card);
      document.body.appendChild(veil);
    }
    veil.dataset.ycbKey = key;
  }

  function checkChannelPage() {
    const isChannelPage = /^\/(?:@[^/]+|channel\/|user\/|c\/)/.test(location.pathname);
    const existing = document.querySelector('.ycb-channel-page-block');
    if (!enabled || !isChannelPage) {
      if (existing) existing.remove();
      return;
    }
    const entry = currentChannelEntry();
    if (entry) showChannelPageBlock(entry);
    else if (existing) existing.remove();
  }

  let pendingFilteredCount = 0;
  let statsTimer = null;

  function recordFiltered(renderer) {
    if (renderer.getAttribute('data-ycb-counted') === '1') return;
    renderer.setAttribute('data-ycb-counted', '1');
    pendingFilteredCount++;
    clearTimeout(statsTimer);
    statsTimer = setTimeout(async () => {
      const increment = pendingFilteredCount;
      pendingFilteredCount = 0;
      try {
        const stored = await chrome.storage.local.get(YCB_STATS_KEY);
        const total = Number(stored[YCB_STATS_KEY]) || 0;
        await chrome.storage.local.set({ [YCB_STATS_KEY]: total + increment });
      } catch (_) { /* Metrics are optional; filtering must continue if storage fails. */ }
    }, 700);
  }

  function setHidden(renderer, entry) {
    const hidden = !!entry;
    const placeholder = renderer.querySelector(':scope > .ycb-filter-placeholder');
    if (!hidden) {
      if (renderer.getAttribute('data-ycb-hidden') === '1') {
        renderer.removeAttribute('data-ycb-hidden');
        renderer.style.removeProperty('display');
      }
      renderer.removeAttribute('data-ycb-mode');
      if (placeholder) placeholder.remove();
      return;
    }

    recordFiltered(renderer);
    if (filterMode === 'placeholder') {
      renderer.removeAttribute('data-ycb-hidden');
      renderer.style.removeProperty('display');
      renderer.setAttribute('data-ycb-mode', 'placeholder');
      if (getComputedStyle(renderer).position === 'static') renderer.style.position = 'relative';
      if (!placeholder) {
        const note = document.createElement('div');
        note.className = 'ycb-filter-placeholder';
        const message = document.createElement('span');
        message.textContent = 'Content from a blocked channel';
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.textContent = 'Unblock';
        undo.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await ycbRemoveEntry({ type: note.dataset.ycbType, value: note.dataset.ycbValue });
        });
        note.append(message, undo);
        renderer.appendChild(note);
      }
      const currentPlaceholder = renderer.querySelector(':scope > .ycb-filter-placeholder');
      if (currentPlaceholder) {
        currentPlaceholder.dataset.ycbType = entry.type;
        currentPlaceholder.dataset.ycbValue = entry.value;
      }
      return;
    }

    renderer.removeAttribute('data-ycb-mode');
    if (placeholder) placeholder.remove();
    renderer.setAttribute('data-ycb-hidden', '1');
    renderer.style.setProperty('display', 'none', 'important');
  }

  function setKeywordHidden(renderer, rule) {
    if (rule) {
      recordFiltered(renderer);
      renderer.setAttribute('data-ycb-keyword-hidden', '1');
      renderer.style.setProperty('display', 'none', 'important');
    } else if (renderer.getAttribute('data-ycb-keyword-hidden') === '1') {
      renderer.removeAttribute('data-ycb-keyword-hidden');
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
    const title = document.createElement('p');
    title.className = 'ycb-dialog-title';
    title.textContent = 'Block this channel?';
    const message = document.createElement('p');
    message.className = 'ycb-dialog-msg';
    message.textContent = label;
    const row = document.createElement('div');
    row.className = 'ycb-dialog-row';
    const noButton = document.createElement('button');
    noButton.type = 'button';
    noButton.className = 'ycb-dialog-btn ycb-dialog-btn-no';
    noButton.textContent = 'No';
    const yesButton = document.createElement('button');
    yesButton.type = 'button';
    yesButton.className = 'ycb-dialog-btn ycb-dialog-btn-yes';
    yesButton.textContent = 'Yes, block';
    row.append(noButton, yesButton);
    box.append(title, message, row);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('ycb-dialog-show'));

    yesButton.addEventListener('click', () => {
      removeDialog();
      onChoice(true);
    });
    noButton.addEventListener('click', () => {
      removeDialog();
      onChoice(false);
    });
  }

  function showResultDialog(message, tone, undoEntry) {
    removeDialog();

    const box = document.createElement('div');
    box.className = 'ycb-dialog';
    const result = document.createElement('div');
    result.className = 'ycb-dialog-result';
    const icon = document.createElement('span');
    icon.className = 'ycb-dialog-result-icon ' + (tone || 'ok');
    const resultMessage = document.createElement('span');
    resultMessage.className = 'ycb-dialog-msg';
    resultMessage.style.cssText = 'margin:0;color:#EDEEF0;';
    resultMessage.textContent = message;
    result.append(icon, resultMessage);
    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.className = 'ycb-dialog-ok-btn';
    okButton.textContent = 'OK';
    box.append(result);
    if (undoEntry) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'ycb-dialog-undo-btn';
      undoButton.textContent = 'Undo block';
      undoButton.addEventListener('click', async () => {
        await ycbRemoveEntry(undoEntry);
        removeDialog();
      });
      box.appendChild(undoButton);
    }
    box.appendChild(okButton);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('ycb-dialog-show'));

    okButton.addEventListener('click', removeDialog);
    setTimeout(removeDialog, undoEntry ? 6000 : 3000);
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
        'ok',
        added ? entry : null
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
    const entry = matchAnyChannelIn(renderer);
    const keywordRule = matchTitleKeywordInCard(renderer);
    if (entry) {
      setKeywordHidden(renderer, null);
      setHidden(renderer, entry);
    } else {
      setHidden(renderer, null);
      setKeywordHidden(renderer, keywordRule);
    }
    if (!entry) attachBlockButton(renderer, info);
  }

  function scan(root) {
    if (root.matches && root.matches(RENDERER_SELECTOR)) processRenderer(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(RENDERER_SELECTOR).forEach(processRenderer);
    }
  }

  function removeOverlay() {
    blockedWatchPage = false;
    const existing = document.querySelector('.ycb-overlay');
    if (existing) existing.remove();
    const player = document.querySelector('#player, #movie_player');
    if (player) player.style.removeProperty('visibility');

    document.querySelectorAll('video').forEach((video) => {
      const state = blockedVideoStates.get(video);
      if (!state) return;
      video.muted = state.muted;
      video.volume = state.volume;
      video.autoplay = state.autoplay;
      blockedVideoStates.delete(video);
    });
    document.querySelectorAll('#movie_player').forEach((playerEl) => {
      const state = blockedPlayerStates.get(playerEl);
      if (!state) return;
      try {
        if (Number.isFinite(state.volume) && typeof playerEl.setVolume === 'function') {
          playerEl.setVolume(state.volume);
        }
        if (state.muted && typeof playerEl.mute === 'function') playerEl.mute();
        else if (!state.muted && typeof playerEl.unMute === 'function') playerEl.unMute();
      } catch (_) { /* YouTube may replace the player during navigation. */ }
      blockedPlayerStates.delete(playerEl);
    });
  }

  function suppressBlockedPlayback() {
    if (!blockedWatchPage) return;

    document.querySelectorAll('video').forEach((video) => {
      if (!blockedVideoStates.has(video)) {
        blockedVideoStates.set(video, {
          muted: video.muted,
          volume: video.volume,
          autoplay: video.autoplay
        });
      }
      video.autoplay = false;
      video.pause();
      video.muted = true;
      video.volume = 0;
    });

    const player = document.querySelector('#movie_player');
    if (player) {
      if (!blockedPlayerStates.has(player)) {
        let volume = null;
        let muted = false;
        try {
          if (typeof player.getVolume === 'function') volume = player.getVolume();
          if (typeof player.isMuted === 'function') muted = player.isMuted();
        } catch (_) { /* Player API is not ready yet. */ }
        blockedPlayerStates.set(player, { volume, muted });
      }
      try {
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
        if (typeof player.mute === 'function') player.mute();
        if (typeof player.setVolume === 'function') player.setVolume(0);
      } catch (_) { /* Retry on the next player/video event. */ }
    }
  }

  function guardBlockedVideoEvent(event) {
    if (!blockedWatchPage || !(event.target instanceof HTMLVideoElement)) return;
    const video = event.target;
    if (!blockedVideoStates.has(video)) {
      blockedVideoStates.set(video, {
        muted: video.muted,
        volume: video.volume,
        autoplay: video.autoplay
      });
    }
    video.pause();
    video.muted = true;
    video.volume = 0;
  }

  // YouTube can start or replace the media element after the first pause.
  // Catch those attempts in capture phase and re-apply pause + mute.
  document.addEventListener('play', guardBlockedVideoEvent, true);
  document.addEventListener('playing', guardBlockedVideoEvent, true);
  document.addEventListener('volumechange', guardBlockedVideoEvent, true);

  function showOverlay(entry, label) {
    const overlayKey = entry.type + ':' + entry.value;
    const existing = document.querySelector('.ycb-overlay');
    if (existing && existing.dataset.ycbKey === overlayKey) return;
    if (existing) existing.remove();
    const container = document.querySelector('#player, #movie_player, ytd-watch-flexy #player-container-inner');
    if (!container) return;

    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'ycb-overlay';
    const card = document.createElement('div');
    card.className = 'ycb-overlay-card';
    const icon = document.createElement('div');
    icon.className = 'ycb-overlay-icon';
    const title = document.createElement('p');
    title.className = 'ycb-overlay-title';
    title.textContent = entry.type === 'keyword' ? 'This video matches a title keyword' : 'This channel is blocked';
    const subtitle = document.createElement('p');
    subtitle.className = 'ycb-overlay-sub';
    subtitle.textContent = label || entry.value;
    const unblockButton = document.createElement('button');
    unblockButton.type = 'button';
    unblockButton.className = 'ycb-overlay-btn';
    unblockButton.textContent = entry.type === 'keyword' ? 'View this video anyway' : 'Unblock and watch';
    card.append(icon, title, subtitle, unblockButton);
    overlay.appendChild(card);
    overlay.dataset.ycbKey = overlayKey;

    unblockButton.addEventListener('click', async () => {
      if (entry.type === 'keyword') {
        const videoId = currentVideoId();
        if (videoId) allowedVideoIds.add(videoId);
        removeOverlay();
        checkWatchPage();
      } else {
        await ycbRemoveEntry(entry);
        removeOverlay();
      }
    });

    container.appendChild(overlay);

  }

  function checkWatchPage() {
    if (!location.pathname.startsWith('/watch')) {
      removeOverlay();
      return;
    }
    const owner = document.querySelector(
      'ytd-video-owner-renderer, #owner, ytd-watch-metadata #owner'
    );
    const info = owner ? extractChannelInfo(owner) : { id: null, handle: null, name: null };
    const channelEntry = matchEntry(info);
    if (channelEntry) {
      blockedWatchPage = true;
      showOverlay(channelEntry, info.name);
      suppressBlockedPlayback();
      return;
    }

    const videoId = currentVideoId();
    const keywordRule = enabled && titleKeywords.length > 0 && (!videoId || !allowedVideoIds.has(videoId))
      ? ycbMatchTitleKeyword(currentWatchTitle(), titleKeywords)
      : null;
    if (keywordRule) {
      const videoEntry = { type: 'keyword', value: keywordRule.value };
      blockedWatchPage = true;
      showOverlay(videoEntry, keywordRule.value);
      suppressBlockedPlayback();
    } else removeOverlay();
  }

  function rescanAll() {
    listVersion++;
    scan(document.body || document.documentElement);
    checkChannelPage();
    checkWatchPage();
  }

  async function refreshState() {
    const state = await ycbGetState();
    blockList = state.list;
    allowedList = state.allowed;
    titleKeywords = state.keywords;
    enabled = state.enabled;
    filterMode = state.mode;
    scheduleExpiryRefresh();
    rescanAll();
  }

  function scheduleExpiryRefresh() {
    clearTimeout(expiryTimer);
    const now = Date.now();
    const next = blockList.reduce((soonest, entry) => {
      const expiry = Number(entry.expiresAt) || 0;
      return expiry > now && (!soonest || expiry < soonest) ? expiry : soonest;
    }, 0);
    if (next) expiryTimer = setTimeout(() => refreshState(), Math.min(Math.max(next - now + 100, 100), 2147483000));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[YCB_STORAGE_KEY] || changes[YCB_ALLOWED_KEY] || changes[YCB_ENABLED_KEY] || changes[YCB_MODE_KEY] || changes[YCB_KEYWORDS_KEY]) refreshState();
  });

  const observer = new MutationObserver((mutations) => {
    let touched = false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const renderer = m.target.parentElement && m.target.parentElement.closest(RENDERER_SELECTOR);
        if (renderer) {
          renderer.removeAttribute('data-ycb-v');
          processRenderer(renderer);
        }
        touched = true;
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        scan(node);
        const parentRenderer = node.closest && node.closest(RENDERER_SELECTOR);
        if (parentRenderer) {
          parentRenderer.removeAttribute('data-ycb-v');
          processRenderer(parentRenderer);
        }
        touched = true;
      }
    }
    if (touched) {
      checkChannelPage();
      checkWatchPage();
    }
  });

  function start() {
    refreshState().then(() => {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
    document.addEventListener('yt-navigate-finish', () => rescanAll());
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
