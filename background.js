importScripts('common.js');

const MENU_LINK_ID = 'ycb-block-link';
const MENU_PAGE_ID = 'ycb-block-page';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_LINK_ID,
    title: 'Block this YouTube channel',
    contexts: ['link'],
    targetUrlPatterns: ['*://*.youtube.com/@*', '*://*.youtube.com/channel/*']
  });
  chrome.contextMenus.create({
    id: MENU_PAGE_ID,
    title: 'Block this YouTube channel',
    contexts: ['page'],
    documentUrlPatterns: ['*://*.youtube.com/@*', '*://*.youtube.com/channel/*']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  if (!url) return;
  const entry = ycbParseChannelFromUrl(url);
  if (!entry || !tab || !tab.id) return;

  // Ask the content script on that tab to show the Yes/No confirmation and,
  // once the person decides, its own follow-up message — no OS notification.
  chrome.tabs.sendMessage(tab.id, { type: 'ycb-confirm-block', entry }).catch(() => {});
});
