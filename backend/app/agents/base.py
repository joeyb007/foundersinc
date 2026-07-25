import json
import os
import re
from pathlib import Path
from typing import Callable

import anthropic
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    query,
)

from app.agents.configs import SUBAGENTS

_client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

# One knob for both the coding agents and the PM decompose call. Haiku is the
# default because a single fan-out spends four concurrent agent runs, and
# rehearsing the demo on Opus gets expensive fast. Override with AGENT_MODEL
# (e.g. claude-opus-4-8) for the real run.
MODEL = os.environ.get("AGENT_MODEL", "claude-haiku-4-5")

# Real coding-agent runs can take minutes; cap turns so a single ticket can't
# run away with the process (also bounds cost/blast-radius alongside the
# per-run isolated git checkout + bypassPermissions).
#
# 30 was too tight for Haiku, which takes more turns than Opus to reach the
# same place and was hitting the ceiling mid-build on every ticket. Running
# out is no longer fatal — the caller commits whatever exists — but a run that
# ends mid-edit still makes for a worse PR.
MAX_TURNS = int(os.environ.get("AGENT_MAX_TURNS", "100"))

OnLog = Callable[[str], None]


async def run_coding_agent(cwd: str, persona: str, ticket_text: str, on_log: OnLog) -> ResultMessage | None:
    """Drive a real Claude Agent SDK coding agent against an existing repo checkout.

    Streams a human-readable log line for each assistant text block / tool call
    via `on_log`, and returns the final `ResultMessage` (or `None` if the agent
    never produced one).
    """
    options = ClaudeAgentOptions(
        cwd=cwd,
        model=MODEL,
        system_prompt=persona,
        permission_mode="bypassPermissions",
        allowed_tools=["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
        max_turns=MAX_TURNS,
        setting_sources=[],
        agents=SUBAGENTS,
    )

    result: ResultMessage | None = None

    async for message in query(prompt=ticket_text, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    on_log(block.text.strip())
                elif isinstance(block, ToolUseBlock):
                    on_log(f"tool: {block.name}({_summarize_input(block.input, cwd)})")
        elif isinstance(message, UserMessage):
            # Tool RESULTS come back on the user turn. Logging only the
            # requests hid an entire failure class: an agent whose every Write
            # errored looked identical, in the feed, to one that succeeded —
            # right up until "agent made no changes".
            for block in message.content if isinstance(message.content, list) else []:
                if isinstance(block, ToolResultBlock) and block.is_error:
                    on_log(f"tool error: {_summarize_result(block.content)}")
        elif isinstance(message, ResultMessage):
            result = message
            on_log(f"result ({message.subtype}): {message.result}")

    return result


def _summarize_result(content: object) -> str:
    if isinstance(content, str):
        return content[:200]
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content if isinstance(b, dict)]
        return " ".join(p for p in parts if p)[:200]
    return str(content)[:200]


def _relativize(value: object, cwd: str) -> object:
    """Trim the throwaway-checkout prefix off a path.

    Every run happens in a fresh temp clone, so raw tool args carry a path like
    `/var/folders/.../agent-ui-1a2b3c4d/src/app.tsx`. The board renders these
    log lines verbatim and derives its "files touched" column from them, so the
    repo-relative path is the useful part.
    """
    if not isinstance(value, str):
        return value
    try:
        # Both sides are resolved because macOS hands out temp dirs as
        # /var/folders/... while the agent's tools report the symlink-resolved
        # /private/var/folders/... — comparing them raw never matches.
        return str(Path(value).resolve().relative_to(Path(cwd).resolve()))
    except ValueError:
        # Outside the checkout (or already relative) — leave it alone.
        return value


def _summarize_input(tool_input: dict, cwd: str) -> str:
    # Keep tool-call log lines short; full args aren't needed for the live feed.
    parts = []
    for key in ("file_path", "path", "command", "pattern"):
        if key in tool_input:
            value = _relativize(tool_input[key], cwd) if key in ("file_path", "path") else tool_input[key]
            parts.append(f"{key}={value!r}")
    return ", ".join(parts) if parts else str(tool_input)[:120]


_DECOMPOSE_SYSTEM = (
    "You are a PM agent. Decompose the epic into 3-4 small tickets, each a "
    "self-contained unit of work, and route each one to the specialist best "
    "suited to it."
)

_VALID_AGENT_TYPES = {
    "ui",
    "ux",
    "swe",
    "mobile",
    "devops",
    "qa",
    "security",
    "ml",
    "ds",
    "dataeng",
    "pm",
    "docs",
}

# Structured outputs, rather than asking for JSON in the prompt and hoping.
# "Return ONLY JSON. No prose." is a request, not a guarantee — smaller/faster
# models routinely wrap the object in a ```json fence, which a bare
# json.loads() then dies on. The schema makes the shape an API-level
# constraint, and pins agentType to the enum so an invented role can't reach
# Convex's validator.
_DECOMPOSE_SCHEMA = {
    "type": "object",
    "properties": {
        "tickets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                    "agentType": {"type": "string", "enum": sorted(_VALID_AGENT_TYPES)},
                },
                "required": ["title", "body", "agentType"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["tickets"],
    "additionalProperties": False,
}


def _loads_tolerant(text: str) -> dict:
    """Parse the model's JSON, surviving a markdown fence.

    Structured outputs should make this unnecessary — but AGENT_MODEL can point
    at a model that doesn't support them, and the failure mode we hit in
    production was exactly a fenced object. Cheap insurance.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def decompose_epic(title: str, body: str) -> list[dict]:
    """Plain Anthropic Messages call (NOT the Agent SDK) — JSON classification."""
    resp = _client.messages.create(
        model=MODEL,
        max_tokens=1200,
        system=_DECOMPOSE_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": _DECOMPOSE_SCHEMA}},
        messages=[{"role": "user", "content": f"Epic: {title}\n\n{body}"}],
    )
    text = next((b.text for b in resp.content if b.type == "text"), "{}")
    tickets = _loads_tolerant(text)["tickets"]
    return [t for t in tickets if t.get("agentType") in _VALID_AGENT_TYPES][:4]
