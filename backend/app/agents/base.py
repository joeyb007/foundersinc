import json
from typing import Callable

import anthropic
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

from app.agents.configs import SUBAGENTS

_client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

# Real coding-agent runs can take minutes; cap turns so a single ticket can't
# run away with the process (also bounds cost/blast-radius alongside the
# per-run isolated git checkout + bypassPermissions).
MAX_TURNS = 30

OnLog = Callable[[str], None]


async def run_coding_agent(cwd: str, persona: str, ticket_text: str, on_log: OnLog) -> ResultMessage | None:
    """Drive a real Claude Agent SDK coding agent against an existing repo checkout.

    Streams a human-readable log line for each assistant text block / tool call
    via `on_log`, and returns the final `ResultMessage` (or `None` if the agent
    never produced one).
    """
    options = ClaudeAgentOptions(
        cwd=cwd,
        model="claude-opus-4-8",
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
                    on_log(f"tool: {block.name}({_summarize_input(block.input)})")
        elif isinstance(message, ResultMessage):
            result = message
            on_log(f"result ({message.subtype}): {message.result}")

    return result


def _summarize_input(tool_input: dict) -> str:
    # Keep tool-call log lines short; full args aren't needed for the live feed.
    parts = []
    for key in ("file_path", "path", "command", "pattern"):
        if key in tool_input:
            parts.append(f"{key}={tool_input[key]!r}")
    return ", ".join(parts) if parts else str(tool_input)[:120]


_DECOMPOSE_SYSTEM = (
    "You are a PM agent. Decompose the epic into 3-4 small tickets. "
    'Return ONLY JSON: {"tickets":[{"title":str,"body":str,'
    '"agentType":"ui"|"ux"|"swe"|"mobile"|"devops"|"qa"|"security"|"ml"|"ds"|'
    '"dataeng"|"pm"|"docs"}]}. No prose.'
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


def decompose_epic(title: str, body: str) -> list[dict]:
    """Plain Anthropic Messages call (NOT the Agent SDK) — JSON classification."""
    resp = _client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1200,
        system=_DECOMPOSE_SYSTEM,
        messages=[{"role": "user", "content": f"Epic: {title}\n\n{body}"}],
    )
    text = next((b.text for b in resp.content if b.type == "text"), "{}")
    tickets = json.loads(text)["tickets"]
    return [t for t in tickets if t.get("agentType") in _VALID_AGENT_TYPES][:4]
