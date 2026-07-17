#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT_DIR/.github/release-contract.env"
WORKFLOW="$ROOT_DIR/.github/workflows/release.yml"
BUILDER="$ROOT_DIR/apps/desktop/electron-builder.yml"
ENTITLEMENTS="$ROOT_DIR/apps/desktop/build/entitlements.mac.plist"
UPDATE_CONFIG="$ROOT_DIR/apps/desktop/build/app-update.yml"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-app.sh"
DMG_SCRIPT="$ROOT_DIR/scripts/create-dmg.sh"
MANIFEST_SCRIPT="$ROOT_DIR/scripts/create-update-manifest.sh"
MAC_RELEASE_SCRIPT="$ROOT_DIR/scripts/build-macos-release.sh"
WINDOWS_RELEASE_SCRIPT="$ROOT_DIR/scripts/build-windows-release.ps1"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing file: ${1#$ROOT_DIR/}"
}

require_executable() {
  [[ -x "$1" ]] || fail "not executable: ${1#$ROOT_DIR/}"
}

require_line() {
  local file="$1"
  local line="$2"
  grep -Fxq -- "$line" "$file" || fail "${file#$ROOT_DIR/} is missing: $line"
}

require_text() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "$file" || fail "${file#$ROOT_DIR/} is missing required text: $text"
}

reject_text() {
  local file="$1"
  local text="$2"
  if grep -Fq -- "$text" "$file"; then
    fail "${file#$ROOT_DIR/} contains forbidden text: $text"
  fi
}

for file in "$CONTRACT" "$WORKFLOW" "$BUILDER" "$ENTITLEMENTS" "$UPDATE_CONFIG" "$BUILD_SCRIPT" "$DMG_SCRIPT" "$MANIFEST_SCRIPT" "$MAC_RELEASE_SCRIPT" "$WINDOWS_RELEASE_SCRIPT"; do
  require_file "$file"
done

for script in "$BUILD_SCRIPT" "$DMG_SCRIPT" "$MANIFEST_SCRIPT" "$MAC_RELEASE_SCRIPT"; do
  require_executable "$script"
done

require_line "$CONTRACT" "GITHUB_OWNER=burakereno"
require_line "$CONTRACT" "GITHUB_REPO=GamerScream-app"
require_line "$CONTRACT" "APP_NAME=GamerScream"
require_line "$CONTRACT" "APP_BUNDLE_NAME=GamerScream.app"
require_line "$CONTRACT" "EXECUTABLE_NAME=GamerScream"
require_line "$CONTRACT" "BUNDLE_IDENTIFIER=com.gamerscream.app"
require_line "$CONTRACT" "TEAM_IDENTIFIER=66K3EFBVB6"
require_line "$CONTRACT" "DMG_ASSET_NAME=GamerScream.dmg"
require_line "$CONTRACT" "MANIFEST_ASSET_NAME=GamerScream.dmg.update.json"
require_line "$CONTRACT" "PUBLIC_SERVER_URL=https://gamerscream.duckdns.org"
require_line "$CONTRACT" "WINDOWS_SIGNING=unsigned"
require_text "$BUILD_SCRIPT" 'export VITE_SERVER_URL="$PUBLIC_SERVER_URL"'
require_text "$BUILD_SCRIPT" 'CODESIGN_IDENTITY#Developer ID Application: '

for secret in \
  MACOS_CERTIFICATE_P12_BASE64 \
  MACOS_CERTIFICATE_PASSWORD \
  KEYCHAIN_PASSWORD \
  APPLE_ID \
  APPLE_TEAM_ID \
  APPLE_APP_SPECIFIC_PASSWORD; do
  require_text "$WORKFLOW" "$secret"
done

reject_text "$WORKFLOW" "WINDOWS_CERTIFICATE_P12_BASE64"
reject_text "$WORKFLOW" "WINDOWS_CERTIFICATE_PASSWORD"
reject_text "$WORKFLOW" "WINDOWS_PUBLISHER_NAME"

