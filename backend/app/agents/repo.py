import os
import re
import subprocess
import tempfile
import uuid

import httpx

GITHUB_API = "https://api.github.com"

# The agent gets a shell inside the checkout with `bypassPermissions`, so the
# credential must never be reachable from in there: it is handed to git only as
# a one-shot URL argument, never written to `.git/config`, and scrubbed out of
# any error text before that text is streamed to Convex and onto the board.


class RepoError(RuntimeError):
    """Raised when a git/gh operation fails; callers should fall back to a diff."""


class NoChangesError(RepoError):
    """Raised when the agent made no changes to commit.

    This is a legitimate, non-error outcome (not a push/PR failure) — callers
    should treat it as "done, nothing to do" rather than falling back to a diff.
    """


def _token() -> str:
    return os.environ["GITHUB_TOKEN"]


def redact(text: str) -> str:
    """Strip the token out of anything user-visible.

    Git and gh echo the full remote URL — credentials included — back in their
    error messages, and those messages get streamed into the run log.
    """
    token = os.environ.get("GITHUB_TOKEN")
    return text.replace(token, "***") if token else text


def _authed_url(repo_url: str) -> str:
    return repo_url.replace("https://", f"https://x-access-token:{_token()}@", 1)


def _run(
    cmd: list[str], cwd: str | None = None, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        env={**os.environ, **env} if env else None,
    )
    if result.returncode != 0:
        raise RepoError(
            f"`{redact(' '.join(cmd))}` failed: {redact(result.stderr.strip())}"
        )
    return result


# ---------------------------------------------------------------------------
# Creating the per-epic repo
# ---------------------------------------------------------------------------


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-")
    return slug or "epic"


def _api_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def ensure_repo(title: str) -> str:
    """Create a fresh throwaway repo for one epic and return its clone URL.

    `auto_init` matters: agents branch off the default branch and open a PR
    against it, and a repo with no initial commit has no default branch — the
    push would land but `gh pr create` would then fail with no base to target.

    The name carries a random suffix so this is safe to retry. Idempotency per
    epic lives in Convex, which stores the URL on the epic and skips this call
    once one is set.
    """
    org = os.environ.get("GITHUB_ORG")
    endpoint = f"{GITHUB_API}/orgs/{org}/repos" if org else f"{GITHUB_API}/user/repos"

    response = httpx.post(
        endpoint,
        headers=_api_headers(),
        json={
            "name": f"fi-{slugify(title)}-{uuid.uuid4().hex[:6]}",
            "description": f"Autonomous SDLC run — {title}"[:350],
            "private": True,
            "auto_init": True,
        },
        timeout=30,
    )
    if response.status_code != 201:
        raise RepoError(
            f"could not create repo ({response.status_code}): {redact(response.text[:300])}"
        )
    return response.json()["clone_url"]


# ---------------------------------------------------------------------------
# Working in it
# ---------------------------------------------------------------------------


def clone_and_branch(repo_url: str, agent_type: str) -> tuple[str, str]:
    """Clone `repo_url` into a fresh temp dir and create a feature branch.

    Returns (workdir, branch). One isolated checkout per run — this is the
    blast-radius boundary for the agent's `bypassPermissions` edits.
    """
    workdir = tempfile.mkdtemp(prefix=f"agent-{agent_type}-")
    branch = f"agent/{agent_type}-{uuid.uuid4().hex[:8]}"

    _run(["git", "clone", _authed_url(repo_url), workdir])
    # Rewrite the remote back to the credential-free URL straight away: `git
    # clone` persists whatever URL it was given into .git/config, which the
    # agent can read.
    _run(["git", "remote", "set-url", "origin", repo_url], cwd=workdir)

    # A fresh host has no global git identity, and `git commit` hard-fails
    # without one. Scope it to this checkout rather than the machine.
    _run(["git", "config", "user.email", "agents@foundersinc.local"], cwd=workdir)
    _run(["git", "config", "user.name", "Founders Inc Agents"], cwd=workdir)

    _run(["git", "checkout", "-b", branch], cwd=workdir)

    return workdir, branch


def commit_push_pr(workdir: str, branch: str, title: str) -> str | None:
    """Commit any changes, push the branch, and open a PR.

    Returns the PR URL, or raises RepoError so the caller can fall back to a
    `git diff` string instead.
    """
    diff_check = subprocess.run(
        ["git", "status", "--porcelain"], cwd=workdir, capture_output=True, text=True
    )
    if not diff_check.stdout.strip():
        raise NoChangesError("no changes to commit")

    _run(["git", "add", "-A"], cwd=workdir)
    _run(["git", "commit", "-m", title], cwd=workdir)

    # Push to the authenticated URL explicitly rather than to `origin`, so the
    # credential never has to live in .git/config.
    remote = _run(["git", "remote", "get-url", "origin"], cwd=workdir).stdout.strip()
    _run(["git", "push", _authed_url(remote), branch], cwd=workdir)

    pr = _run(
        [
            "gh",
            "pr",
            "create",
            "--title",
            title,
            "--body",
            "Autonomous agent PR",
            "--head",
            branch,
        ],
        cwd=workdir,
        # gh reads GH_TOKEN from the environment, so the host needs no separate
        # `gh auth login`.
        env={"GH_TOKEN": _token()},
    )
    url = _extract_pr_url(pr.stdout)
    if not url:
        raise RepoError(f"could not parse PR URL from `gh pr create` output: {pr.stdout!r}")
    return url


def diff_fallback(workdir: str) -> str:
    """Best-effort `git diff` string when push/PR fails, for `runs.diff`."""
    result = subprocess.run(
        ["git", "diff", "HEAD"], cwd=workdir, capture_output=True, text=True
    )
    return result.stdout or "(no diff available)"


def _extract_pr_url(stdout: str) -> str | None:
    match = re.search(r"https://\S+", stdout)
    return match.group(0) if match else None
