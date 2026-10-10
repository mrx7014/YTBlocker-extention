(function () {
  const enabledToggle = document.getElementById('enabledToggle');
  const enabledLabel = document.getElementById('enabledLabel');
  const addType = document.getElementById('addType');
  const addInput = document.getElementById('addInput');
  const addBtn = document.getElementById('addBtn');
  const tableBody = document.getElementById('tableBody');
  const tableScroll = document.querySelector('.table-scroll');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyHint = document.getElementById('emptyHint');
  const countBadge = document.getElementById('countBadge');
  const listSummary = document.getElementById('listSummary');
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const clearBtn = document.getElementById('clearBtn');
  const statusMsg = document.getElementById('statusMsg');

  let entries = [];
  let statusTimer = null;

  function typeLabel(type) {
    if (type === 'id') return 'Channel ID';
    if (type === 'handle') return 'Handle';
    return 'Name';
  }

  function formatDate(ts) {
    if (!ts || !Number.isFinite(Number(ts))) return '—';
    const date = new Date(Number(ts));
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function showStatus(message, isError) {
    clearTimeout(statusTimer);
    statusMsg.textContent = message;
    statusMsg.classList.toggle('error', !!isError);
    statusMsg.hidden = false;
    statusTimer = setTimeout(() => { statusMsg.hidden = true; }, 3200);
  }

  function filteredEntries() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const filtered = entries.filter((entry) => {
      if (!query) return true;
      return [entry.label, entry.value, typeLabel(entry.type)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    });

    if (sortSelect.value === 'oldest') {
      filtered.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    } else if (sortSelect.value === 'name') {
      filtered.sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value, undefined, { sensitivity: 'base' }));
    } else {
      filtered.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
    return filtered;
  }

  function render(list) {
    entries = Array.isArray(list) ? list : [];
    const visible = filteredEntries();
    tableBody.replaceChildren();
    countBadge.textContent = String(entries.length);
    listSummary.textContent = visible.length === entries.length
      ? (entries.length ? `Showing all ${entries.length} blocked ${entries.length === 1 ? 'channel' : 'channels'}` : 'Your blocked-channel list is empty')
      : `Showing ${visible.length} of ${entries.length} channels`;

    if (!visible.length) {
      tableScroll.hidden = true;
      emptyState.style.display = 'flex';
      if (entries.length) {
        emptyTitle.textContent = 'No matches found';
        emptyHint.textContent = 'Try another channel name, handle, or ID.';
      } else {
        emptyTitle.textContent = 'Nothing blocked yet';
        emptyHint.textContent = 'Add a channel above and it will appear here.';
      }
      return;
    }

    tableScroll.hidden = false;
    emptyState.style.display = 'none';
    for (const entry of visible) {
      const row = document.createElement('tr');

      const channelCell = document.createElement('td');
      channelCell.textContent = entry.label || entry.value;

      const typeCell = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'type-pill';
      pill.textContent = typeLabel(entry.type);
      typeCell.appendChild(pill);

      const valueCell = document.createElement('td');
      valueCell.className = 'value-cell';
      valueCell.textContent = entry.value;

      const dateCell = document.createElement('td');
      dateCell.className = 'value-cell';
      dateCell.textContent = formatDate(entry.addedAt);

      const removeCell = document.createElement('td');
      removeCell.className = 'remove-cell';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.title = `Unblock ${entry.label || entry.value}`;
      removeBtn.setAttribute('aria-label', `Unblock ${entry.label || entry.value}`);
      removeBtn.textContent = '−';
      removeBtn.addEventListener('click', async () => {
        removeBtn.disabled = true;
        try {
          const updated = await ycbRemoveEntry({ type: entry.type, value: entry.value });
          render(updated);
          showStatus(`${entry.label || entry.value} was unblocked.`);
        } catch (error) {
          removeBtn.disabled = false;
          showStatus('Could not update the blocklist. Please try again.', true);
        }
      });
      removeCell.appendChild(removeBtn);

      row.append(channelCell, typeCell, valueCell, dateCell, removeCell);
      tableBody.appendChild(row);
    }
  }

  async function loadAll() {
    try {
      const state = await ycbGetState();
      enabledToggle.checked = state.enabled;
      enabledLabel.textContent = state.enabled ? 'On' : 'Off';
      render(state.list);
    } catch (error) {
      showStatus('Could not load the blocklist. Reload this page to try again.', true);
    }
  }

  enabledToggle.addEventListener('change', async () => {
    enabledLabel.textContent = enabledToggle.checked ? 'On' : 'Off';
    try {
      await chrome.storage.sync.set({ [YCB_ENABLED_KEY]: enabledToggle.checked });
      showStatus(enabledToggle.checked ? 'Blocking is on.' : 'Blocking is off. Your list is saved.');
    } catch (error) {
      enabledToggle.checked = !enabledToggle.checked;
      enabledLabel.textContent = enabledToggle.checked ? 'On' : 'Off';
      showStatus('Could not save this setting. Please try again.', true);
    }
  });

  function parseWithType() {
    const raw = addInput.value.trim();
    if (!raw) return null;
    if (addType.value === 'auto') return ycbNormalizeInput(raw);
    if (addType.value === 'id') {
      const match = raw.match(YCB_ID_PATTERN);
      return match ? { type: 'id', value: match[0] } : null;
    }
    if (addType.value === 'handle') {
      const match = raw.match(YCB_HANDLE_PATTERN);
      const value = match ? match[0] : (raw.startsWith('@') ? raw : '@' + raw);
      return /^@[A-Za-z0-9._-]{3,30}$/.test(value) ? { type: 'handle', value: value.toLowerCase() } : null;
    }
    return { type: 'name', value: raw };
  }

  async function addChannel() {
    const parsed = parseWithType();
    if (!parsed) {
      showStatus(addInput.value.trim() ? 'That channel ID or handle does not look valid.' : 'Enter a channel link, ID, handle, or name first.', true);
      addInput.focus();
      return;
    }
    if (parsed.type === 'id' && !/^UC[A-Za-z0-9_-]{22}$/.test(parsed.value)) {
      showStatus('Enter a valid YouTube channel ID (starts with UC).', true);
      addInput.focus();
      return;
    }

    addBtn.disabled = true;
    try {
      const { added, list } = await ycbAddEntry(parsed, parsed.value);
      addInput.value = '';
      render(list);
      showStatus(added ? `${parsed.value} added to your blocklist.` : `${parsed.value} is already blocked.`, !added);
    } catch (error) {
      showStatus('Could not save the channel. Your browser sync storage may be full.', true);
    } finally {
      addBtn.disabled = false;
      addInput.focus();
    }
  }

  addBtn.addEventListener('click', addChannel);
  addInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addChannel();
  });
  searchInput.addEventListener('input', () => render(entries));
  sortSelect.addEventListener('change', () => render(entries));

  exportBtn.addEventListener('click', async () => {
    try {
      const { list } = await ycbGetState();
      if (!list.length) {
        showStatus('There are no blocked channels to export.', true);
        return;
      }
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'youtube-channel-blocklist.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(`${list.length} ${list.length === 1 ? 'channel' : 'channels'} exported.`);
    } catch (error) {
      showStatus('Could not export the blocklist.', true);
    }
  });

  function normalizeImportedEntry(item) {
    if (!item || typeof item.value !== 'string') return null;
    const value = item.value.trim();
    if (!value || !['id', 'handle', 'name'].includes(item.type)) return null;
    if (item.type === 'id' && !/^UC[A-Za-z0-9_-]{22}$/.test(value)) return null;
    if (item.type === 'handle' && !/^@[A-Za-z0-9._-]{3,30}$/.test(value)) return null;
    if (item.type === 'name' && !value) return null;
    return {
      type: item.type,
      value: item.type === 'handle' ? value.toLowerCase() : value,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : value,
      addedAt: Number.isFinite(Number(item.addedAt)) && Number(item.addedAt) > 0 ? Number(item.addedAt) : Date.now()
    };
  }

  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
      const { list: current } = await ycbGetState();
      const seen = new Set(current.map(ycbEntryKey));
      const merged = current.slice();
      let skipped = 0;

      for (const item of parsed) {
        const entry = normalizeImportedEntry(item);
        if (!entry) { skipped++; continue; }
        const key = ycbEntryKey(entry);
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);
        merged.push(entry);
      }

      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: merged });
      render(merged);
      showStatus(`${merged.length - current.length} added; ${skipped} invalid or duplicate entries skipped.`);
    } catch (error) {
      showStatus('Could not import that file. Choose a JSON blocklist exported by this extension.', true);
    } finally {
      importInput.value = '';
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!entries.length) {
      showStatus('Your blocklist is already empty.');
      return;
    }
    if (!confirm(`Remove all ${entries.length} blocked channels? This cannot be undone.`)) return;
    try {
      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: [] });
      render([]);
      showStatus('All blocked channels were removed.');
    } catch (error) {
      showStatus('Could not clear the list. Please try again.', true);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[YCB_STORAGE_KEY]) render(Array.isArray(changes[YCB_STORAGE_KEY].newValue) ? changes[YCB_STORAGE_KEY].newValue : []);
    if (changes[YCB_ENABLED_KEY]) {
      const value = changes[YCB_ENABLED_KEY].newValue !== false;
      enabledToggle.checked = value;
      enabledLabel.textContent = value ? 'On' : 'Off';
    }
  });

  loadAll();
})();
