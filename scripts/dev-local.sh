#!/usr/bin/env bash
# Run from macOS Terminal.app (not Cursor terminal — paste bug in Cursor PTY).
# Usage: ./scripts/dev-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ remotelymatch local dev"
echo "  App:    http://localhost:5173"
echo "  API:    http://localhost:5100/api/health"
echo ""

if ! docker info >/dev/null 2>&1; then
  echo "⚠ Docker not running."
  echo "  Option A: Open Docker Desktop, then run: npm run mongo:up"
  echo "  Option B: Comment out MONGODB_URI in backend/.env for SQLite-only mode"
  echo ""
else
  if ! docker ps --filter name=remotelymatch-mongo --format '{{.Status}}' 2>/dev/null | grep -q Up; then
    echo "→ Starting MongoDB…"
    npm run mongo:up
    sleep 2
  fi
fi

echo "→ Starting backend + frontend (Ctrl+C to stop)"
npm run dev
