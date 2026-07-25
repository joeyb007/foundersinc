from unittest.mock import patch

import pytest

from app.agents import repo

TOKEN = "ghp_sekrit"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", TOKEN)
    monkeypatch.delenv("GITHUB_ORG", raising=False)


def _fake_run_factory(pr_url: str = "https://github.com/me/throwaway/pull/9"):
    calls: list[list[str]] = []

    def _fake_run(cmd, cwd=None, capture_output=True, text=True, env=None):
        calls.append(cmd)
        stdout = ""
        if cmd[:2] == ["git", "status"]:
            stdout = "M app.py\n"  # pretend there are changes
        elif cmd[:2] == ["git", "rev-list"]:
            stdout = "1\n"  # one commit ahead of origin/HEAD
        elif cmd[:3] == ["git", "remote", "get-url"]:
            stdout = "https://github.com/me/throwaway.git\n"
        elif cmd[:2] == ["gh", "pr"]:
            stdout = f"Creating pull request\n{pr_url}\n"
        return type("Result", (), {"returncode": 0, "stdout": stdout, "stderr": ""})()

    return _fake_run, calls


def test_clone_and_branch_invokes_git_clone_and_checkout():
    fake_run, calls = _fake_run_factory()
    with patch("subprocess.run", side_effect=fake_run):
        workdir, branch = repo.clone_and_branch("https://github.com/me/y.git", "swe")

    assert branch.startswith("agent/swe-")
    clone_calls = [c for c in calls if c[:2] == ["git", "clone"]]
    checkout_calls = [c for c in calls if c[:2] == ["git", "checkout"]]
    assert len(clone_calls) == 1
    assert len(checkout_calls) == 1
    assert branch in checkout_calls[0]


def test_clone_uses_token_then_strips_it_from_git_config():
    """The agent gets a shell in this checkout, so the credential must not
    survive in .git/config — clone with it, then immediately reset the remote."""
    fake_run, calls = _fake_run_factory()
    with patch("subprocess.run", side_effect=fake_run):
        repo.clone_and_branch("https://github.com/me/y.git", "swe")

    clone_url = [c for c in calls if c[:2] == ["git", "clone"]][0][2]
    assert TOKEN in clone_url  # needed to authenticate the clone itself

    set_url = [c for c in calls if c[:3] == ["git", "remote", "set-url"]]
    assert len(set_url) == 1
    assert set_url[0][-1] == "https://github.com/me/y.git"
    assert TOKEN not in set_url[0][-1]


def test_clone_sets_a_local_git_identity():
    """A fresh host has no global identity and `git commit` hard-fails without
    one, which would surface as a mystifying mid-run failure."""
    fake_run, calls = _fake_run_factory()
    with patch("subprocess.run", side_effect=fake_run):
        repo.clone_and_branch("https://github.com/me/y.git", "swe")

    configured = {c[2] for c in calls if c[:2] == ["git", "config"]}
    assert {"user.email", "user.name"} <= configured


def test_commit_push_pr_returns_parsed_pr_url():
    fake_run, calls = _fake_run_factory(pr_url="https://github.com/me/throwaway/pull/9")
    with patch("subprocess.run", side_effect=fake_run):
        url = repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "[swe] Add health endpoint")

    assert url == "https://github.com/me/throwaway/pull/9"
    assert len([c for c in calls if c[:2] == ["git", "add"]]) == 1
    assert len([c for c in calls if c[:2] == ["git", "commit"]]) == 1
    assert len([c for c in calls if c[:2] == ["git", "push"]]) == 1
    assert len([c for c in calls if c[:2] == ["gh", "pr"]]) == 1


def test_push_authenticates_via_url_not_origin():
    """Pushing to `origin` would need the credential in .git/config; pass it as
    a one-shot argument instead."""
    fake_run, calls = _fake_run_factory()
    with patch("subprocess.run", side_effect=fake_run):
        repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "title")

    push = [c for c in calls if c[:2] == ["git", "push"]][0]
    assert "origin" not in push
    assert TOKEN in push[2]


