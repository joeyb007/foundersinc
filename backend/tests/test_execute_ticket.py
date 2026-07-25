import asyncio
from unittest.mock import patch

from app.api import agents
from app.agents.repo import NoChangesError, RepoError


def _patch_common(**overrides):
    """Patch the pieces execute_ticket calls out to, with sane defaults."""
    defaults = dict(
        clone_and_branch=lambda target_repo, agent_type: ("/tmp/fake-workdir", "agent/swe-abc123"),
        run_coding_agent=_async_noop,
        append_message=lambda *a, **k: None,
        finish_run=lambda *a, **k: None,
        rmtree=lambda *a, **k: None,
    )
    defaults.update(overrides)
    return defaults


async def _async_noop(*_args, **_kwargs):
    return None


def _run(ticket_id="ticket_1", run_id="run_1", agent_type="swe", title="Add health endpoint", body="body"):
    return asyncio.run(agents.execute_ticket(ticket_id, run_id, agent_type, title, body))


def test_execute_ticket_no_changes_finishes_done_without_pr_or_diff():
    patches = _patch_common(
        commit_push_pr=lambda *a, **k: (_ for _ in ()).throw(NoChangesError("no changes to commit")),
    )
    finish_calls = []
    patches["finish_run"] = lambda run_id, **kw: finish_calls.append((run_id, kw))
    messages = []
    patches["append_message"] = lambda ticket_id, role, content: messages.append((role, content))

    with (
        patch.object(agents, "clone_and_branch", patches["clone_and_branch"]),
        patch.object(agents, "run_coding_agent", patches["run_coding_agent"]),
        patch.object(agents, "commit_push_pr", patches["commit_push_pr"]),
        patch.object(agents.convex_client, "append_message", patches["append_message"]),
        patch.object(agents.convex_client, "finish_run", patches["finish_run"]),
        patch.object(agents.shutil, "rmtree", patches["rmtree"]),
    ):
        _run()

    assert len(finish_calls) == 1
    run_id, kwargs = finish_calls[0]
    assert run_id == "run_1"
    # Neither prUrl nor diff should be set for the "no changes" outcome.
    assert kwargs.get("pr_url") is None
    assert kwargs.get("diff") is None
    assert any("no changes" in content for _role, content in messages)
    # Must NOT be mislabeled as a PR failure.
    assert not any("PR failed" in content for _role, content in messages)


def test_execute_ticket_pr_failure_falls_back_to_diff():
    patches = _patch_common(
        commit_push_pr=lambda *a, **k: (_ for _ in ()).throw(RepoError("push rejected")),
    )
    finish_calls = []
    patches["finish_run"] = lambda run_id, **kw: finish_calls.append((run_id, kw))

    with (
        patch.object(agents, "clone_and_branch", patches["clone_and_branch"]),
        patch.object(agents, "run_coding_agent", patches["run_coding_agent"]),
        patch.object(agents, "commit_push_pr", patches["commit_push_pr"]),
        patch.object(agents, "diff_fallback", lambda workdir: "diff --git a/x b/x"),
        patch.object(agents.convex_client, "append_message", patches["append_message"]),
        patch.object(agents.convex_client, "finish_run", patches["finish_run"]),
        patch.object(agents.shutil, "rmtree", patches["rmtree"]),
    ):
        _run()

    assert len(finish_calls) == 1
    _run_id, kwargs = finish_calls[0]
    assert kwargs.get("diff") == "diff --git a/x b/x"
    assert kwargs.get("pr_url") is None


def test_execute_ticket_swallows_finish_run_exception():
    """A raising finish_run (e.g. Convex outage) must not propagate out of
    execute_ticket, or the background job would die mid-run and the caller
    would never know the run finished."""
    patches = _patch_common(
        commit_push_pr=lambda *a, **k: "https://github.com/me/repo/pull/1",
    )

    def _boom(*_a, **_k):
        raise RuntimeError("convex is down")

    with (
        patch.object(agents, "clone_and_branch", patches["clone_and_branch"]),
        patch.object(agents, "run_coding_agent", patches["run_coding_agent"]),
        patch.object(agents, "commit_push_pr", patches["commit_push_pr"]),
        patch.object(agents.convex_client, "append_message", patches["append_message"]),
        patch.object(agents.convex_client, "finish_run", _boom),
        patch.object(agents.shutil, "rmtree", patches["rmtree"]),
    ):
        _run()  # must not raise


def test_execute_ticket_outer_error_preserves_diff_and_removes_workdir():
    """When the coding agent itself blows up, the outer except path should
    still capture whatever partial diff exists, rather than discarding the
    agent's work by storing only the exception string."""

    async def _boom(*_a, **_k):
        raise RuntimeError("agent crashed")

    finish_calls = []
    rmtree_calls = []

    with (
        patch.object(agents, "clone_and_branch", lambda *_a, **_k: ("/tmp/fake-workdir", "agent/swe-x")),
        patch.object(agents, "run_coding_agent", _boom),
        patch.object(agents, "diff_fallback", lambda workdir: "diff --git a/partial b/partial"),
        patch.object(agents.convex_client, "append_message", lambda *a, **k: None),
        patch.object(agents.convex_client, "finish_run", lambda run_id, **kw: finish_calls.append((run_id, kw))),
        patch.object(agents.shutil, "rmtree", lambda path, **kw: rmtree_calls.append(path)),
    ):
        _run()

    assert len(finish_calls) == 1
    _run_id, kwargs = finish_calls[0]
    assert kwargs.get("diff") == "diff --git a/partial b/partial"
    assert rmtree_calls == ["/tmp/fake-workdir"]


def test_execute_ticket_outer_error_falls_back_to_error_string_if_diff_fails():
    async def _boom(*_a, **_k):
        raise RuntimeError("agent crashed")

    def _diff_boom(_workdir):
        raise RuntimeError("git diff failed too")

    finish_calls = []

    with (
        patch.object(agents, "clone_and_branch", lambda *_a, **_k: ("/tmp/fake-workdir", "agent/swe-x")),
        patch.object(agents, "run_coding_agent", _boom),
        patch.object(agents, "diff_fallback", _diff_boom),
        patch.object(agents.convex_client, "append_message", lambda *a, **k: None),
        patch.object(agents.convex_client, "finish_run", lambda run_id, **kw: finish_calls.append((run_id, kw))),
        patch.object(agents.shutil, "rmtree", lambda *a, **k: None),
    ):
        _run()

    assert len(finish_calls) == 1
    _run_id, kwargs = finish_calls[0]
    assert "agent error: agent crashed" in kwargs.get("diff", "")
