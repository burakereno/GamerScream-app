#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT_DIR/.github/release-contract.env"

# shellcheck disable=SC1090
source "$CONTRACT"

VERSION="${1:?Usage: create-update-manifest.sh VERSION DMG_PATH [OUTPUT_PATH]}"
DMG_PATH="${2:?Usage: create-update-manifest.sh VERSION DMG_PATH [OUTPUT_PATH]}"
OUTPUT_PATH="${3:-$(dirname "$DMG_PATH")/$MANIFEST_ASSET_NAME}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semantic version: $VERSION" >&2
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "DMG not found: $DMG_PATH" >&2
  exit 1
fi

if [[ "$(basename "$DMG_PATH")" != "$DMG_ASSET_NAME" ]]; then
  echo "DMG asset must be named $DMG_ASSET_NAME" >&2
  exit 1
fi

SHA256="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"
if [[ ! "$SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Could not calculate a valid SHA-256 digest." >&2
  exit 1
fi

TMP_PATH="$OUTPUT_PATH.tmp.$$"
cleanup() {
  rm -f "$TMP_PATH"
}
trap cleanup EXIT

printf '{\n  "version": "%s",\n  "asset": "%s",\n  "sha256": "%s",\n  "bundleIdentifier": "%s",\n  "teamIdentifier": "%s"\n}\n' \
  "$VERSION" \
  "$DMG_ASSET_NAME" \
  "$SHA256" \
  "$BUNDLE_IDENTIFIER" \
  "$TEAM_IDENTIFIER" > "$TMP_PATH"

mv "$TMP_PATH" "$OUTPUT_PATH"
trap - EXIT
echo "Created manifest: $OUTPUT_PATH"
