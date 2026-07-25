#!/usr/bin/env bash
set -euo pipefail

# gh reads GH_TOKEN from the environment automatically. Wire it into git so the
# agents' `git clone` / `git push` against the target repo authenticate headlessly.
if [ -n "${GH_TOKEN:-}" ]; then
  gh auth setup-git
fi

exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
