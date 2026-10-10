(function () {
  const enabledToggle = document.getElementById('enabledToggle');
  const enabledLabel = document.getElementById('enabledLabel');
  const filterModeToggle = document.getElementById('filterModeToggle');
  const addType = document.getElementById('addType');
  const addInput = document.getElementById('addInput');
  const expirySelect = document.getElementById('expirySelect');
  const categoryInput = document.getElementById('categoryInput');
  const noteInput = document.getElementById('noteInput');
  const addBtn = document.getElementById('addBtn');
  const tableBody = document.getElementById('tableBody');
  const tableScroll = document.querySelector('.table-scroll');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptyHint = document.getElementById('emptyHint');
  const countBadge = document.getElementById('countBadge');
  const totalBlockedStat = document.getElementById('totalBlockedStat');
  const filteredCountStat = document.getElementById('filteredCountStat');
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const listSummary = document.getElementById('listSummary');
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const bulkToolbar = document.getElementById('bulkToolbar');
  const selectAllRows = document.getElementById('selectAllRows');
  const selectedCount = document.getElementById('selectedCount');
  const bulkExportBtn = document.getElementById('bulkExportBtn');
  const bulkRemoveBtn = document.getElementById('bulkRemoveBtn');
  const exportFormat = document.getElementById('exportFormat');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const clearBtn = document.getElementById('clearBtn');
  const allowType = document.getElementById('allowType');
  const allowInput = document.getElementById('allowInput');
  const allowAddBtn = document.getElementById('allowAddBtn');
  const allowCount = document.getElementById('allowCount');
  const allowList = document.getElementById('allowList');
  const allowEmpty = document.getElementById('allowEmpty');
  const statusMsg = document.getElementById('statusMsg');

  let entries = [];
  let allowedEntries = [];
  let selectedKeys = new Set();
  let statusTimer = null;
  let expiryTimer = null;

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

  function formatExpiry(ts) {
    if (!ts) return 'Never';
    const remaining = Number(ts) - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.ceil(remaining / 60000);
    if (minutes < 60) return `In ${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `In ${hours}h`;
    return `In ${Math.ceil(hours / 24)}d`;
  }

  function showStatus(message, isError, undo) {
    clearTimeout(statusTimer);
    statusMsg.replaceChildren();
    statusMsg.classList.toggle('error', !!isError);
    const text = document.createElement('span');
    text.textContent = message;
    statusMsg.appendChild(text);
    if (undo) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-undo';
      button.textContent = 'Undo';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const restore = async (entry) => {
            const metadata = { ...entry };
            delete metadata.type; delete metadata.value; delete metadata.label; delete metadata.addedAt;
            await ycbAddEntry({ type: entry.type, value: entry.value }, entry.label, metadata, undo.storageKey);
          };
          if (undo.action === 'restore') await restore(undo.entry);
          else if (undo.action === 'restoreMany') {
            for (const entry of undo.entries) await restore(entry);
          } else await ycbRemoveEntry(undo.entry, undo.storageKey);
          const state = await ycbGetState();
          renderBlocked(state.list);
          renderAllowed(state.allowed);
          showStatus('Action undone.');
        } catch (error) {
          showStatus('Could not undo that action.', true);
        }
      });
      statusMsg.appendChild(button);
    }
    statusMsg.hidden = false;
    statusTimer = setTimeout(() => { statusMsg.hidden = true; }, undo ? 6000 : 3500);
  }

  function activeVisibleEntries() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const filtered = entries.filter((entry) => {
      if (!query) return true;
      return [entry.label, entry.value, entry.category, entry.note, typeLabel(entry.type)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    });
    if (sortSelect.value === 'oldest') filtered.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    else if (sortSelect.value === 'name') filtered.sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value, undefined, { sensitivity: 'base' }));
    else filtered.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return filtered;
  }

  function selectedEntries() {
    return entries.filter((entry) => selectedKeys.has(ycbEntryKey(entry)));
  }

  function renderBlocked(list) {
    entries = Array.isArray(list) ? list : [];
    const visible = activeVisibleEntries();
    tableBody.replaceChildren();
    countBadge.textContent = String(entries.length);
    totalBlockedStat.textContent = String(entries.length);
    listSummary.textContent = visible.length === entries.length
      ? (entries.length ? `Showing all ${entries.length} blocked ${entries.length === 1 ? 'channel' : 'channels'}` : 'Your blocked-channel list is empty')
      : `Showing ${visible.length} of ${entries.length} channels`;

    if (!visible.length) {
      tableScroll.hidden = true;
      emptyState.style.display = 'flex';
      if (entries.length) {
        emptyTitle.textContent = 'No matches found';
        emptyHint.textContent = 'Try another name, handle, category, or channel ID.';
      } else {
        emptyTitle.textContent = 'Nothing blocked yet';
        emptyHint.textContent = 'Add a channel above and it will appear here.';
      }
      updateBulkControls(visible);
      return;
    }

    tableScroll.hidden = false;
    emptyState.style.display = 'none';
    for (const entry of visible) {
      const row = document.createElement('tr');
      const selectCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'row-select';
      checkbox.checked = selectedKeys.has(ycbEntryKey(entry));
      checkbox.setAttribute('aria-label', `Select ${entry.label || entry.value}`);
      checkbox.addEventListener('change', () => {
        const key = ycbEntryKey(entry);
        if (checkbox.checked) selectedKeys.add(key); else selectedKeys.delete(key);
        updateBulkControls(visible);
      });
      selectCell.appendChild(checkbox);

      const channelCell = document.createElement('td');
      const channelName = document.createElement('strong');
      channelName.className = 'channel-label';
      channelName.textContent = entry.label || entry.value;
      channelCell.appendChild(channelName);

      const categoryCell = document.createElement('td');
      const category = document.createElement('span');
      category.className = 'category-pill';
      category.textContent = entry.category || 'General';
      categoryCell.appendChild(category);

      const typeCell = document.createElement('td');
      const type = document.createElement('span');
      type.className = 'type-pill';
      type.textContent = typeLabel(entry.type);
      typeCell.appendChild(type);

      const valueCell = document.createElement('td');
      valueCell.className = 'value-cell';
      valueCell.textContent = entry.value;

      const noteCell = document.createElement('td');
      noteCell.className = 'note-cell';
      noteCell.textContent = entry.note || '—';
      noteCell.title = entry.note || '';

      const expiryCell = document.createElement('td');
      expiryCell.className = entry.expiresAt ? 'expiry-cell temporary' : 'expiry-cell';
      expiryCell.textContent = formatExpiry(entry.expiresAt);

      const dateCell = document.createElement('td');
      dateCell.className = 'value-cell';
      dateCell.textContent = formatDate(entry.addedAt);

      const actionCell = document.createElement('td');
      actionCell.className = 'remove-cell';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.title = `Unblock ${entry.label || entry.value}`;
      removeBtn.setAttribute('aria-label', `Unblock ${entry.label || entry.value}`);
      removeBtn.textContent = '−';
      removeBtn.addEventListener('click', async () => {
        try {
          await ycbRemoveEntry(entry);
          selectedKeys.delete(ycbEntryKey(entry));
          renderBlocked(entries.filter((item) => ycbEntryKey(item) !== ycbEntryKey(entry)));
          showStatus(`${entry.label || entry.value} unblocked.`, false, { action: 'restore', entry });
        } catch (error) {
          showStatus('Could not update the blocklist.', true);
        }
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-meta-btn';
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('aria-label', `Edit category or note for ${entry.label || entry.value}`);
      editBtn.addEventListener('click', async () => {
        const categoryValue = prompt('Category for this channel:', entry.category || 'General');
        if (categoryValue === null) return;
        const noteValue = prompt('Optional note:', entry.note || '');
        if (noteValue === null) return;
        const updated = entries.map((item) => ycbEntryKey(item) === ycbEntryKey(entry)
          ? { ...item, category: categoryValue.trim() || 'General', note: noteValue.trim().slice(0, 120) }
          : item);
        try {
          await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: updated });
          renderBlocked(updated);
          showStatus('Category and note updated.');
        } catch (_) { showStatus('Could not save the channel details.', true); }
      });
      actionCell.appendChild(editBtn);
      actionCell.appendChild(removeBtn);
      row.append(selectCell, channelCell, categoryCell, typeCell, valueCell, noteCell, expiryCell, dateCell, actionCell);
      tableBody.appendChild(row);
    }
    updateBulkControls(visible);
    scheduleExpiry(entries);
  }

  function updateBulkControls(visible) {
    const selected = selectedEntries();
    bulkToolbar.hidden = selected.length === 0;
    selectedCount.textContent = `${selected.length} selected`;
    const visibleSelected = visible.filter((entry) => selectedKeys.has(ycbEntryKey(entry))).length;
    selectAllRows.checked = visible.length > 0 && visibleSelected === visible.length;
    selectAllRows.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  }

  function renderAllowed(list) {
    allowedEntries = Array.isArray(list) ? list : [];
    allowCount.textContent = String(allowedEntries.length);
    allowList.replaceChildren();
    allowEmpty.hidden = allowedEntries.length > 0;
    for (const entry of allowedEntries) {
      const item = document.createElement('li');
      item.className = 'allow-item';
      const main = document.createElement('div');
      main.className = 'allow-main';
      const label = document.createElement('strong');
      label.textContent = entry.label || entry.value;
      const detail = document.createElement('span');
      detail.textContent = `${typeLabel(entry.type)} · ${entry.value}`;
      main.append(label, detail);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.textContent = '−';
      remove.title = `Remove exception for ${entry.label || entry.value}`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', async () => {
        try {
          await ycbRemoveEntry(entry, YCB_ALLOWED_KEY);
          renderAllowed(allowedEntries.filter((candidate) => ycbEntryKey(candidate) !== ycbEntryKey(entry)));
          showStatus(`Exception removed for ${entry.label || entry.value}.`, false, {
            action: 'restore', entry, storageKey: YCB_ALLOWED_KEY
          });
        } catch (error) {
          showStatus('Could not update the allowlist.', true);
        }
      });
      item.append(main, remove);
      allowList.appendChild(item);
    }
  }

  function scheduleExpiry(list) {
    clearTimeout(expiryTimer);
    const next = list.reduce((soonest, entry) => {
      const expiresAt = Number(entry.expiresAt) || 0;
      return expiresAt > Date.now() && (!soonest || expiresAt < soonest) ? expiresAt : soonest;
    }, 0);
    if (!next) return;
    expiryTimer = setTimeout(async () => {
      try {
        const state = await ycbGetState();
        if (state.list.length !== entries.length) showStatus('A temporary block expired and was removed.');
        renderBlocked(state.list);
      } catch (_) { /* Expiration is checked again when the settings page reloads. */ }
    }, Math.min(Math.max(next - Date.now() + 100, 100), 2147483000));
  }

  async function updateStats() {
    try {
      const result = await chrome.storage.local.get(YCB_STATS_KEY);
      filteredCountStat.textContent = String(Number(result[YCB_STATS_KEY]) || 0);
    } catch (_) {
      filteredCountStat.textContent = '—';
    }
  }

  async function loadAll() {
    try {
      const state = await ycbGetState();
      enabledToggle.checked = state.enabled;
      enabledLabel.textContent = state.enabled ? 'On' : 'Off';
      filterModeToggle.value = state.mode || 'hide';
      renderBlocked(state.list);
      renderAllowed(state.allowed);
      updateStats();
    } catch (error) {
      showStatus('Could not load settings. Reload this page to try again.', true);
    }
  }

  enabledToggle.addEventListener('change', async () => {
    try {
      await chrome.storage.sync.set({ [YCB_ENABLED_KEY]: enabledToggle.checked });
      enabledLabel.textContent = enabledToggle.checked ? 'On' : 'Off';
      showStatus(enabledToggle.checked ? 'Blocking is on.' : 'Blocking is off. Your lists are saved.');
    } catch (error) {
      enabledToggle.checked = !enabledToggle.checked;
      showStatus('Could not save this setting.', true);
    }
  });

  filterModeToggle.addEventListener('change', async () => {
    const mode = filterModeToggle.value === 'placeholder' ? 'placeholder' : 'hide';
    try {
      await chrome.storage.sync.set({ [YCB_MODE_KEY]: mode });
      showStatus(mode === 'hide' ? 'Blocked cards will be hidden completely.' : 'Blocked cards will show a placeholder.');
    } catch (error) {
      showStatus('Could not save the display mode.', true);
    }
  });

  function parseInput(input, typeSelect) {
    const raw = input.value.trim();
    if (!raw) return null;
    if (typeSelect.value === 'auto') return ycbNormalizeInput(raw);
    if (typeSelect.value === 'id') {
      const match = raw.match(YCB_ID_PATTERN);
      return match ? { type: 'id', value: match[0] } : null;
    }
    if (typeSelect.value === 'handle') {
      const match = raw.match(YCB_HANDLE_PATTERN);
      const value = match ? match[0] : (raw.startsWith('@') ? raw : '@' + raw);
      return /^@[A-Za-z0-9._-]{3,30}$/.test(value) ? { type: 'handle', value: value.toLowerCase() } : null;
    }
    return { type: 'name', value: raw };
  }

  function confirmNameRule(entry, allow) {
    if (entry.type !== 'name') return true;
    const message = allow
      ? `Allowlist names match exactly. “${entry.value}” will be exempt only when the visible channel name is exactly the same. For a more reliable rule, use an ID or @handle. Continue?`
      : `Name matching is approximate and may block similarly named channels. For a precise block, use the channel ID or @handle instead. Add “${entry.value}” by name anyway?`;
    return confirm(message);
  }

  addBtn.addEventListener('click', async () => {
    const parsed = parseInput(addInput, addType);
    if (!parsed) {
      showStatus('Enter a valid channel link, ID, handle, or name.', true);
      addInput.focus();
      return;
    }
    if (parsed.type === 'id' && !/^UC[A-Za-z0-9_-]{22}$/.test(parsed.value)) {
      showStatus('Enter a valid channel ID starting with UC.', true);
      return;
    }
    if (!confirmNameRule(parsed, false)) return;
    const duration = Number(expirySelect.value) || 0;
    const metadata = {
      category: categoryInput.value || 'General',
      note: noteInput.value.trim()
    };
    if (duration > 0) metadata.expiresAt = Date.now() + duration;
    addBtn.disabled = true;
    try {
      const { added, list } = await ycbAddEntry(parsed, parsed.value, metadata);
      if (!added) {
        showStatus(`${parsed.value} is already blocked.`, true);
      } else {
        addInput.value = '';
        noteInput.value = '';
        expirySelect.value = '0';
        renderBlocked(list);
        showStatus(`${parsed.value} added to the blocklist${duration ? ' temporarily' : ''}.`, false, { action: 'remove', entry: parsed });
      }
    } catch (error) {
      showStatus('Could not save this channel. Browser sync storage may be full.', true);
    } finally {
      addBtn.disabled = false;
      addInput.focus();
    }
  });

  addInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') addBtn.click(); });
  searchInput.addEventListener('input', () => renderBlocked(entries));
  sortSelect.addEventListener('change', () => renderBlocked(entries));

  selectAllRows.addEventListener('change', () => {
    const visible = activeVisibleEntries();
    for (const entry of visible) {
      if (selectAllRows.checked) selectedKeys.add(ycbEntryKey(entry));
      else selectedKeys.delete(ycbEntryKey(entry));
    }
    renderBlocked(entries);
  });

  function csvEscape(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function makeCsv(list) {
    const columns = ['type', 'value', 'label', 'category', 'note', 'addedAt', 'expiresAt'];
    return '\uFEFF' + [columns.join(','), ...list.map((entry) => columns.map((column) => csvEscape(entry[column])).join(','))].join('\r\n') + '\r\n';
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field === '') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        row.push(field); rows.push(row); row = []; field = '';
        if (char === '\r' && text[i + 1] === '\n') i++;
      } else field += char;
    }
    if (quoted) throw new Error('Unclosed quoted CSV field');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) throw new Error('Empty CSV file');
    const headers = rows.shift().map((header) => String(header).replace(/^\uFEFF/, '').trim().toLowerCase());
    const indexes = Object.fromEntries(['type', 'value', 'label', 'category', 'note', 'addedat', 'expiresat'].map((key) => [key, headers.indexOf(key)]));
    if (indexes.type < 0 || indexes.value < 0) throw new Error('CSV must have type and value columns');
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== '')).map((cells) => ({
      type: cells[indexes.type], value: cells[indexes.value],
      label: indexes.label >= 0 ? cells[indexes.label] : '',
      category: indexes.category >= 0 ? cells[indexes.category] : 'General',
      note: indexes.note >= 0 ? cells[indexes.note] : '',
      addedAt: indexes.addedat >= 0 ? cells[indexes.addedat] : '',
      expiresAt: indexes.expiresat >= 0 ? cells[indexes.expiresat] : ''
    }));
  }

  function downloadEntries(list, selectedOnly) {
    if (!list.length) { showStatus('There are no channels to export.', true); return; }
    const format = exportFormat.value === 'csv' ? 'csv' : 'json';
    const contents = format === 'csv' ? makeCsv(list) : JSON.stringify(list, null, 2);
    const blob = new Blob([contents], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `youtube-channel-blocklist${selectedOnly ? '-selected' : ''}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus(`${list.length} ${list.length === 1 ? 'channel' : 'channels'} exported as ${format.toUpperCase()}.`);
  }

  exportBtn.addEventListener('click', async () => {
    try { const state = await ycbGetState(); downloadEntries(state.list, false); }
    catch (_) { showStatus('Could not export the blocklist.', true); }
  });
  bulkExportBtn.addEventListener('click', () => downloadEntries(selectedEntries(), true));

  bulkRemoveBtn.addEventListener('click', async () => {
    const selected = selectedEntries();
    if (!selected.length || !confirm(`Remove ${selected.length} selected ${selected.length === 1 ? 'channel' : 'channels'}?`)) return;
    try {
      const keys = new Set(selected.map(ycbEntryKey));
      const updated = entries.filter((entry) => !keys.has(ycbEntryKey(entry)));
      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: updated });
      selectedKeys.clear();
      renderBlocked(updated);
      showStatus(`${selected.length} channels removed.`, false, { action: 'restoreMany', entries: selected });
    } catch (_) { showStatus('Could not remove the selected channels.', true); }
  });

  function normalizeImportedEntry(item) {
    if (!item || typeof item.value !== 'string') return null;
    const value = item.value.trim();
    if (!value || !['id', 'handle', 'name'].includes(item.type)) return null;
    if (item.type === 'id' && !/^UC[A-Za-z0-9_-]{22}$/.test(value)) return null;
    if (item.type === 'handle' && !/^@[A-Za-z0-9._-]{3,30}$/.test(value)) return null;
    const expiresAt = Number(item.expiresAt) || 0;
    if (expiresAt && expiresAt <= Date.now()) return null;
    return {
      type: item.type,
      value: item.type === 'handle' ? value.toLowerCase() : value,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : value,
      category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'General',
      note: typeof item.note === 'string' ? item.note.slice(0, 120) : '',
      ...(expiresAt ? { expiresAt } : {}),
      addedAt: Number.isFinite(Number(item.addedAt)) && Number(item.addedAt) > 0 ? Number(item.addedAt) : Date.now()
    };
  }

  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const text = await file.text();
      const parsed = isCsv ? parseCsv(text) : JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      const { list: current } = await ycbGetState();
      const seen = new Set(current.map(ycbEntryKey));
      const merged = current.slice();
      let skipped = 0;
      for (const item of parsed) {
        const entry = normalizeImportedEntry(item);
        if (!entry || seen.has(ycbEntryKey(entry))) { skipped++; continue; }
        seen.add(ycbEntryKey(entry));
        merged.push(entry);
      }
      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: merged });
      selectedKeys.clear();
      renderBlocked(merged);
      showStatus(`${merged.length - current.length} added; ${skipped} invalid, expired, or duplicate entries skipped.`);
    } catch (_) {
      showStatus('Could not import that file. Choose a valid JSON or CSV blocklist.', true);
    } finally { importInput.value = ''; }
  });

  clearBtn.addEventListener('click', async () => {
    if (!entries.length) { showStatus('Your blocklist is already empty.'); return; }
    if (!confirm(`Remove all ${entries.length} blocked channels? You can undo this action immediately afterward.`)) return;
    try {
      const previous = entries.slice();
      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: [] });
      selectedKeys.clear();
      renderBlocked([]);
      showStatus('All blocked channels were removed.', false, { action: 'restoreMany', entries: previous });
    } catch (_) { showStatus('Could not clear the list. Please try again.', true); }
  });

  allowAddBtn.addEventListener('click', async () => {
    const parsed = parseInput(allowInput, allowType);
    if (!parsed) { showStatus('Enter a valid channel ID, @handle, or name.', true); allowInput.focus(); return; }
    if (!confirmNameRule(parsed, true)) return;
    allowAddBtn.disabled = true;
    try {
      const { added, list } = await ycbAddEntry(parsed, parsed.value, {}, YCB_ALLOWED_KEY);
      if (!added) { showStatus('That exception already exists.', true); return; }
      allowInput.value = '';
      renderAllowed(list);
      showStatus(`${parsed.value} will be allowed.`, false, { action: 'remove', entry: parsed, storageKey: YCB_ALLOWED_KEY });
    } catch (_) { showStatus('Could not save the allowlist exception.', true); }
    finally { allowAddBtn.disabled = false; }
  });
  allowInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') allowAddBtn.click(); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes[YCB_STORAGE_KEY]) {
        const updated = Array.isArray(changes[YCB_STORAGE_KEY].newValue) ? changes[YCB_STORAGE_KEY].newValue : [];
        renderBlocked(updated);
      }
      if (changes[YCB_ALLOWED_KEY]) renderAllowed(Array.isArray(changes[YCB_ALLOWED_KEY].newValue) ? changes[YCB_ALLOWED_KEY].newValue : []);
      if (changes[YCB_ENABLED_KEY]) {
        enabledToggle.checked = changes[YCB_ENABLED_KEY].newValue !== false;
        enabledLabel.textContent = enabledToggle.checked ? 'On' : 'Off';
      }
      if (changes[YCB_MODE_KEY]) filterModeToggle.value = changes[YCB_MODE_KEY].newValue === 'placeholder' ? 'placeholder' : 'hide';
    }
    if (area === 'local' && changes[YCB_STATS_KEY]) filteredCountStat.textContent = String(Number(changes[YCB_STATS_KEY].newValue) || 0);
  });

  resetStatsBtn.addEventListener('click', async () => {
    try { await chrome.storage.local.set({ [YCB_STATS_KEY]: 0 }); filteredCountStat.textContent = '0'; showStatus('Local filtering estimate reset.'); }
    catch (_) { showStatus('Could not reset local stats.', true); }
  });

  loadAll();
})();
