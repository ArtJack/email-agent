#!/usr/bin/env bash
# Installs the email-agent launchd job for the current user.
# Auto-detects paths, so this works regardless of where you clone the repo.
#
# Usage:
#   ./scripts/install-launchd.sh            # install (runs daily at 10am)
#   ./scripts/install-launchd.sh uninstall  # remove
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$PROJECT_DIR/launchd/email-agent.plist.template"
LABEL="com.$(whoami).emailagent"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-install}" = "uninstall" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "Uninstalled $LABEL."
  exit 0
fi

if [ ! -f "$PROJECT_DIR/dist/run.js" ]; then
  echo "dist/run.js not found. Run 'npm run build' first."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo ".env not found. Copy .env.example to .env and fill in secrets first."
  exit 1
fi

NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  echo "node not found on PATH. Install Node.js first (e.g. brew install node)."
  exit 1
fi

PATH_VALUE="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/logs"

# Substitute placeholders into the plist
sed \
  -e "s|__LABEL__|$LABEL|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
  -e "s|__PATH__|$PATH_VALUE|g" \
  "$TEMPLATE" > "$PLIST_DEST"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed launch agent: $LABEL"
echo "  Plist:       $PLIST_DEST"
echo "  Node:        $NODE_BIN"
echo "  Project:     $PROJECT_DIR"
echo "  Schedule:    daily at 10:00"
echo ""
echo "Useful commands:"
echo "  launchctl start $LABEL         # trigger a run now"
echo "  launchctl list | grep email    # see status"
echo "  tail -f $PROJECT_DIR/logs/stdout.log"
echo "  $0 uninstall                   # remove the job"
