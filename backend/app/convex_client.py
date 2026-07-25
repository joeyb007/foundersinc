import os
import threading

from convex import ConvexClient

_client: ConvexClient | None = None
_client_lock = threading.Lock()


def _get_client() -> ConvexClient:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = ConvexClient(os.environ["CONVEX_URL"])
    return _client


def _secret() -> str:
    return os.environ["CALLBACK_SECRET"]


def append_message(ticket_id: str, role: str, content: str) -> None:
    """Stream a log/progress line back into Convex's `messages` table.

    Calls the public, secret-guarded `messages:appendPublic` mutation (the
    Python client can only call public functions).
    """
    _get_client().mutation(
        "messages:appendPublic",
        {"secret": _secret(), "ticketId": ticket_id, "role": role, "content": content},
    )


def finish_run(run_id: str, pr_url: str | None = None, diff: str | None = None) -> None:
    """Finalize a run with either a PR URL or a diff fallback.

    Calls the public, secret-guarded `runs:finishPublic` mutation.
    """
    args: dict = {"secret": _secret(), "runId": run_id}
    if pr_url is not None:
        args["prUrl"] = pr_url
    if diff is not None:
        args["diff"] = diff
    _get_client().mutation("runs:finishPublic", args)
