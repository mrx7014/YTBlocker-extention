# YouTube Channel Blocker

A lightweight browser extension for hiding videos, comments, search results, channel cards, playlists, and other YouTube content from channels you choose to block.

The extension uses Manifest V3 and stores the blocklist with `chrome.storage.sync`, allowing it to follow the signed-in browser profile across supported Chromium browsers.

## Features

- Block channels by channel ID, `@handle`, or display name.
- Hide blocked content from feeds, search results, watch pages, channel pages, playlists, Shorts-related cards, and comments.
- Replace a blocked channel's watch-page player with a clear notice and an **Unblock and watch** action.
- Block channels through the toolbar popup, a right-click context menu, or a hover action on supported cards.
- Add a channel link, handle, ID, or name manually.
- Manage, remove, import, and export blocked channels from the options page.
- Enable or disable filtering globally without deleting the blocklist.
- Use the same source package in Chrome, Microsoft Edge, Brave, and other Chromium-based browsers that support Manifest V3.

## Installation for development

1. Clone or download this repository.
2. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository root, which is the directory containing `manifest.json`.
6. Open YouTube and use the extension from the browser toolbar.

After changing source files, return to the extensions page and select **Reload** for the extension.

Firefox supports temporary loading through `about:debugging` and **Load Temporary Add-on**. A permanent Firefox installation requires the extension to be signed through Mozilla Add-ons.

## Usage

### Block a channel from YouTube

Right-click a channel link and select **Block this YouTube channel**. The extension displays a confirmation prompt before saving the channel.

You can also hover over a supported video or channel card and select the block button, or open the extension popup and select **Block** for the channel detected on the current YouTube page.

### Add a channel manually

The popup and options page accept any of the following inputs:

| Input | Example | Matching behavior |
| --- | --- | --- |
| Channel ID | `UCxxxxxxxxxxxxxxxxxxxxxx` | Exact channel ID match |
| Handle | `@example` | Exact handle match |
| Channel URL | `https://www.youtube.com/@example` | Extracts the channel handle or ID |
| Display name | `Example Channel` | Case-insensitive substring match |

Name-based matching is intentionally flexible. It can match more than one similarly named channel, so channel IDs and handles are recommended when exact matching matters.

## Project structure

| File or directory | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 metadata, permissions, scripts, icons, and browser entry points |
| `background.js` | Service worker for context-menu actions |
| `common.js` | Shared normalization and synchronized-storage helpers |
| `content.js` | YouTube DOM scanning, filtering, overlays, and block controls |
| `content.css` | Styles for injected buttons, dialogs, and blocked-player notices |
| `popup.html`, `popup.js`, `popup.css` | Toolbar popup interface |
| `options.html`, `options.js`, `options.css` | Full blocklist manager and import/export interface |
| `icons/` | Browser action icons |
| `.github/workflows/build-extension.yml` | Automated validation and ZIP packaging workflow |

## Build locally

The extension does not require dependency installation or a bundler. Its source files can be loaded directly by a browser.

To validate the source and produce a distributable ZIP on Linux or macOS, run:

```bash
python3 -m json.tool manifest.json >/dev/null
for file in *.js; do node --check "$file"; done
mkdir -p dist
zip -r -FS dist/youtube-channel-blocker.zip \
  manifest.json background.js common.js content.js content.css \
  popup.html popup.js popup.css \
  options.html options.js options.css icons README.md LICENSE
```

The resulting archive can be uploaded to a release or shared as an unpacked-extension source package. For browser development, load the repository directory itself rather than the ZIP file.

## Automated builds

Every push to `main` and every pull request runs the GitHub Actions workflow. The workflow validates `manifest.json`, checks JavaScript syntax with Node.js, verifies the required files, and uploads `youtube-channel-blocker.zip` as a build artifact.

To download a build, open the completed workflow run on GitHub and download the artifact from the **Artifacts** section.

## Privacy and permissions

The extension does not send the blocklist to a third-party server. It uses the browser's synchronized extension storage so the list can be available to the same browser profile on supported devices.

| Permission | Purpose |
| --- | --- |
| `storage` | Save the blocklist and enabled/disabled state |
| `contextMenus` | Add the channel-blocking right-click actions |
| `activeTab` | Inspect the active YouTube tab from the popup |
| `scripting` | Detect the current channel in the active tab |
| YouTube host access | Scan and filter YouTube pages |

The extension only operates on YouTube pages covered by its manifest matches and host permissions.

## Known limitations

YouTube changes its page structure regularly. If a particular card type stops being filtered, the relevant selector in `content.js` may need to be updated.

Name matching is based on visible text and is less precise than matching a channel ID or handle. The extension is designed for client-side filtering and does not prevent a blocked channel from appearing in every possible YouTube surface or in content outside YouTube.

## Contributing

Bug reports and improvements are welcome. When reporting a filtering issue, include the YouTube page type, the browser and version, and the relevant channel URL if possible. Do not include private account information or authentication details.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for the complete license text.
