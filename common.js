/*
 * Shared helpers for YouTube Channel Blocker.
 * Loaded as a plain script (not a module) so it works in the service worker
 * (via importScripts) and in content/popup/options scripts (via <script>).
 */

const YCB_STORAGE_KEY = 'blockedChannels';
const YCB_ENABLED_KEY = 'enabled';

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
  const res = await chrome.storage.sync.get([YCB_STORAGE_KEY, YCB_ENABLED_KEY]);
  return {
    list: Array.isArray(res[YCB_STORAGE_KEY]) ? res[YCB_STORAGE_KEY] : [],
    enabled: res[YCB_ENABLED_KEY] !== false
  };
}

async function ycbAddEntry(entry, label) {
  const { list } = await ycbGetState();
  const key = ycbEntryKey(entry);
  if (list.some((e) => ycbEntryKey(e) === key)) return { added: false, list };
  const full = { ...entry, label: label || entry.value, addedAt: Date.now() };
  const updated = [...list, full];
  await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: updated });
  return { added: true, list: updated };
}

async function ycbRemoveEntry(entry) {
  const { list } = await ycbGetState();
  const key = ycbEntryKey(entry);
  const updated = list.filter((e) => ycbEntryKey(e) !== key);
  await chrome.storage.sync.set({ [YCB_STORAGE_KEY]: updated });
  return updated;
}

if (typeof module !== 'undefined') {
  module.exports = { ycbNormalizeInput, ycbEntryKey, ycbParseChannelFromUrl };
}
