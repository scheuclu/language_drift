#!/usr/bin/env bash
# Upload the regenerated web data to Vercel Blob under data/v4/.
# Run AFTER scripts/run_regen_500.sh + pack. Then bump web/lib/data-source.ts to v4.
set -euo pipefail
cd "$(dirname "$0")/.."

VER="${1:-v4}"
TOKEN="$(grep BLOB_READ_WRITE_TOKEN web/.env.local | cut -d'"' -f2)"
WD="web/public/data"

put() {
  local src="$1" dest="$2"
  echo "→ $dest  ($(du -h "$src" | cut -f1))"
  vercel blob put "$src" --pathname "data/$VER/$dest" --access public \
    --allow-overwrite true --rw-token "$TOKEN" >/dev/null
}

put "$WD/packed/vecs.bin"            vecs.bin
put "$WD/packed/neighbors.bin"       neighbors.bin
put "$WD/packed/neighbors_index.json" neighbors_index.json
put "$WD/manifest.json"              manifest.json
put "$WD/drift_gallery.json"         drift_gallery.json
put "$WD/arith.bin"                  arith.bin
put "$WD/space.bin"                  space.bin
put "$WD/space_index.json"           space_index.json
put "$WD/llm.json"                   llm.json

echo "all uploaded to data/$VER/"
