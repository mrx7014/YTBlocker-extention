(function () {
  const enabledToggle = document.getElementById('enabledToggle');
  const enabledLabel = document.getElementById('enabledLabel');
  const addType = document.getElementById('addType');
  const addInput = document.getElementById('addInput');
  const addBtn = document.getElementById('addBtn');
  const tableBody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const countBadge = document.getElementById('countBadge');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const clearBtn = document.getElementById('clearBtn');

  function typeLabel(type) {
    if (type === 'id') return 'Channel ID';
    if (type === 'handle') return 'Handle';
    return 'Name';
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function render(list) {
    tableBody.innerHTML = '';
    countBadge.textContent = String(list.length);
    emptyState.style.display = list.length ? 'none' : 'block';

    list
      .slice()
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .forEach((entry) => {
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = entry.label || entry.value;

        const typeTd = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'type-pill';
        pill.textContent = typeLabel(entry.type);
        typeTd.appendChild(pill);

        const valueTd = document.createElement('td');
        valueTd.className = 'value-cell';
        valueTd.textContent = entry.value;

        const dateTd = document.createElement('td');
        dateTd.className = 'value-cell';
        dateTd.textContent = formatDate(entry.addedAt);

        const removeTd = document.createElement('td');
        removeTd.className = 'remove-cell';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Unblock';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', async () => {
          const updated = await ycbRemoveEntry({ type: entry.type, value: entry.value });
          render(updated);
        });
        removeTd.appendChild(removeBtn);

        tr.append(nameTd, typeTd, valueTd, dateTd, removeTd);
        tableBody.appendChild(tr);
      });
  }

  async function loadAll() {
    const state = await ycbGetState();
    enabledToggle.checked = state.enabled;
    enabledLabel.textContent = state.enabled ? 'On' : 'Off';
    render(state.list);
  }

  enabledToggle.addEventListener('change', async () => {
    enabledLabel.textContent = enabledToggle.checked ? 'On' : 'Off';
    await chrome.storage.sync.set({ [YCB_ENABLED_KEY]: enabledToggle.checked });
  });

  function parseWithType() {
    const raw = addInput.value.trim();
    if (!raw) return null;
    if (addType.value === 'auto') return ycbNormalizeInput(raw);
    if (addType.value === 'id') {
      const m = raw.match(YCB_ID_PATTERN);
      return { type: 'id', value: m ? m[0] : raw };
    }
    if (addType.value === 'handle') {
      const m = raw.match(YCB_HANDLE_PATTERN);
      const value = m ? m[0] : (raw.startsWith('@') ? raw : '@' + raw);
      return { type: 'handle', value: value.toLowerCase() };
    }
    return { type: 'name', value: raw };
  }

  addBtn.addEventListener('click', async () => {
    const parsed = parseWithType();
    if (!parsed) return;
    const { list } = await ycbAddEntry(parsed);
    addInput.value = '';
    render(list);
  });

  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  exportBtn.addEventListener('click', async () => {
    const { list } = await ycbGetState();
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-channel-blocklist.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Not a list');

      const { list: current } = await ycbGetState();
      const seen = new Set(current.map(ycbEntryKey));
      const merged = current.slice();

      for (const item of parsed) {
        if (!item || !item.type || !item.value) continue;
        const key = ycbEntryKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          type: item.type,
          value: item.value,
          label: item.label || item.value,
          addedAt: item.addedAt || Date.now()
        });
      }

      await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: merged });
      render(merged);
    } catch (e) {
      alert('Could not import that file. Expecting a JSON array exported from this extension.');
    } finally {
      importInput.value = '';
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Remove every blocked channel? This cannot be undone.')) return;
    await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: [] });
    render([]);
  });

  loadAll();
})();
