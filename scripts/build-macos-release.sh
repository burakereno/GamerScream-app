#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/.github/release-contract.env"

APP_VERSION="${APP_VERSION:?APP_VERSION is required}"
APP_BUILD_NUMBER="${APP_BUILD_NUMBER:?APP_BUILD_NUMBER is required}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-$ROOT_DIR/.release-assets/macos}"
DEVELOPER_IDENTITY="${DEVELOPER_IDENTITY:-Developer ID Application: Burak ERENOĞLU (66K3EFBVB6)}"
ENTITLEMENTS_PATH="$ROOT_DIR/apps/desktop/build/entitlements.mac.plist"

for name in \
  MACOS_CERTIFICATE_P12_BASE64 \
  MACOS_CERTIFICATE_PASSWORD \
  KEYCHAIN_PASSWORD \
  APPLE_ID \
  APPLE_TEAM_ID \
  APPLE_APP_SPECIFIC_PASSWORD; do
  [[ -n "${!name:-}" ]] || { echo "Missing required secret: $name" >&2; exit 1; }
done

[[ "$APPLE_TEAM_ID" == "$TEAM_IDENTIFIER" ]] || {
  echo "APPLE_TEAM_ID does not match the release contract." >&2
  exit 1
}

WORK_DIR="$(mktemp -d)"
KEYCHAIN_PATH="$WORK_DIR/release-signing.keychain-db"
CERTIFICATE_PATH="$WORK_DIR/developer-id-application.p12"

cleanup() {
  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

printf '%s' "$MACOS_CERTIFICATE_P12_BASE64" | base64 --decode > "$CERTIFICATE_PATH"
chmod 600 "$CERTIFICATE_PATH"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERTIFICATE_PATH" \
  -k "$KEYCHAIN_PATH" \
  -P "$MACOS_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH"

IDENTITIES="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH")"
IDENTITY_COUNT="$(printf '%s\n' "$IDENTITIES" | grep -Ec '^ *[0-9]+\)')"
[[ "$IDENTITY_COUNT" == "1" ]] || {
  echo "Expected exactly one code-signing identity in the release keychain." >&2
  exit 1
}
printf '%s\n' "$IDENTITIES" | grep -Fq "$DEVELOPER_IDENTITY" || {
  echo "Expected Developer ID Application identity is missing." >&2
  exit 1
}

export CSC_KEYCHAIN="$KEYCHAIN_PATH"
export CODESIGN_IDENTITY="$DEVELOPER_IDENTITY"
APP_VERSION="$APP_VERSION" \
APP_BUILD_NUMBER="$APP_BUILD_NUMBER" \
CODESIGN_IDENTITY="$CODESIGN_IDENTITY" \
  "$ROOT_DIR/scripts/build-app.sh"

APP_PATH="$ROOT_DIR/.build/$APP_BUNDLE_NAME"
codesign --force \
  --sign "$DEVELOPER_IDENTITY" \
  --keychain "$KEYCHAIN_PATH" \
  --timestamp \
  --options runtime \
  --entitlements "$ENTITLEMENTS_PATH" \
  "$APP_PATH"
SIGNING_INFO="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
codesign --verify --deep --strict --verbose=4 "$APP_PATH"
printf '%s\n' "$SIGNING_INFO" | grep -Fq "Authority=$DEVELOPER_IDENTITY"
printf '%s\n' "$SIGNING_INFO" | grep -Fq "TeamIdentifier=$TEAM_IDENTIFIER"
printf '%s\n' "$SIGNING_INFO" | grep -Eq 'flags=.*runtime'
SIGNED_ENTITLEMENTS="$WORK_DIR/signed-entitlements.plist"
codesign -d --xml --entitlements - "$APP_PATH" > "$SIGNED_ENTITLEMENTS" 2>/dev/null
[[ "$(plutil -extract com.apple.security.device.audio-input raw -o - "$SIGNED_ENTITLEMENTS")" == "true" ]] || {
  echo "Signed app is missing the required audio-input entitlement." >&2
  exit 1
}
for forbidden in com.apple.security.cs.disable-library-validation com.apple.security.get-task-allow; do
  if plutil -extract "$forbidden" raw -o - "$SIGNED_ENTITLEMENTS" >/dev/null 2>&1; then
    echo "Signed app contains forbidden entitlement: $forbidden" >&2
    exit 1
  fi
done
codesign -dr - "$APP_PATH"

NOTARY_ARCHIVE="$WORK_DIR/$APP_NAME-notary.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$NOTARY_ARCHIVE"
xcrun notarytool submit "$NOTARY_ARCHIVE" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"
codesign --verify --deep --strict --verbose=4 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR"
ZIP_PATH="$ARTIFACTS_DIR/$APP_NAME.zip"
FEED_PATH="$ARTIFACTS_DIR/latest-mac.yml"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"
ZIP_SHA512="$(openssl dgst -sha512 -binary "$ZIP_PATH" | openssl base64 -A)"
ZIP_SIZE="$(stat -f '%z' "$ZIP_PATH")"
RELEASE_DATE="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
printf "version: %s\nfiles:\n  - url: %s.zip\n    sha512: %s\n    size: %s\npath: %s.zip\nsha512: %s\nreleaseDate: '%s'\n" \
  "$APP_VERSION" "$APP_NAME" "$ZIP_SHA512" "$ZIP_SIZE" "$APP_NAME" "$ZIP_SHA512" "$RELEASE_DATE" > "$FEED_PATH"

DMG_PATH="$ARTIFACTS_DIR/$DMG_ASSET_NAME"
MANIFEST_PATH="$ARTIFACTS_DIR/$MANIFEST_ASSET_NAME"
"$ROOT_DIR/scripts/create-dmg.sh" "$APP_PATH" "$DMG_PATH"
codesign --force --sign "$CODESIGN_IDENTITY" --timestamp "$DMG_PATH"
codesign --verify --strict --verbose=4 "$DMG_PATH"
DMG_INFO="$(codesign -dv --verbose=4 "$DMG_PATH" 2>&1)"
printf '%s\n' "$DMG_INFO" | grep -Fq "Authority=$DEVELOPER_IDENTITY"
printf '%s\n' "$DMG_INFO" | grep -Fq "TeamIdentifier=$TEAM_IDENTIFIER"
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
codesign --verify --strict --verbose=4 "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
"$ROOT_DIR/scripts/create-update-manifest.sh" "$APP_VERSION" "$DMG_PATH" "$MANIFEST_PATH"

for asset in "$DMG_ASSET_NAME" "$MANIFEST_ASSET_NAME" "$APP_NAME.zip" latest-mac.yml; do
  [[ -s "$ARTIFACTS_DIR/$asset" ]] || { echo "Missing macOS release asset: $asset" >&2; exit 1; }
done

echo "Verified macOS release assets: $ARTIFACTS_DIR"
