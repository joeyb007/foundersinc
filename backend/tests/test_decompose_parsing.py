import json

import pytest

from app.agents.base import _DECOMPOSE_SCHEMA, _VALID_AGENT_TYPES, _loads_tolerant

PAYLOAD = {"tickets": [{"title": "t", "body": "b", "agentType": "ui"}]}


def test_parses_bare_json():
    assert _loads_tolerant(json.dumps(PAYLOAD)) == PAYLOAD


def test_parses_json_wrapped_in_a_markdown_fence():
    """Regression: this is what took decomposition down in production. The
    prompt said "Return ONLY JSON. No prose." and the model fenced it anyway,
    so a bare json.loads() raised and every epic silently got the canned
    fallback ticket set."""
    fenced = f"```json\n{json.dumps(PAYLOAD)}\n```"
    assert _loads_tolerant(fenced) == PAYLOAD


def test_parses_a_fence_with_no_language_tag():
    assert _loads_tolerant(f"```\n{json.dumps(PAYLOAD)}\n```") == PAYLOAD


def test_still_raises_on_genuine_garbage():
    """Prose with no JSON must fail loudly, not silently return an empty set —
    the caller degrades to the fallback set and that decision should be a real
    error, not a parse that quietly succeeded."""
    with pytest.raises(json.JSONDecodeError):
        _loads_tolerant("I'm afraid I can't do that.")


def test_schema_pins_agent_type_to_the_fixed_roster():
    """A hallucinated role would pass FastAPI and then throw inside Convex's
    arg validator, mid-loop, after some tickets had already been inserted."""
    item = _DECOMPOSE_SCHEMA["properties"]["tickets"]["items"]
    assert set(item["properties"]["agentType"]["enum"]) == _VALID_AGENT_TYPES
    assert item["additionalProperties"] is False
    assert set(item["required"]) == {"title", "body", "agentType"}
