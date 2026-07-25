"""Load `backend/.env` into the process environment before anything reads it.

Several modules resolve credentials from `os.environ` at *import* time — the
Anthropic client in `app.agents.base`, the Convex client in `app.convex_client`,
`TARGET_REPO` in `app.api.agents`. pydantic-settings reads `.env` for its own
`Settings` object but does not export those values to `os.environ`, so without
this the app only works when the shell happens to have them exported.

Importing any `app.*` submodule runs this first, which is the guarantee we need.
The path is resolved from this file rather than the cwd so it doesn't matter
which directory uvicorn was started from.
"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
