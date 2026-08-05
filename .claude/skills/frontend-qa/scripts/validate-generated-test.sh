#!/usr/bin/env bash
# Validate generated tests: static audit, then repeated execution.
#
# Exits non-zero if either stage fails, so it is usable as a gate in CI or a
# pre-commit hook. Instructions guide an agent; scripts like this one are what
# actually stop bad work from landing.
#
# Usage: validate-generated-test.sh [target] [repeatEach]
set -euo pipefail

TARGET="${1:-tests/e2e/generated}"
REPEAT="${2:-3}"

ENGINE_ROOT="${AGENT_QA_ENGINE_ROOT:-}"
if [ -z "$ENGINE_ROOT" ]; then
  echo "Set AGENT_QA_ENGINE_ROOT to the Auto-QA checkout." >&2
  exit 2
fi

echo "Auditing ${TARGET} (repeatEach=${REPEAT})"
REPEAT_EACH="$REPEAT" npx tsx "${ENGINE_ROOT}/src/cli-audit.ts" "$TARGET"
