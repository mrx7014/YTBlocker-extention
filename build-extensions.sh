#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$ROOT_DIR/manifest.json")"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

for manifest in "$ROOT_DIR/platforms/web/manifest.json" "$ROOT_DIR/platforms/android/manifest.json"; do
  manifest_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$manifest")"
  if [[ "$manifest_version" != "$VERSION" ]]; then
    echo "Version mismatch: $manifest has $manifest_version; root manifest has $VERSION" >&2
    exit 1
  fi
done

COMMON_FILES=(
  background.js
  common.js
  content.css
  content.js
  options.css
  options.html
  options.js
  popup.css
  popup.html
  popup.js
  README.md
  README_AR.md
  CHANGELOG.md
  CHANGELOG_AR.md
  LICENSE
)

copy_extension_files() {
  local destination="$1"
  mkdir -p "$destination/icons"
  for file in "${COMMON_FILES[@]}"; do
    cp "$ROOT_DIR/$file" "$destination/$file"
  done
  cp "$ROOT_DIR/icons/"*.png "$destination/icons/"
}

build_web() {
  local package_dir="$BUILD_DIR/web"
  copy_extension_files "$package_dir"
  cp "$ROOT_DIR/platforms/web/manifest.json" "$package_dir/manifest.json"
  (cd "$package_dir" && zip -q -r "$DIST_DIR/youtube-channel-blocker-desktop-v${VERSION}.zip" .)
  cp "$DIST_DIR/youtube-channel-blocker-desktop-v${VERSION}.zip" "$DIST_DIR/youtube-channel-blocker.zip"
}

build_android() {
  local package_dir="$BUILD_DIR/android"
  copy_extension_files "$package_dir"
  cp "$ROOT_DIR/platforms/android/manifest.json" "$package_dir/manifest.json"
  tail -n +2 "$ROOT_DIR/background.js" > "$package_dir/background.js"
  (cd "$package_dir" && zip -q -r "$DIST_DIR/youtube-channel-blocker-android-v${VERSION}.zip" .)
}

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/youtube-channel-blocker-desktop-v${VERSION}.zip" \
      "$DIST_DIR/youtube-channel-blocker-android-v${VERSION}.zip"

python3 -m json.tool "$ROOT_DIR/manifest.json" >/dev/null
python3 -m json.tool "$ROOT_DIR/platforms/web/manifest.json" >/dev/null
python3 -m json.tool "$ROOT_DIR/platforms/android/manifest.json" >/dev/null
for file in "$ROOT_DIR"/*.js; do node --check "$file"; done

build_web
build_android

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'version=%s\n' "$VERSION" >> "$GITHUB_OUTPUT"
fi

echo "Built version $VERSION:"
ls -lh "$DIST_DIR/youtube-channel-blocker-desktop-v${VERSION}.zip" \
       "$DIST_DIR/youtube-channel-blocker-android-v${VERSION}.zip" \
       "$DIST_DIR/youtube-channel-blocker.zip"