require_text "$WORKFLOW" "build-macos-release.sh"
require_text "$WORKFLOW" "build-windows-release.ps1"
require_text "$WORKFLOW" "VERSION_BUMP"
require_text "$WORKFLOW" "type: choice"
require_text "$MAC_RELEASE_SCRIPT" "Developer ID Application: Burak ERENOĞLU (66K3EFBVB6)"
require_text "$MAC_RELEASE_SCRIPT" "codesign --verify --deep --strict"
require_text "$MAC_RELEASE_SCRIPT" "TeamIdentifier"
require_text "$MAC_RELEASE_SCRIPT" "flags=.*runtime"
require_text "$MAC_RELEASE_SCRIPT" "Signed app is missing the required audio-input entitlement"
require_text "$MAC_RELEASE_SCRIPT" "com.apple.security.cs.disable-library-validation"
require_text "$MAC_RELEASE_SCRIPT" "com.apple.security.get-task-allow"
require_text "$MAC_RELEASE_SCRIPT" "notarytool submit"
require_text "$MAC_RELEASE_SCRIPT" "stapler staple"
require_text "$MAC_RELEASE_SCRIPT" "stapler validate"
require_text "$MAC_RELEASE_SCRIPT" "spctl --assess --type execute"
require_text "$MAC_RELEASE_SCRIPT" "spctl --assess --type open"
require_text "$MAC_RELEASE_SCRIPT" "create-dmg.sh"
require_text "$MAC_RELEASE_SCRIPT" "create-update-manifest.sh"
require_text "$MAC_RELEASE_SCRIPT" "latest-mac.yml"
require_text "$WORKFLOW" "latest.yml"
require_text "$WORKFLOW" "GamerScream-Setup.exe"
require_text "$WORKFLOW" "validateFeed('latest-mac.yml', 'GamerScream.zip')"
require_text "$WORKFLOW" "validateFeed('latest.yml', 'GamerScream-Setup.exe')"
require_text "$WORKFLOW" "crypto.createHash('sha512')"
require_text "$WORKFLOW" "Build Windows (unsigned)"
require_text "$WINDOWS_RELEASE_SCRIPT" '$Contract["WINDOWS_SIGNING"] -cne "unsigned"'
require_text "$WINDOWS_RELEASE_SCRIPT" 'CSC_IDENTITY_AUTO_DISCOVERY = "false"'
require_text "$WINDOWS_RELEASE_SCRIPT" "Get-AuthenticodeSignature"
require_text "$WINDOWS_RELEASE_SCRIPT" "SignatureStatus]::NotSigned"
reject_text "$WINDOWS_RELEASE_SCRIPT" "TimeStamperCertificate"
reject_text "$WINDOWS_RELEASE_SCRIPT" "WINDOWS_CERTIFICATE_PASSWORD"
require_text "$WORKFLOW" "windows-2025"
require_text "$WORKFLOW" "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
require_text "$WORKFLOW" "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"
require_text "$WORKFLOW" "gh release create"
require_text "$WORKFLOW" "--draft"
require_text "$WORKFLOW" "git push origin"
reject_text "$WORKFLOW" "--publish always"
reject_text "$WORKFLOW" "xattr -cr"

require_text "$BUILDER" "hardenedRuntime: true"
require_text "$BUILDER" "files:"
require_text "$BUILDER" "  - out/**/*"
require_text "$BUILDER" "  - package.json"
require_text "$BUILDER" "entitlements: build/entitlements.mac.plist"
require_text "$BUILDER" "verifyUpdateCodeSignature: false"
reject_text "$BUILDER" "publisherName:"
require_text "$BUILDER" "build/app-update.yml"
reject_text "$BUILDER" "- dmg"
require_text "$ENTITLEMENTS" "com.apple.security.device.audio-input"
reject_text "$ENTITLEMENTS" "com.apple.security.cs.disable-library-validation"
require_line "$UPDATE_CONFIG" "provider: github"
require_line "$UPDATE_CONFIG" "owner: burakereno"
require_line "$UPDATE_CONFIG" "repo: GamerScream-app"
require_text "$BUILD_SCRIPT" "Bundled updater configuration is missing"
require_text "$WINDOWS_RELEASE_SCRIPT" "Bundled updater configuration mismatch"

require_text "$DMG_SCRIPT" 'WINDOW_WIDTH="${WINDOW_WIDTH:-760}"'
require_text "$DMG_SCRIPT" 'WINDOW_HEIGHT="${WINDOW_HEIGHT:-610}"'
require_text "$DMG_SCRIPT" "ln -s /Applications"
require_text "$DMG_SCRIPT" "background.png"
require_text "$DMG_SCRIPT" "GamerScream"
require_text "$DMG_SCRIPT" 'hint.draw(in: NSRect(x: 0, y: 150, width: width'
require_text "$DMG_SCRIPT" 'in: NSRect(x: 0, y: 128, width: width'
reject_text "$DMG_SCRIPT" "waveformHeights"
reject_text "$DMG_SCRIPT" "let check = NSBezierPath()"
reject_text "$DMG_SCRIPT" "NSRect(x: 190, y: 126, width: 380, height: 58)"

require_text "$MANIFEST_SCRIPT" '"sha256"'
require_text "$MANIFEST_SCRIPT" '"bundleIdentifier"'
require_text "$MANIFEST_SCRIPT" '"teamIdentifier"'

if [[ -f "$ROOT_DIR/.github/workflows/build.yml" ]]; then
  reject_text "$ROOT_DIR/.github/workflows/build.yml" "--publish always"
  reject_text "$ROOT_DIR/.github/workflows/build.yml" "push:"
fi

echo "Release contract checks passed."
