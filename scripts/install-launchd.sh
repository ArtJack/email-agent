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
RUNTIME_DIR="$HOME/Library/Application Support/email-agent"
LOG_DIR="$HOME/Library/Logs/email-agent"

if [ "${1:-install}" = "uninstall" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "Uninstalled $LABEL."
  exit 0
fi

if [ ! -f "$PROJECT_DIR/dist/run.cjs" ]; then
  echo "dist/run.cjs not found. Run 'npm run build' first."
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
mkdir -p "$RUNTIME_DIR/dist" "$RUNTIME_DIR/data" "$RUNTIME_DIR/node_modules"
mkdir -p "$LOG_DIR"

cp "$PROJECT_DIR/dist/run.cjs" "$RUNTIME_DIR/dist/run.cjs"
cp "$PROJECT_DIR/dist/run.cjs.map" "$RUNTIME_DIR/dist/run.cjs.map" 2>/dev/null || true
cp "$PROJECT_DIR/.env" "$RUNTIME_DIR/.env"
chmod 600 "$RUNTIME_DIR/.env"
printf '{\n  "type": "module"\n}\n' > "$RUNTIME_DIR/package.json"

# The runtime bundle contains JS dependencies; better-sqlite3 stays external because
# it loads a native .node addon.
rm -rf \
  "$RUNTIME_DIR/node_modules/better-sqlite3" \
  "$RUNTIME_DIR/node_modules/bindings" \
  "$RUNTIME_DIR/node_modules/file-uri-to-path"
mkdir -p "$RUNTIME_DIR/node_modules/better-sqlite3/build"
cp "$PROJECT_DIR/node_modules/better-sqlite3/package.json" "$RUNTIME_DIR/node_modules/better-sqlite3/package.json"
cp -R "$PROJECT_DIR/node_modules/better-sqlite3/lib" "$RUNTIME_DIR/node_modules/better-sqlite3/lib"
cp -R "$PROJECT_DIR/node_modules/better-sqlite3/build/Release" "$RUNTIME_DIR/node_modules/better-sqlite3/build/Release"
cp -R "$PROJECT_DIR/node_modules/bindings" "$RUNTIME_DIR/node_modules/bindings"
cp -R "$PROJECT_DIR/node_modules/file-uri-to-path" "$RUNTIME_DIR/node_modules/file-uri-to-path"

if [ -f "$PROJECT_DIR/data/state.db" ] && [ ! -f "$RUNTIME_DIR/data/state.db" ]; then
  cp "$PROJECT_DIR/data/state.db"* "$RUNTIME_DIR/data/" 2>/dev/null || true
fi

# Substitute placeholders into the plist
sed \
  -e "s|__LABEL__|$LABEL|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
  -e "s|__RUNTIME_DIR__|$RUNTIME_DIR|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__PATH__|$PATH_VALUE|g" \
  "$TEMPLATE" > "$PLIST_DEST"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed launch agent: $LABEL"
echo "  Plist:       $PLIST_DEST"
echo "  Node:        $NODE_BIN"
echo "  Project:     $PROJECT_DIR"
echo "  Runtime:     $RUNTIME_DIR"
echo "  Logs:        $LOG_DIR"
echo "  Schedule:    daily at 10:00, with hourly catch-up after login/wake"
echo ""
echo "Useful commands:"
echo "  launchctl start $LABEL         # trigger a run now"
echo "  launchctl list | grep email    # see status"
echo "  tail -f $LOG_DIR/stdout.log"
echo "  $0 uninstall                   # remove the job"
