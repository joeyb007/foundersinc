# FastAPI agent service — runs real coding agents via the Claude Agent SDK,
# which drives the Claude Code CLI + git + gh. Needs a full toolchain, so this
# is a container (NOT a serverless function). Deploys to Railway / Render / Fly.
FROM python:3.13-slim

# System toolchain: git, gh (GitHub CLI), Node (for the Claude Code CLI), curl.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gnupg wget \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && mkdir -p -m 755 /etc/apt/keyrings \
 && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# The Claude Code CLI that the Agent SDK spawns.
RUN npm install -g @anthropic-ai/claude-code

# uv, installed system-wide rather than into /root/.local — the service runs as
# a non-root user (below) and could not reach it there.
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# MUST run unprivileged. The agents use permission_mode="bypassPermissions",
# and the Claude Code CLI hard-refuses that as root:
#   "--dangerously-skip-permissions cannot be used with root/sudo privileges"
# Containers default to root, so without this every agent dies on startup while
# the service itself looks perfectly healthy.
RUN useradd --create-home --shell /bin/bash agent

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# /app must be owned by `agent` before the USER switch: WORKDIR creates it as
# root, and `uv sync` then can't write .venv into it — the build fails at that
# layer, not at runtime.
RUN mkdir -p /app && chown -R agent:agent /app
WORKDIR /app
COPY --chown=agent:agent pyproject.toml uv.lock ./

USER agent
ENV HOME=/home/agent

RUN uv sync --frozen --no-dev
COPY --chown=agent:agent . .

# Fallback identity only — repo.py sets user.name/user.email per checkout, so
# commits are attributed even if this is missing.
RUN git config --global user.email "agent@foundersinc.dev" \
 && git config --global user.name "Founders Agent"

ENV PORT=8000
CMD ["/entrypoint.sh"]
