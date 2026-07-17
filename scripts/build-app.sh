#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT_DIR/.github/release-contract.env"

if [[ ! -f "$CONTRACT" ]]; then
  echo "Release contract not found: $CONTRACT" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONTRACT"

APP_VERSION="${APP_VERSION:?Set APP_VERSION to a semantic version such as 2.7.3}"
APP_BUILD_NUMBER="${APP_BUILD_NUMBER:?Set APP_BUILD_NUMBER to a positive integer}"
: "${BUNDLE_IDENTIFIER:?BUNDLE_IDENTIFIER is required in the release contract}"
CODESIGN_IDENTITY="${CODESIGN_IDENTITY:-}"
ALLOW_UNSIGNED="${ALLOW_UNSIGNED:-0}"
BUILD_ROOT="$ROOT_DIR/.build"
PACKAGER_OUTPUT="$BUILD_ROOT/electron"
APP_PATH="$BUILD_ROOT/$APP_BUNDLE_NAME"

if [[ ! "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "APP_VERSION must be a valid three-part semantic version: $APP_VERSION" >&2
  exit 1
fi

if [[ ! "$APP_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "APP_BUILD_NUMBER must be a positive integer: $APP_BUILD_NUMBER" >&2
  exit 1
fi

if [[ "$ALLOW_UNSIGNED" != "1" && -z "$CODESIGN_IDENTITY" ]]; then
  echo "CODESIGN_IDENTITY is required unless ALLOW_UNSIGNED=1 is set for a local preview." >&2
  exit 1
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$PACKAGER_OUTPUT"

if [[ ! "$PUBLIC_SERVER_URL" =~ ^https:// ]]; then
  echo "PUBLIC_SERVER_URL must use HTTPS for release builds." >&2
  exit 1
fi
export VITE_SERVER_URL="$PUBLIC_SERVER_URL"

pnpm --dir "$ROOT_DIR" --filter desktop exec electron-vite build

BUILDER_ARGS=(
  --mac dir
  --universal
  --publish never
  "-c.directories.output=$PACKAGER_OUTPUT"
  "-c.extraMetadata.version=$APP_VERSION"
  "-c.buildVersion=$APP_BUILD_NUMBER"
  "-c.appId=$BUNDLE_IDENTIFIER"
)

if [[ "$ALLOW_UNSIGNED" == "1" ]]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
else
  # electron-builder expects the certificate common name without the
  # "Developer ID Application:" class prefix. Verification below still uses
  # the complete authority string from the release contract.
  export CSC_NAME="${CODESIGN_IDENTITY#Developer ID Application: }"
fi

(
  cd "$ROOT_DIR/apps/desktop"
  pnpm exec electron-builder "${BUILDER_ARGS[@]}"
)

BUILT_APP="$PACKAGER_OUTPUT/mac-universal/$APP_BUNDLE_NAME"
if [[ ! -d "$BUILT_APP" ]]; then
  echo "Built app bundle not found: $BUILT_APP" >&2
  exit 1
fi

ditto "$BUILT_APP" "$APP_PATH"

PLIST="$APP_PATH/Contents/Info.plist"
ACTUAL_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
ACTUAL_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")"
ACTUAL_IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")"
ACTUAL_EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")"

[[ "$ACTUAL_VERSION" == "$APP_VERSION" ]] || { echo "Version mismatch: $ACTUAL_VERSION" >&2; exit 1; }
[[ "$ACTUAL_BUILD" == "$APP_BUILD_NUMBER" ]] || { echo "Build mismatch: $ACTUAL_BUILD" >&2; exit 1; }
[[ "$ACTUAL_IDENTIFIER" == "$BUNDLE_IDENTIFIER" ]] || { echo "Bundle identifier mismatch: $ACTUAL_IDENTIFIER" >&2; exit 1; }
[[ "$ACTUAL_EXECUTABLE" == "$EXECUTABLE_NAME" ]] || { echo "Executable mismatch: $ACTUAL_EXECUTABLE" >&2; exit 1; }
[[ -x "$APP_PATH/Contents/MacOS/$EXECUTABLE_NAME" ]] || { echo "Mach-O executable is missing." >&2; exit 1; }
UPDATE_CONFIG="$APP_PATH/Contents/Resources/app-update.yml"
[[ -f "$UPDATE_CONFIG" ]] || { echo "Bundled updater configuration is missing." >&2; exit 1; }
grep -Fxq "provider: github" "$UPDATE_CONFIG"
grep -Fxq "owner: $GITHUB_OWNER" "$UPDATE_CONFIG"
grep -Fxq "repo: $GITHUB_REPO" "$UPDATE_CONFIG"

if [[ "$ALLOW_UNSIGNED" != "1" ]]; then
  codesign --verify --deep --strict --verbose=4 "$APP_PATH"
  SIGNING_INFO="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1)"
  ACTUAL_TEAM="$(printf '%s\n' "$SIGNING_INFO" | sed -n 's/^TeamIdentifier=//p')"
  printf '%s\n' "$SIGNING_INFO" | grep -Fq "Authority=$CODESIGN_IDENTITY" || {
    echo "Unexpected signing authority." >&2
    exit 1
  }
  [[ "$ACTUAL_TEAM" == "$TEAM_IDENTIFIER" ]] || {
    echo "TeamIdentifier mismatch: $ACTUAL_TEAM" >&2
    exit 1
  }
  printf '%s\n' "$SIGNING_INFO" | grep -Eq 'flags=.*runtime' || {
    echo "Hardened runtime is not enabled." >&2
    exit 1
  }
fi

echo "Built app: $APP_PATH"
