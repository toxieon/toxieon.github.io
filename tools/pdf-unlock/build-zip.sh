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
  core.py \
  qpdf_util.py \
  worker.py \
  pdf_unlock.py \
  pdf_unlock_gui.py \
  setup.bat \
  unlock.bat \
  unlock-gui.bat \
  tests \
  -x '*__pycache__*' '*.pyc' 'tests/.pytest_cache/*'
echo "Wrote $OUT"
