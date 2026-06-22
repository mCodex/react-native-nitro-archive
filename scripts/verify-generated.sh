#!/usr/bin/env bash
set -euo pipefail

echo "Checking that generated code is not stale..."

# Run nitrogen to regenerate
npx nitrogen --logLevel="error"

# Check if any tracked generated files changed
if ! git diff --quiet -- nitrogen/ generated/; then
  echo "ERROR: Generated code is stale. Run 'npx nitrogen' and commit the changes."
  echo ""
  echo "Changed files:"
  git diff --name-only -- nitrogen/ generated/
  exit 1
fi

echo "OK: Generated code is up to date."
