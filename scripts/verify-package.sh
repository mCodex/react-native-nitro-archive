#!/usr/bin/env bash
set -euo pipefail

echo "=== Package verification ==="

echo ""
echo "1. TypeScript type check..."
npx tsc --noEmit
echo "   PASS"

echo ""
echo "2. Biome lint..."
npx biome check src/
echo "   PASS"

echo ""
echo "3. npm pack dry-run..."
npm pack --dry-run
echo "   PASS"

echo ""
echo "4. Android manifest permissions check..."
MANIFEST="android/src/main/AndroidManifest.xml"

BROAD_PERMISSIONS=(
  "MANAGE_EXTERNAL_STORAGE"
  "READ_MEDIA_IMAGES"
  "READ_MEDIA_VIDEO"
  "READ_MEDIA_AUDIO"
  "READ_EXTERNAL_STORAGE"
  "WRITE_EXTERNAL_STORAGE"
)

for perm in "${BROAD_PERMISSIONS[@]}"; do
  if grep -q "android.permission.$perm" "$MANIFEST"; then
    echo "   FAIL: Found prohibited permission: $perm"
    exit 1
  fi
done
echo "   PASS (no broad storage permissions)"

echo ""
echo "5. Contract parity..."
npx tsx scripts/verify-contract-parity.ts
echo "   PASS"

echo ""
echo "=== All checks passed ==="
