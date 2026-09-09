#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

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
  cp "$ROOT_DIR/background.js" "$package_dir/background.js"
  (cd "$package_dir" && zip -q -r "$DIST_DIR/youtube-channel-blocker-web-v1.0.0.zip" .)
}

build_android() {
  local package_dir="$BUILD_DIR/android"
  copy_extension_files "$package_dir"
  cp "$ROOT_DIR/platforms/android/manifest.json" "$package_dir/manifest.json"
  tail -n +2 "$ROOT_DIR/background.js" > "$package_dir/background.js"
  (cd "$package_dir" && zip -q -r "$DIST_DIR/youtube-channel-blocker-android-v1.0.0.zip" .)
}

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/youtube-channel-blocker-web-v1.0.0.zip" \
      "$DIST_DIR/youtube-channel-blocker-android-v1.0.0.zip"

python3 -m json.tool "$ROOT_DIR/platforms/web/manifest.json" >/dev/null
python3 -m json.tool "$ROOT_DIR/platforms/android/manifest.json" >/dev/null
for file in "$ROOT_DIR"/*.js; do node --check "$file"; done

build_web
build_android

echo "Built:"
ls -lh "$DIST_DIR/youtube-channel-blocker-web-v1.0.0.zip" \
       "$DIST_DIR/youtube-channel-blocker-android-v1.0.0.zip"
