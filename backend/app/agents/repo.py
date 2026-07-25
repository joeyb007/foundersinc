import re
import subprocess
import tempfile
import uuid


class RepoError(RuntimeError):
    """Raised when a git/gh operation fails; callers should fall back to a diff."""


class NoChangesError(RepoError):
    """Raised when the agent made no changes to commit.

    This is a legitimate, non-error outcome (not a push/PR failure) — callers
    should treat it as "done, nothing to do" rather than falling back to a diff.
    """


def _run(cmd: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RepoError(f"`{' '.join(cmd)}` failed: {result.stderr.strip()}")
    return result


def clone_and_branch(target_repo: str, agent_type: str) -> tuple[str, str]:
    """Clone `target_repo` into a fresh temp dir and create a feature branch.

    Returns (workdir, branch). One isolated checkout per run — this is the
    blast-radius boundary for the agent's `bypassPermissions` edits.
    """
    workdir = tempfile.mkdtemp(prefix=f"agent-{agent_type}-")
    branch = f"agent/{agent_type}-{uuid.uuid4().hex[:8]}"

    _run(["git", "clone", target_repo, workdir])
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
    _run(["git", "push", "origin", branch], cwd=workdir)

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
