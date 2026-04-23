#!/usr/bin/env bash
# Wrapper that always runs npm scripts from this project's directory,
# regardless of the caller's CWD. Immune to "ran from the wrong folder" mistakes.
#
# Usage:
#   ./run.sh dev              # one-off real run
#   ./run.sh dry-run          # print digest, don't send
#   ./run.sh test-connection  # check IMAP credentials
#   ./run.sh build            # compile TS -> dist/
#   ./run.sh start            # run compiled dist/run.js

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")" && pwd)"
cd "$SCRIPT_DIR"

cmd="${1:-dry-run}"
shift || true

exec npm run "$cmd" -- "$@"
