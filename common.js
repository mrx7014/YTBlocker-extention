/*
 * Shared helpers for YouTube Channel Blocker.
 * Loaded as a plain script (not a module) so it works in the service worker
 * (via importScripts) and in content/popup/options scripts (via <script>).
 */

const YCB_STORAGE_KEY = 'blockedChannels';
const YCB_ENABLED_KEY = 'enabled';
const YCB_ALLOWED_KEY = 'allowedChannels';
const YCB_MODE_KEY = 'filterMode';
const YCB_STATS_KEY = 'filteredCount';
const YCB_KEYWORDS_KEY = 'titleKeywords';

const YCB_ID_PATTERN = /UC[A-Za-z0-9_-]{22}/;
const YCB_HANDLE_PATTERN = /@[A-Za-z0-9._-]{3,30}/;

/**
 * Turns whatever a person pastes (a full URL, a bare handle, an @handle,
 * a raw channel ID, or just a channel's display name) into a stored entry.
 * Mirrors the id/handle detection used by the reference Morphe patch, with
 * a "name" fallback so people without a link on hand can still block by name.
 */
function ycbNormalizeInput(raw) {
  const value = (raw || '').trim();
  if (!value) return null;

  const idMatch = value.match(YCB_ID_PATTERN);
  if (idMatch) return { type: 'id', value: idMatch[0] };

  const handleMatch = value.match(YCB_HANDLE_PATTERN);
  if (handleMatch) return { type: 'handle', value: handleMatch[0].toLowerCase() };

  // Bare handle typed without the @.
  if (/^[A-Za-z0-9._-]{3,30}$/.test(value) && !value.includes(' ')) {
    return { type: 'handle', value: '@' + value.toLowerCase() };
  }

  // Anything else is treated as a channel display name (substring match).
  return { type: 'name', value };
}

function ycbEntryKey(entry) {
  return entry.type + ':' + entry.value.toLowerCase();
}

function ycbMatchTitleKeyword(title, rules) {
  if (!title || !Array.isArray(rules)) return null;
  const text = String(title).toLowerCase();
  for (const rule of rules) {
    const keyword = String(rule && rule.value || '').trim();
    if (!keyword) continue;
    if (rule.match === 'whole') {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + escaped + '($|[^\\p{L}\\p{N}_])', 'iu');
      if (pattern.test(String(title))) return rule;
    } else if (text.includes(keyword.toLowerCase())) {
      return rule;
    }
  }
  return null;
}

function ycbParseChannelFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (!/youtube\.com$/.test(u.hostname.replace(/^www\.|^m\./, '')) &&
        !u.hostname.endsWith('youtube.com')) {
      return null;
    }
    const idMatch = u.pathname.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
    if (idMatch) return { type: 'id', value: idMatch[1] };
    const handleMatch = u.pathname.match(/^\/(@[A-Za-z0-9._-]{3,30})/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1].toLowerCase() };
    return null;
  } catch (e) {
    return null;
  }
}

async function ycbGetState() {
  const res = await chrome.storage.sync.get([
    YCB_STORAGE_KEY, YCB_ENABLED_KEY, YCB_ALLOWED_KEY, YCB_MODE_KEY, YCB_KEYWORDS_KEY
  ]);
  const storedList = Array.isArray(res[YCB_STORAGE_KEY]) ? res[YCB_STORAGE_KEY] : [];
  const now = Date.now();
  const list = storedList.filter((entry) => !entry.expiresAt || Number(entry.expiresAt) > now);
  if (list.length !== storedList.length) {
    await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: list });
  }
  return {
    list,
    allowed: Array.isArray(res[YCB_ALLOWED_KEY]) ? res[YCB_ALLOWED_KEY] : [],
    keywords: Array.isArray(res[YCB_KEYWORDS_KEY]) ? res[YCB_KEYWORDS_KEY] : [],
    enabled: res[YCB_ENABLED_KEY] !== false,
    mode: res[YCB_MODE_KEY] === 'placeholder' ? 'placeholder' : 'hide'
  };
}

async function ycbAddEntry(entry, label, metadata, storageKey) {
  const keyName = storageKey || YCB_STORAGE_KEY;
  const res = await chrome.storage.sync.get(keyName);
  const list = Array.isArray(res[keyName]) ? res[keyName] : [];
  const key = ycbEntryKey(entry);
  if (list.some((e) => ycbEntryKey(e) === key)) return { added: false, list };
  const full = {
    ...entry,
    ...(metadata || {}),
    label: label || entry.value,
    addedAt: Date.now()
  };
  const updated = [...list, full];
  await chrome.storage.sync.set({ [keyName]: updated });
  return { added: true, list: updated };
}

async function ycbRemoveEntry(entry, storageKey) {
  const keyName = storageKey || YCB_STORAGE_KEY;
  const res = await chrome.storage.sync.get(keyName);
  const list = Array.isArray(res[keyName]) ? res[keyName] : [];
  const key = ycbEntryKey(entry);
  const updated = list.filter((e) => ycbEntryKey(e) !== key);
  await chrome.storage.sync.set({ [keyName]: updated });
  return updated;
}

if (typeof module !== 'undefined') {
  module.exports = { ycbNormalizeInput, ycbEntryKey, ycbParseChannelFromUrl, ycbMatchTitleKeyword };
}
