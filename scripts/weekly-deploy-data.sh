#!/bin/bash
# Weekly sync: refresh agent SQLite snapshots and push to Render.
# Install on Mac: crontab -e
# 0 9 * * 1 cd /Users/user/job-event-agent/remotelymatch && ./scripts/weekly-deploy-data.sh >> /tmp/remotelymatch-sync.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "[$(date)] Starting weekly remotelymatch data deploy..."
npm run deploy:data
echo "[$(date)] Done."
