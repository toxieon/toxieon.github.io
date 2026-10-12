#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="0.2.3"
OUT_DIR="$ROOT/dist"
ARCHIVE="$OUT_DIR/fullpage-capture-${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$ARCHIVE"

(
  cd "$ROOT"
  zip -r "$ARCHIVE" . \
    -x './dist/*' \
    -x './.DS_Store' \
    -x '*/.DS_Store'
)

echo "Created $ARCHIVE"