def test_commit_push_pr_raises_no_changes_error_when_no_changes():
    """No uncommitted changes AND no commits ahead of the default branch."""
    fake_run, _ = _fake_run_factory()

    def _no_changes_run(cmd, cwd=None, capture_output=True, text=True, env=None):
        if cmd[:2] == ["git", "status"]:
            return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        if cmd[:2] == ["git", "rev-list"]:
            return type("Result", (), {"returncode": 0, "stdout": "0\n", "stderr": ""})()
        return fake_run(cmd, cwd=cwd)

    with patch("subprocess.run", side_effect=_no_changes_run):
        with pytest.raises(repo.NoChangesError):
            repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "title")

    # NoChangesError is a distinct outcome from a genuine push/PR failure, but
    # remains a RepoError so existing catch-alls still work.
    assert issubclass(repo.NoChangesError, repo.RepoError)


def test_work_the_agent_committed_itself_still_becomes_a_pr():
    """Regression: an agent ran `git commit` on its own work mid-run. The old
    check only looked at `git status --porcelain`, saw a clean tree, threw
    NoChangesError, and a finished quotes module died one push short of a PR."""
    fake_run, calls = _fake_run_factory()

    def _self_committed_run(cmd, cwd=None, capture_output=True, text=True, env=None):
        if cmd[:2] == ["git", "status"]:
            # Clean tree — the agent already committed.
            return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        return fake_run(cmd, cwd=cwd)

    with patch("subprocess.run", side_effect=_self_committed_run):
        url = repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "title")

    assert url == "https://github.com/me/throwaway/pull/9"
    # Nothing to stage, so no synthetic commit — but push and PR still happen.
    assert not any(c[:2] == ["git", "commit"] for c in calls)
    assert any(c[:2] == ["git", "push"] for c in calls)
    assert any(c[:2] == ["gh", "pr"] for c in calls)


def test_failure_message_redacts_the_token():
    """git echoes the full remote URL back on failure, and that text is streamed
    into the run log and rendered on the board."""

    def _failing_run(cmd, cwd=None, capture_output=True, text=True, env=None):
        return type(
            "Result",
            (),
            {
                "returncode": 1,
                "stdout": "",
                "stderr": f"fatal: could not read from https://x-access-token:{TOKEN}@github.com/me/y.git",
            },
        )()

    with patch("subprocess.run", side_effect=_failing_run):
        with pytest.raises(repo.RepoError) as excinfo:
            repo.clone_and_branch("https://github.com/me/y.git", "swe")

    assert TOKEN not in str(excinfo.value)
    assert "***" in str(excinfo.value)


def test_ensure_repo_creates_an_initialized_private_repo():
    """auto_init matters: without an initial commit there is no default branch,
    so the push would land and `gh pr create` would then fail with no base."""
    captured = {}

    class _Response:
        status_code = 201

        @staticmethod
        def json():
            return {"clone_url": "https://github.com/me/fi-ship-the-mvp-a1b2c3.git"}

    def _fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return _Response()

    with patch("app.agents.repo.httpx.post", side_effect=_fake_post):
        url = repo.ensure_repo("Ship the MVP dashboard")

    assert url == "https://github.com/me/fi-ship-the-mvp-a1b2c3.git"
    assert captured["url"].endswith("/user/repos")
    assert captured["json"]["auto_init"] is True
    assert captured["json"]["private"] is True
    assert captured["json"]["name"].startswith("fi-ship-the-mvp-dashboard-")


def test_ensure_repo_targets_the_org_when_one_is_configured(monkeypatch):
    monkeypatch.setenv("GITHUB_ORG", "founders-throwaway")
    captured = {}

    class _Response:
        status_code = 201

        @staticmethod
        def json():
            return {"clone_url": "https://github.com/founders-throwaway/fi-x-a1b2c3.git"}

    def _fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        return _Response()

    with patch("app.agents.repo.httpx.post", side_effect=_fake_post):
        repo.ensure_repo("X")

    assert captured["url"].endswith("/orgs/founders-throwaway/repos")


def test_ensure_repo_raises_repo_error_on_non_201():
    class _Response:
        status_code = 403
        text = f"token {TOKEN} lacks permission"

    with patch("app.agents.repo.httpx.post", return_value=_Response()):
        with pytest.raises(repo.RepoError) as excinfo:
            repo.ensure_repo("X")

    assert "403" in str(excinfo.value)
    assert TOKEN not in str(excinfo.value)


def test_slugify_handles_punctuation_and_empty_titles():
    assert repo.slugify("Realtime chat for Founders Inc!") == "realtime-chat-for-founders-inc"
    assert repo.slugify("!!!") == "epic"
    assert len(repo.slugify("x" * 200)) <= 40
