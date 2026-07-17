#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="GamerScream"
BUNDLE_ID="com.gamerscream.app"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
ARCH_DIR="mac"

if [ "$(uname -m)" = "arm64" ]; then
    ARCH_DIR="mac-arm64"
fi

APP_BUNDLE="$DESKTOP_DIR/release/$ARCH_DIR/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

cd "$ROOT_DIR"
pnpm --filter desktop exec electron-vite build
pnpm --filter desktop exec electron-builder --mac dir --publish never

if [ ! -d "$APP_BUNDLE" ]; then
    echo "Built app bundle was not found at $APP_BUNDLE" >&2
    exit 1
fi

open_app() {
    /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
    run)
        open_app
        ;;
    --debug|debug)
        lldb -- "$APP_BINARY"
        ;;
    --logs|logs)
        open_app
        /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
        ;;
    --telemetry|telemetry)
        open_app
        /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
        ;;
    --verify|verify)
        open_app
        for _ in {1..20}; do
            if pgrep -x "$APP_NAME" >/dev/null; then
                exit 0
            fi
            sleep 0.25
        done
        echo "$APP_NAME did not start within 5 seconds" >&2
        exit 1
        ;;
    *)
        echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
        exit 2
        ;;
esac
