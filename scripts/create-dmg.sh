#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT_DIR/.github/release-contract.env"

# shellcheck disable=SC1090
source "$CONTRACT"

APP_PATH="${1:-$ROOT_DIR/.build/$APP_BUNDLE_NAME}"
OUTPUT_DMG="${2:-$ROOT_DIR/.build/artifacts/$DMG_ASSET_NAME}"
VOLUME_NAME="${VOLUME_NAME:-GamerScream}"
DMG_TITLE="${DMG_TITLE:-GamerScream}"
DMG_SUBTITLE="${DMG_SUBTITLE:-Voice chat, ready for the party.}"
DMG_HINT="${DMG_HINT:-Drag GamerScream to Applications}"

TRUST_VERIFIED=0
if codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1 && \
   xcrun stapler validate "$APP_PATH" >/dev/null 2>&1; then
  TRUST_VERIFIED=1
fi
if [[ "$TRUST_VERIFIED" == "1" ]]; then
  DMG_TRUST_TEXT="${DMG_TRUST_TEXT:-Developer ID signed and notarized}"
else
  DMG_TRUST_TEXT="${DMG_TRUST_TEXT:-Local preview — release workflow verifies signing}"
fi

WINDOW_WIDTH="${WINDOW_WIDTH:-760}"
WINDOW_HEIGHT="${WINDOW_HEIGHT:-610}"
BACKGROUND_WIDTH="${BACKGROUND_WIDTH:-$WINDOW_WIDTH}"
BACKGROUND_HEIGHT="${BACKGROUND_HEIGHT:-$WINDOW_HEIGHT}"
ICON_SIZE="${ICON_SIZE:-128}"
APP_X="${APP_X:-245}"
APP_Y="${APP_Y:-300}"
APPLICATIONS_X="${APPLICATIONS_X:-515}"
APPLICATIONS_Y="${APPLICATIONS_Y:-300}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 1
fi

if [[ "$(basename "$APP_PATH")" != "$APP_BUNDLE_NAME" ]]; then
  echo "App bundle must be named $APP_BUNDLE_NAME" >&2
  exit 1
fi

if [[ "$(basename "$OUTPUT_DMG")" != "$DMG_ASSET_NAME" ]]; then
  echo "DMG output must be named $DMG_ASSET_NAME" >&2
  exit 1
fi

for command in hdiutil osascript xcrun ditto; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

WORK_DIR="$(mktemp -d)"
STAGING_DIR="$WORK_DIR/staging"
BACKGROUND_DIR="$STAGING_DIR/.background"
BACKGROUND_PATH="$BACKGROUND_DIR/background.png"
RW_DMG="$WORK_DIR/$VOLUME_NAME.rw.dmg"
MOUNT_DIR="$WORK_DIR/mount"
BACKGROUND_SCRIPT="$WORK_DIR/make-dmg-background.swift"
MOUNTED=0

cleanup() {
  if [[ "$MOUNTED" == "1" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet -force >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKGROUND_DIR" "$MOUNT_DIR" "$(dirname "$OUTPUT_DMG")"
ditto "$APP_PATH" "$STAGING_DIR/$APP_BUNDLE_NAME"
ln -s /Applications "$STAGING_DIR/Applications"

cat > "$BACKGROUND_SCRIPT" <<'SWIFT'
import AppKit
import Foundation

let args = CommandLine.arguments
let outputPath = args[1]
let width = CGFloat(Double(args[2]) ?? 760)
let height = CGFloat(Double(args[3]) ?? 610)
let title = args[4]
let subtitle = args[5]
let hint = args[6]
let trustText = args[7]

func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
    NSColor(
        calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
        green: CGFloat((hex >> 8) & 0xff) / 255,
        blue: CGFloat(hex & 0xff) / 255,
        alpha: alpha
    )
}

func roundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    stroke.setStroke()
    path.lineWidth = 1
    path.stroke()
}

let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()

let background = NSGradient(colors: [color(0x09090b), color(0x18181b)])!
background.draw(in: NSRect(x: 0, y: 0, width: width, height: height), angle: -90)

let glow = NSGradient(colors: [color(0xf97316, alpha: 0.20), color(0xf97316, alpha: 0)])!
glow.draw(
    fromCenter: NSPoint(x: width / 2, y: height + 30),
    radius: 0,
    toCenter: NSPoint(x: width / 2, y: height + 30),
    radius: 330,
    options: [.drawsAfterEndingLocation]
)

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center

let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 31, weight: .bold),
    .foregroundColor: color(0xf4f4f5),
    .paragraphStyle: paragraph,
    .kern: -0.5
]
let subtitleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 16, weight: .medium),
    .foregroundColor: color(0xa1a1aa),
    .paragraphStyle: paragraph
]
let hintAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 15, weight: .semibold),
    .foregroundColor: color(0xf4f4f5),
    .paragraphStyle: paragraph
]
let trustAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 12, weight: .medium),
    .foregroundColor: color(0xa1a1aa),
    .paragraphStyle: paragraph
]

