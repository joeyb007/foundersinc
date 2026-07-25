#!/usr/bin/env bash
set -euo pipefail

# Deliberately NOT running `gh auth setup-git` here.
#
# That installs a global git credential helper, which would hand the token to
# any git command run inside the container — including ones the coding agent
# runs itself, since it gets a shell with `bypassPermissions`. Instead
# app/agents/repo.py passes the credential per-invocation (a one-shot authed
# URL for clone/push, GH_TOKEN in the env of the `gh` subprocess only) and
# resets the checkout's remote to the credential-free URL immediately after
# cloning. Keep it that way.

# Identity is load-bearing, not cosmetic: the Claude Code CLI refuses
# bypassPermissions as root, and that failure only shows up per-agent at run
# time. Log it at boot so a misbuilt image is obvious immediately.
echo "[entrypoint] running as $(id -un) (uid $(id -u))"

exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
