from unittest.mock import patch

from app.agents import repo


def _fake_run_factory(pr_url: str = "https://github.com/me/throwaway/pull/9"):
    calls: list[list[str]] = []

    def _fake_run(cmd, cwd=None, capture_output=True, text=True):
        calls.append(cmd)
        stdout = ""
        if cmd[:2] == ["git", "status"]:
            stdout = "M app.py\n"  # pretend there are changes
        elif cmd[:2] == ["gh", "pr"]:
            stdout = f"Creating pull request\n{pr_url}\n"
        return type("Result", (), {"returncode": 0, "stdout": stdout, "stderr": ""})()

    return _fake_run, calls


def test_clone_and_branch_invokes_git_clone_and_checkout():
    fake_run, calls = _fake_run_factory()
    with patch("subprocess.run", side_effect=fake_run):
        workdir, branch = repo.clone_and_branch("https://example.invalid/x/y.git", "swe")

    assert branch.startswith("agent/swe-")
    clone_calls = [c for c in calls if c[:2] == ["git", "clone"]]
    checkout_calls = [c for c in calls if c[:2] == ["git", "checkout"]]
    assert len(clone_calls) == 1
    assert clone_calls[0][2] == "https://example.invalid/x/y.git"
    assert len(checkout_calls) == 1
    assert branch in checkout_calls[0]


def test_commit_push_pr_returns_parsed_pr_url():
    fake_run, calls = _fake_run_factory(pr_url="https://github.com/me/throwaway/pull/9")
    with patch("subprocess.run", side_effect=fake_run):
        url = repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "[swe] Add health endpoint")

    assert url == "https://github.com/me/throwaway/pull/9"
    add_calls = [c for c in calls if c[:2] == ["git", "add"]]
    commit_calls = [c for c in calls if c[:2] == ["git", "commit"]]
    push_calls = [c for c in calls if c[:2] == ["git", "push"]]
    pr_calls = [c for c in calls if c[:2] == ["gh", "pr"]]
    assert len(add_calls) == 1
    assert len(commit_calls) == 1
    assert len(push_calls) == 1
    assert len(pr_calls) == 1


def test_commit_push_pr_raises_no_changes_error_when_no_changes():
    fake_run, _ = _fake_run_factory()

    def _no_changes_run(cmd, cwd=None, capture_output=True, text=True):
        if cmd[:2] == ["git", "status"]:
            return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        return fake_run(cmd, cwd=cwd)

    with patch("subprocess.run", side_effect=_no_changes_run):
        try:
            repo.commit_push_pr("/tmp/fake-workdir", "agent/swe-abc123", "title")
            assert False, "expected NoChangesError"
        except repo.NoChangesError:
            pass

    # NoChangesError is a distinct outcome from a genuine push/PR failure, but
    # remains a RepoError so existing catch-alls still work.
    assert issubclass(repo.NoChangesError, repo.RepoError)
