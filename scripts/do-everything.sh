#!/usr/bin/env bash
# One-shot setup: opens Chrome pages and loads the extension if possible.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/chrome-extension"
APP="https://remotelymatch.app/profile"

echo "RemoteMatch — automated setup"
echo "Extension folder: $EXT"
echo ""

# Try loading extension into Chrome (may open a new window)
if [ -d "/Applications/Google Chrome.app" ]; then
  echo "Launching Chrome with RemoteMatch extension..."
  open -na "Google Chrome" --args --load-extension="$EXT" "$APP" "chrome://extensions/" 2>/dev/null || true
else
  echo "Chrome not found at /Applications/Google Chrome.app"
  open "$APP" 2>/dev/null || true
  open "chrome://extensions/" 2>/dev/null || true
fi

sleep 2
echo ""
echo "=== If extension is not listed yet ==="
echo "1. On chrome://extensions turn ON Developer mode"
echo "2. Click Load unpacked → select:"
echo "   $EXT"
echo ""
echo "=== Then on RemoteMatch Profile ==="
echo "3. Log in at $APP"
echo "4. Click 'Connect extension automatically'"
echo ""
echo "=== Test ==="
echo "5. Open any job posting → RemoteMatch icon → Add to queue"
echo "6. https://remotelymatch.app/approvals"
