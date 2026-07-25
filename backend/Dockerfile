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

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .

# Git identity for the agents' commits.
RUN git config --global user.email "agent@foundersinc.dev" \
 && git config --global user.name "Founders Agent"

ENV PORT=8000
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
