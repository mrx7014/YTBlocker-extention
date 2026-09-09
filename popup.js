(function () {
  const enabledToggle = document.getElementById('enabledToggle');
  const addInput = document.getElementById('addInput');
  const addBtn = document.getElementById('addBtn');
  const list = document.getElementById('blockedList');
  const emptyState = document.getElementById('emptyState');
  const countBadge = document.getElementById('countBadge');
  const currentRow = document.getElementById('currentChannelRow');
  const currentName = document.getElementById('currentChannelName');
  const blockCurrentBtn = document.getElementById('blockCurrentBtn');
  const openOptions = document.getElementById('openOptions');
  const statusMsg = document.getElementById('statusMsg');
  const confirmBar = document.getElementById('confirmBar');
  const confirmMsg = document.getElementById('confirmMsg');
  const confirmYes = document.getElementById('confirmYes');
  const confirmNo = document.getElementById('confirmNo');

  let currentDetected = null;
  let statusTimer = null;
  let pendingChoice = null;

  function showStatus(text) {
    clearTimeout(statusTimer);
    statusMsg.textContent = text;
    statusMsg.hidden = false;
    statusTimer = setTimeout(() => {
      statusMsg.hidden = true;
    }, 2500);
  }

  function askToBlock(label, onChoice) {
    confirmMsg.textContent = 'Block "' + label + '"?';
    confirmBar.hidden = false;
    pendingChoice = onChoice;
  }

  confirmYes.addEventListener('click', () => {
    confirmBar.hidden = true;
    const choice = pendingChoice;
    pendingChoice = null;
    if (choice) choice(true);
  });

  confirmNo.addEventListener('click', () => {
    confirmBar.hidden = true;
    const choice = pendingChoice;
    pendingChoice = null;
    if (choice) choice(false);
    showStatus('Cancelled — channel was not blocked.');
  });

  function typeLabel(type) {
    if (type === 'id') return 'ID';
    if (type === 'handle') return 'handle';
    return 'name';
  }

  function render(list_) {
    list.innerHTML = '';
    countBadge.textContent = String(list_.length);
    emptyState.style.display = list_.length ? 'none' : 'block';

    list_
      .slice()
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'blocked-item';

        const label = document.createElement('span');
        label.className = 'blocked-item-label';
        label.textContent = entry.label || entry.value;

        const type = document.createElement('span');
        type.className = 'blocked-item-type';
        type.textContent = typeLabel(entry.type);
        label.appendChild(type);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Unblock';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', async () => {
          const updated = await ycbRemoveEntry({ type: entry.type, value: entry.value });
          render(updated);
          refreshCurrentRow();
        });

        li.appendChild(label);
        li.appendChild(removeBtn);
        list.appendChild(li);
      });
  }

  async function loadAll() {
    const state = await ycbGetState();
    enabledToggle.checked = state.enabled;
    render(state.list);
  }

  enabledToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ [YCB_ENABLED_KEY]: enabledToggle.checked });
  });

  addBtn.addEventListener('click', () => {
    const parsed = ycbNormalizeInput(addInput.value);
    if (!parsed) return;
    askToBlock(parsed.value, async (yes) => {
      if (!yes) return;
      const { added, list: updated } = await ycbAddEntry(parsed);
      addInput.value = '';
      render(updated);
      refreshCurrentRow();
      showStatus(added ? (parsed.value + ' has been blocked.') : (parsed.value + ' is already blocked.'));
    });
  });

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  openOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function detectChannelOnPage() {
    // Runs inside the active tab via chrome.scripting.executeScript.
    const path = location.pathname;
    const nameFrom = (scope) => {
      const el = scope && scope.querySelector(
        '#channel-name #text, ytd-channel-name #text, #text.ytd-channel-name'
      );
      return el ? el.textContent.trim() : null;
    };

    const idMatch = path.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})/);
    if (idMatch) return { type: 'id', value: idMatch[1], label: nameFrom(document) || idMatch[1] };

    const handleMatch = path.match(/^\/(@[A-Za-z0-9._-]{3,30})/);
    if (handleMatch) {
      return { type: 'handle', value: handleMatch[1].toLowerCase(), label: nameFrom(document) || handleMatch[1] };
    }

    if (path.startsWith('/watch')) {
      const owner = document.querySelector('ytd-video-owner-renderer, #owner, ytd-watch-metadata #owner');
      if (owner) {
        const link = owner.querySelector('a[href*="/@"], a[href*="/channel/"]');
        if (link) {
          const href = link.getAttribute('href') || '';
          const idm = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
          const hm = href.match(/\/(@[A-Za-z0-9._-]{3,30})/);
          const label = nameFrom(owner);
          if (idm) return { type: 'id', value: idm[1], label: label || idm[1] };
          if (hm) return { type: 'handle', value: hm[1].toLowerCase(), label: label || hm[1] };
        }
      }
    }
    return null;
  }

  async function refreshCurrentRow() {
    currentRow.hidden = true;
    currentDetected = null;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/youtube\.com/.test(tab.url)) return;

    let result;
    try {
      [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: detectChannelOnPage
      });
    } catch (e) {
      return;
    }
    const detected = result && result.result;
    if (!detected) return;

    const { list: current } = await ycbGetState();
    const already = current.some(
      (e) => e.type === detected.type && e.value.toLowerCase() === detected.value.toLowerCase()
    );
    if (already) return;

    currentDetected = detected;
    currentName.textContent = detected.label;
    currentRow.hidden = false;
  }

  blockCurrentBtn.addEventListener('click', () => {
    if (!currentDetected) return;
    const detected = currentDetected;
    askToBlock(detected.label, async (yes) => {
      if (!yes) return;
      const { list: updated } = await ycbAddEntry(
        { type: detected.type, value: detected.value },
        detected.label
      );
      render(updated);
      showStatus(detected.label + ' has been blocked.');
      currentRow.hidden = true;
      currentDetected = null;
    });
  });

  loadAll();
  refreshCurrentRow();
})();
