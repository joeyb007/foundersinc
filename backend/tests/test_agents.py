import asyncio
import json
from unittest.mock import MagicMock, patch

from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock, ToolUseBlock

from app.agents import base


def _fake_query(*_args, **_kwargs):
    async def gen():
        yield AssistantMessage(
            content=[TextBlock(text="starting work on the ticket")],
            model="claude-opus-4-8",
        )
        yield AssistantMessage(
            content=[ToolUseBlock(id="1", name="Edit", input={"file_path": "app.py"})],
            model="claude-opus-4-8",
        )
        yield ResultMessage(
            subtype="success",
            duration_ms=100,
            duration_api_ms=80,
            is_error=False,
            num_turns=2,
            session_id="sess-1",
            result="done",
        )

    return gen()


def test_run_coding_agent_streams_logs_and_returns_result():
    logs: list[str] = []

    with patch.object(base, "query", side_effect=_fake_query):
        result = asyncio.run(
            base.run_coding_agent("/tmp/fake-repo", "You are a SWE agent.", "Add a health endpoint", logs.append)
        )

    assert any("starting work on the ticket" in line for line in logs)
    assert any("tool: Edit" in line for line in logs)
    assert any("result (success)" in line for line in logs)
    assert result is not None
    assert result.subtype == "success"
    assert result.result == "done"


def test_decompose_epic_filters_invalid_agent_types_and_caps_at_four():
    fake_msg = MagicMock()
    fake_msg.content = [
        MagicMock(
            type="text",
            text=json.dumps(
                {
                    "tickets": [
                        {"title": "t1", "body": "b1", "agentType": "ui"},
                        {"title": "t2", "body": "b2", "agentType": "not-a-real-role"},
                        {"title": "t3", "body": "b3", "agentType": "swe"},
                        {"title": "t4", "body": "b4", "agentType": "docs"},
                        {"title": "t5", "body": "b5", "agentType": "qa"},
                        {"title": "t6", "body": "b6", "agentType": "ml"},
                    ]
                }
            ),
        )
    ]
    with patch.object(base._client.messages, "create", return_value=fake_msg):
        tickets = base.decompose_epic("Ship MVP", "dashboard + api")

    assert len(tickets) == 4
    assert all(t["agentType"] != "not-a-real-role" for t in tickets)