title.draw(in: NSRect(x: 0, y: 468, width: width, height: 42), withAttributes: titleAttributes)
subtitle.draw(in: NSRect(x: 0, y: 438, width: width, height: 28), withAttributes: subtitleAttributes)

roundedRect(
    NSRect(x: 150, y: 185, width: 190, height: 220),
    radius: 28,
    fill: color(0xf4f4f5, alpha: 0.92),
    stroke: color(0xffffff, alpha: 0.72)
)
roundedRect(
    NSRect(x: 420, y: 185, width: 190, height: 220),
    radius: 28,
    fill: color(0xf4f4f5, alpha: 0.92),
    stroke: color(0xffffff, alpha: 0.72)
)

let arrow = NSBezierPath()
arrow.lineWidth = 4
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
arrow.move(to: NSPoint(x: 350, y: 310))
arrow.line(to: NSPoint(x: 410, y: 310))
arrow.move(to: NSPoint(x: 398, y: 322))
arrow.line(to: NSPoint(x: 410, y: 310))
arrow.line(to: NSPoint(x: 398, y: 298))
color(0xf97316).setStroke()
arrow.stroke()

hint.draw(in: NSRect(x: 0, y: 150, width: width, height: 22), withAttributes: hintAttributes)
trustText.draw(
    in: NSRect(x: 0, y: 128, width: width, height: 18),
    withAttributes: trustAttributes
)

image.unlockFocus()

guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
else {
    fputs("Could not render DMG background\n", stderr)
    exit(1)
}

try png.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
SWIFT

xcrun swift "$BACKGROUND_SCRIPT" \
  "$BACKGROUND_PATH" \
  "$BACKGROUND_WIDTH" \
  "$BACKGROUND_HEIGHT" \
  "$DMG_TITLE" \
  "$DMG_SUBTITLE" \
  "$DMG_HINT" \
  "$DMG_TRUST_TEXT"

rm -f "$OUTPUT_DMG"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING_DIR" \
  -format UDRW \
  -fs HFS+ \
  -ov \
  "$RW_DMG" >/dev/null

hdiutil attach "$RW_DMG" \
  -readwrite \
  -noverify \
  -noautoopen \
  -mountpoint "$MOUNT_DIR" >/dev/null
MOUNTED=1

/usr/bin/SetFile -a V "$MOUNT_DIR/.background" >/dev/null 2>&1 || true
/usr/bin/SetFile -a V "$MOUNT_DIR/Applications" >/dev/null 2>&1 || true

osascript <<APPLESCRIPT
tell application "Finder"
  set dmgFolder to POSIX file "$MOUNT_DIR" as alias
  open dmgFolder
  delay 1
  set current view of container window of dmgFolder to icon view
  set toolbar visible of container window of dmgFolder to false
  set statusbar visible of container window of dmgFolder to false
  set bounds of container window of dmgFolder to {100, 100, 100 + $WINDOW_WIDTH, 100 + $WINDOW_HEIGHT}
  set theViewOptions to the icon view options of container window of dmgFolder
  set arrangement of theViewOptions to not arranged
  set icon size of theViewOptions to $ICON_SIZE
  set label position of theViewOptions to bottom
  set background picture of theViewOptions to file ".background:background.png" of dmgFolder
  set position of item "$APP_BUNDLE_NAME" of dmgFolder to {$APP_X, $APP_Y}
  set position of item "Applications" of dmgFolder to {$APPLICATIONS_X, $APPLICATIONS_Y}
  update dmgFolder without registering applications
  delay 1
  close container window of dmgFolder
end tell
APPLESCRIPT

sync
hdiutil detach "$MOUNT_DIR" -quiet -force >/dev/null
MOUNTED=0

hdiutil convert "$RW_DMG" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$OUTPUT_DMG" >/dev/null

hdiutil verify "$OUTPUT_DMG" >/dev/null
echo "Created DMG: $OUTPUT_DMG"
