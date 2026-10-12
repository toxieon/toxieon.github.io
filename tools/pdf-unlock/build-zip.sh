#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NAME="pdf-unlock"
OUT="${ROOT}/${NAME}.zip"
cd "$ROOT"
rm -f "$OUT"
zip -r "$OUT" \
  LICENSE \
  README.md \
  requirements.txt \
  pdf_unlock.py \
  worker.py \
  setup.bat \
  unlock.bat \
  tests \
  -x '*__pycache__*' '*.pyc' 'tests/.pytest_cache/*'
echo "Wrote $OUT"
