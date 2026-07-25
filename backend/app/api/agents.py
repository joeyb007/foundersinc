import asyncio
import logging
import os
import shutil

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app import convex_client
from app.agents.base import decompose_epic, run_coding_agent
from app.agents.configs import AGENT_CONFIGS
from app.agents.repo import NoChangesError, RepoError, clone_and_branch, commit_push_pr, diff_fallback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents")


def _safe_append_message(ticket_id: str, role: str, content: str) -> None:
    """Best-effort log line to Convex; a Convex outage must not kill the run."""
    try:
        convex_client.append_message(ticket_id, role, content)
    except Exception:  # noqa: BLE001 - callback failures are logged, never raised
        logger.exception("append_message failed for ticket_id=%s", ticket_id)


def _safe_finish_run(run_id: str, pr_url: str | None = None, diff: str | None = None) -> None:
    """Best-effort run finalization; a Convex outage must not hang the job."""
    try:
        convex_client.finish_run(run_id, pr_url=pr_url, diff=diff)
    except Exception:  # noqa: BLE001 - callback failures are logged, never raised
        logger.exception("finish_run failed for run_id=%s", run_id)


def _best_effort_diff(workdir: str | None) -> str | None:
    if workdir is None:
        return None
    try:
        return diff_fallback(workdir)
    except Exception:  # noqa: BLE001 - best-effort only
        logger.exception("diff_fallback failed for workdir=%s", workdir)
        return None


class RunRequest(BaseModel):
    ticketId: str
    runId: str
    agentType: str
    title: str
    body: str


class RunAccepted(BaseModel):
    accepted: bool = True


class DecomposeRequest(BaseModel):
    title: str
    body: str


class Ticket(BaseModel):
    title: str
    body: str
    agentType: str


class DecomposeResult(BaseModel):
    tickets: list[Ticket]


async def execute_ticket(ticket_id: str, run_id: str, agent_type: str, title: str, body: str) -> None:
    """Background job: clone+branch -> run the coding agent -> commit/push/PR ->
    finalize the run in Convex.

    Structured so `finish_run` is attempted exactly once, in a `finally`, no
    matter which branch is taken above it — including when a Convex callback
    itself raises (that failure is logged, never propagated, so the
    background job can't die before the run is finalized). The temp checkout
    is removed in the same `finally`, after any best-effort diff capture.
    """
    workdir: str | None = None
    finish_kwargs: dict[str, str | None] = {}
    try:
        persona = AGENT_CONFIGS[agent_type]
        target_repo = os.environ["TARGET_REPO"]

        workdir, branch = clone_and_branch(target_repo, agent_type)

        def on_log(line: str) -> None:
            _safe_append_message(ticket_id, "agent", line)

        ticket_text = f"Ticket: {title}\n\n{body}\n\nMake the change in this repo."
        await run_coding_agent(workdir, persona, ticket_text, on_log)

        try:
            pr_url = commit_push_pr(workdir, branch, f"[{agent_type}] {title}")
            _safe_append_message(ticket_id, "system", f"opened PR: {pr_url}")
            finish_kwargs = {"pr_url": pr_url}
        except NoChangesError:
            _safe_append_message(ticket_id, "system", "agent made no changes")
            finish_kwargs = {}
        except RepoError as e:
            diff = diff_fallback(workdir)
            _safe_append_message(ticket_id, "system", f"PR failed ({e}); returning diff")
            finish_kwargs = {"diff": diff}
    except Exception as e:  # noqa: BLE001 - last-resort guard so the run never hangs
        diff = _best_effort_diff(workdir)
        _safe_append_message(ticket_id, "system", f"agent run failed: {e}")
        finish_kwargs = {"diff": diff if diff is not None else f"agent error: {e}"}
    finally:
        if workdir is not None:
            shutil.rmtree(workdir, ignore_errors=True)
        _safe_finish_run(run_id, **finish_kwargs)


def _run_execute_ticket(ticket_id: str, run_id: str, agent_type: str, title: str, body: str) -> None:
    """Sync entry point for BackgroundTasks: drives the async job to completion."""
    asyncio.run(execute_ticket(ticket_id, run_id, agent_type, title, body))


@router.post("/run", response_model=RunAccepted, status_code=202)
def run(req: RunRequest, background_tasks: BackgroundTasks) -> RunAccepted:
    background_tasks.add_task(
        _run_execute_ticket, req.ticketId, req.runId, req.agentType, req.title, req.body
    )
    return RunAccepted()


@router.post("/decompose", response_model=DecomposeResult)
def decompose(req: DecomposeRequest) -> DecomposeResult:
    return DecomposeResult(tickets=[Ticket(**t) for t in decompose_epic(req.title, req.body)])
