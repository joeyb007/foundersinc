import asyncio
import logging
import shutil
import subprocess

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app import convex_client
from app.agents.base import decompose_epic, run_coding_agent
from app.agents.configs import AGENT_CONFIGS
from app.agents.repo import (
    NoChangesError,
    RepoError,
    clone_and_branch,
    commit_push_pr,
    diff_fallback,
    ensure_repo,
    redact,
)

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
    repoUrl: str


class RunAccepted(BaseModel):
    accepted: bool = True


class EnsureRepoRequest(BaseModel):
    title: str


class EnsureRepoResult(BaseModel):
    repoUrl: str


class DecomposeRequest(BaseModel):
    title: str
    body: str


class Ticket(BaseModel):
    title: str
    body: str
    agentType: str


class DecomposeResult(BaseModel):
    tickets: list[Ticket]


async def execute_ticket(
    ticket_id: str, run_id: str, agent_type: str, title: str, body: str, repo_url: str
) -> None:
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
        workdir, branch = clone_and_branch(repo_url, agent_type)

        def on_log(line: str) -> None:
            _safe_append_message(ticket_id, "agent", line)

        # Two observed failure modes shape this prompt. Smaller models write to
        # "/package.json" — treating filesystem root as repo root — which now
        # fails with EACCES (and as root silently landed outside the checkout).
        # And later-wave agents see a near-empty repo, because earlier waves'
        # work lives on unmerged PR branches, and conclude there's nothing to
        # do. Both are told exactly what's going on instead.
        ticket_text = (
            f"Ticket: {title}\n\n{body}\n\n"
            f"Work inside the repo checkout at {workdir} (your current working "
            "directory). Create and edit files at paths under that directory — "
            "never at filesystem root like /package.json.\n"
            "Teammates' work on other tickets exists as unmerged PR branches, so "
            "this checkout may look sparse. That is expected: implement this "
            "ticket from its description, and always leave concrete file changes "
            "behind rather than concluding there is nothing to do."
        )

        # An agent that stops early — max turns, a model error — has usually
        # still written real files. Catching here rather than letting it unwind
        # to the outer handler means that work goes through the commit step
        # instead of being deleted with the checkout. "A PR appeared" is the
        # deliverable (docs/ctd.md); a partial PR beats no PR.
        try:
            await run_coding_agent(workdir, persona, ticket_text, on_log)
        except Exception as e:  # noqa: BLE001 - keep whatever it managed to write
            _safe_append_message(
                ticket_id, "system", f"agent stopped early ({redact(str(e))}); committing what exists"
            )

        # Ground truth between "agent finished" and "commit": how much actually
        # landed in the checkout. Debugging "agent made no changes" without this
        # meant guessing whether writes failed, went elsewhere, or never ran.
        # Best-effort — diagnostics must never take down the run they describe.
        try:
            status = subprocess.run(
                ["git", "status", "--porcelain"], cwd=workdir, capture_output=True, text=True
            )
            changed = len([line for line in status.stdout.splitlines() if line.strip()])
            _safe_append_message(
                ticket_id, "system", f"workdir has {changed} changed path(s) to commit"
            )
        except OSError:
            logger.exception("workdir census failed for ticket_id=%s", ticket_id)

        try:
            pr_url = commit_push_pr(workdir, branch, f"[{agent_type}] {title}")
            _safe_append_message(ticket_id, "system", f"opened PR: {pr_url}")
            finish_kwargs = {"pr_url": pr_url}
        except NoChangesError:
            _safe_append_message(ticket_id, "system", "agent made no changes")
            finish_kwargs = {}
        except RepoError as e:
            diff = diff_fallback(workdir)
            _safe_append_message(ticket_id, "system", f"PR failed ({redact(str(e))}); returning diff")
            finish_kwargs = {"diff": diff}
    except Exception as e:  # noqa: BLE001 - last-resort guard so the run never hangs
        # Every string here is headed for the run log and the board, so redact
        # again at the boundary: an exception from outside `repo._run` (an
        # httpx error, say) hasn't been through the scrubber yet.
        message = redact(str(e))
        diff = _best_effort_diff(workdir)
        _safe_append_message(ticket_id, "system", f"agent run failed: {message}")
        finish_kwargs = {"diff": diff if diff is not None else f"agent error: {message}"}
    finally:
        if workdir is not None:
            shutil.rmtree(workdir, ignore_errors=True)
        _safe_finish_run(run_id, **finish_kwargs)


def _run_execute_ticket(
    ticket_id: str, run_id: str, agent_type: str, title: str, body: str, repo_url: str
) -> None:
    """Sync entry point for BackgroundTasks: drives the async job to completion."""
    asyncio.run(execute_ticket(ticket_id, run_id, agent_type, title, body, repo_url))


@router.post("/run", response_model=RunAccepted, status_code=202)
def run(req: RunRequest, background_tasks: BackgroundTasks) -> RunAccepted:
    background_tasks.add_task(
        _run_execute_ticket,
        req.ticketId,
        req.runId,
        req.agentType,
        req.title,
        req.body,
        req.repoUrl,
    )
    return RunAccepted()


@router.post("/repos/ensure", response_model=EnsureRepoResult)
def repos_ensure(req: EnsureRepoRequest) -> EnsureRepoResult:
    """Create the throwaway repo an epic's agents will share.

    Runs as its own workflow step *before* the fan-out, so the parallel agents
    can't race each other into creating one repo apiece. Synchronous on
    purpose: the fan-out has nothing to clone until this returns.
    """
    try:
        return EnsureRepoResult(repoUrl=ensure_repo(req.title))
    except RepoError as e:
        raise HTTPException(status_code=502, detail=redact(str(e))) from e
    except KeyError as e:  # GITHUB_TOKEN unset
        raise HTTPException(status_code=500, detail=f"missing env var: {e}") from e


@router.post("/decompose", response_model=DecomposeResult)
def decompose(req: DecomposeRequest) -> DecomposeResult:
    return DecomposeResult(tickets=[Ticket(**t) for t in decompose_epic(req.title, req.body)])
