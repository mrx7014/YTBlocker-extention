# Changelog

All notable changes to YouTube Channel Blocker are documented here. Versions 1.2.0–1.5.0 were developed after 1.1.0; 2.0.0 consolidates those changes as the next major release.

## [2.0.0] — 2026-10-11

### Added
- Title-keyword filtering with case-insensitive phrase/substring and whole-word matching. Matching cards are filtered individually; a matching watch page can be viewed anyway.
- Temporary channel blocks (1 hour, 24 hours, or 7 days), plus permanent blocks.
- Allowlist exceptions; an exact allowed ID, handle, or name takes precedence over a block rule.
- Categories and notes for blocked channels.
- Bulk selection, export, and removal of blocked channels.
- JSON and CSV import/export, including metadata and safe CSV quoting.
- Undo for recent block/unblock actions.
- Hide-or-placeholder behavior for blocked cards.
- Live search, sorting, responsive settings controls, synchronized list updates, and clearer import feedback.
- A local approximate filtered-item counter with a reset control.
- Separate desktop and Android Firefox build packages, with automated validation and versioned CI artifacts.

### Improved
- Blocked channel pages (including Videos, Shorts, Live, and Community) show a clear notice and unblock action.
- Filtering covers channel-linked video/post cards, feeds, search, playlists, Shorts surfaces, comments, and watch pages where a channel identity can be detected.
- Blocked watch pages are paused and muted even when YouTube replaces the player; the previous audio state is restored when unblocked.
- Popup and context-menu workflows support faster blocking; channel entries can be added by ID, @handle, URL, or display name.
- Name-match warnings recommend precise IDs or handles.
- Browser package and release artifact versioning are aligned at 2.0.0.

### Compatibility and privacy
- The desktop package targets Manifest V3 Chromium browsers. The Android package targets Firefox for Android (minimum version 142).
- The extension filters locally on YouTube and does not send the blocklist to a third-party server.

## [1.5.0]
- Added case-insensitive video-title keyword filtering with phrase/substring or whole-word matching.
- Added keyword-rule management to settings; a matching watch page can be viewed anyway.

## [1.4.0]
- Added temporary blocks, allowlist exceptions, bulk selection/removal, categories, notes, and hide-or-placeholder controls.
- Added undo for recent actions, approximate filtered-item statistics, and warnings for approximate name matching.

## [1.3.0]
- Added JSON and CSV blocklist import and export, with CSV escaping for special characters.

## [1.2.0]
- Improved settings with live search, sorting, responsive controls, safer imports, and synchronized updates across open windows/devices.

## [1.1.1]
- Stopped and muted blocked-channel watch-page videos reliably, including after YouTube replaces the player; restored the prior audio state when unblocked.

## [1.1.0]
- Added blocking for channel profile pages and supported related video/post cards, including detectable collaboration cards.
