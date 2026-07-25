import asyncio
from unittest.mock import patch

from app.api import agents


def _run():
    return asyncio.run(
        agents.execute_ticket("t1", "r1", "swe", "Add a calculator", "body", "https://x/y.git")
    )


async def _agent_hits_max_turns(*_a, **_k):
    raise RuntimeError("Claude Code returned an error result: Reached maximum number of turns (30)")


def test_an_agent_that_runs_out_of_turns_still_opens_a_pr():
    """Regression: hitting max turns unwound straight to the outer handler, so
    commit_push_pr never ran and every file the agent had written was deleted
    with the checkout. Three real runs finished with no PR that way."""
    finish_calls = []
    messages = []

    with (
        patch.object(agents, "clone_and_branch", lambda *_a: ("/tmp/wd", "agent/swe-x")),
        patch.object(agents, "run_coding_agent", _agent_hits_max_turns),
        patch.object(agents, "commit_push_pr", lambda *_a: "https://github.com/o/r/pull/7"),
        patch.object(agents.convex_client, "append_message",
                     lambda tid, role, content: messages.append((role, content))),
        patch.object(agents.convex_client, "finish_run",
                     lambda run_id, **kw: finish_calls.append(kw)),
        patch.object(agents.shutil, "rmtree", lambda *_a, **_k: None),
    ):
        _run()

    assert len(finish_calls) == 1
    assert finish_calls[0].get("pr_url") == "https://github.com/o/r/pull/7"
    assert any("stopped early" in c for _r, c in messages)
    # The old failure signature must not come back.
    assert not any("agent run failed" in c for _r, c in messages)


def test_an_early_stop_with_nothing_written_is_still_reported_cleanly():
    finish_calls = []
    messages = []

    def _no_changes(*_a):
        raise agents.NoChangesError("no changes to commit")

    with (
        patch.object(agents, "clone_and_branch", lambda *_a: ("/tmp/wd", "agent/swe-x")),
        patch.object(agents, "run_coding_agent", _agent_hits_max_turns),
        patch.object(agents, "commit_push_pr", _no_changes),
        patch.object(agents.convex_client, "append_message",
                     lambda tid, role, content: messages.append((role, content))),
        patch.object(agents.convex_client, "finish_run",
                     lambda run_id, **kw: finish_calls.append(kw)),
        patch.object(agents.shutil, "rmtree", lambda *_a, **_k: None),
    ):
        _run()

    assert len(finish_calls) == 1
    assert finish_calls[0].get("pr_url") is None
    assert finish_calls[0].get("diff") is None
    assert any("no changes" in c for _r, c in messages)


def test_a_clone_failure_still_short_circuits():
    """Only the agent step is forgiving. With no checkout there is nothing to
    commit, so that must still take the outer path and finalize the run."""
    finish_calls = []

    def _boom(*_a):
        raise RuntimeError("clone failed")

    with (
        patch.object(agents, "clone_and_branch", _boom),
        patch.object(agents.convex_client, "append_message", lambda *_a, **_k: None),
        patch.object(agents.convex_client, "finish_run",
                     lambda run_id, **kw: finish_calls.append(kw)),
        patch.object(agents.shutil, "rmtree", lambda *_a, **_k: None),
    ):
        _run()

    assert len(finish_calls) == 1
    assert "clone failed" in (finish_calls[0].get("diff") or "")
