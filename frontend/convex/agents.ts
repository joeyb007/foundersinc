import { internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { groupIntoWaves } from "./graph";
import type { Doc, Id } from "./_generated/dataModel";

/** Create (once) the throwaway GitHub repo this epic's agents all work in.
 *
 * Idempotent on `epic.repoUrl`, which is what lets two different callers race
 * safely: the board's "open" button creates it eagerly so the link is there on
 * arrival, and the workflow asks again before fanning out in case that never
 * happened. Whoever gets there first wins; the other reads the stored URL.
 *
 * A plain helper rather than an action calling an action — both callers are in
 * the same runtime, so there is no reason to pay for a second action hop.
 */
export async function ensureRepoFor(
  ctx: ActionCtx,
  epicId: Id<"epics">,
): Promise<string | null> {
  const epic = await ctx.runQuery(api.epics.get, { epicId });
  if (!epic) return null;
  if (epic.repoUrl) return epic.repoUrl;

  try {
    const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/repos/ensure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: epic.title }),
    });
    if (!res.ok) return null;

    const { repoUrl } = (await res.json()) as { repoUrl?: unknown };
    if (typeof repoUrl !== "string" || repoUrl.length === 0) return null;

    await ctx.runMutation(internal.epics.setRepoUrl, { epicId, repoUrl });
    return repoUrl;
  } catch {
    // Returning null rather than throwing keeps the workflow from retrying a
    // misconfigured credential forever; the caller reports it instead.
    return null;
  }
}

// The workflow's pre-fan-out step. If each parallel agent created its own repo,
// four tickets would land as four PRs across four unrelated repos instead of
// one reviewable set.
export const ensureRepo = internalAction({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }): Promise<string | null> => ensureRepoFor(ctx, epicId),
});

// Fire-and-forget dispatch. A real coding agent (Claude Agent SDK, driving
// an isolated git checkout) runs for minutes on the FastAPI side — far
// longer than a Convex action should stay alive for. So dispatch only kicks
// the run off: it creates the run row, flips the ticket to running, logs the
// dispatch, and POSTs to the agent service without awaiting completion. The
// agent service streams progress and the final PR/diff back in via the
// public, secret-guarded callbacks (messages.appendPublic /
// runs.finishPublic), which is what actually drives the live board.
async function dispatchOne(
  ctx: ActionCtx,
  ticketId: Id<"tickets">,
  agentTypeValue: Doc<"tickets">["agentType"],
  repoUrl: string,
): Promise<void> {
  const ticket = await ctx.runQuery(internal.tickets.get, { ticketId });
  if (!ticket) return;

  const runId = await ctx.runMutation(internal.runs.create, {
    ticketId,
    agentType: agentTypeValue,
  });
  await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "running" });
  await ctx.runMutation(internal.messages.append, {
    ticketId,
    role: "system",
    content: `dispatched to ${agentTypeValue}-agent`,
  });

  try {
    const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        runId,
        agentType: agentTypeValue,
        title: ticket.title,
        body: ticket.body,
        repoUrl,
      }),
    });
    if (!res.ok) throw new Error(`agent service ${res.status}`);
    // Do NOT await agent completion — the service returns 202 immediately
    // and finishes the run itself via the callback mutations.
  } catch (e) {
    // Dispatch itself failed (service unreachable, non-2xx, etc). Don't
    // leave the board stuck on a run that never started — finalize here,
    // through the same advance check a real completion goes through, so a
    // dead agent service can't stall the waves behind it.
    await ctx.runMutation(internal.messages.append, {
      ticketId,
      role: "system",
      content: `dispatch failed: ${String(e)}`,
    });
    await ctx.runMutation(internal.runs.finish, { runId, diff: "dispatch error" });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
    await ctx.runMutation(internal.runs.maybeAdvance, { epicId: ticket.epicId });
  }
}

// The wave scheduler. Dispatch is fire-and-forget, so nothing here can await
// agent completion — instead each completion callback (runs.finishPublic, or
// the dispatch-failure path above) re-invokes this once its epic has no
// running tickets left. Each invocation dispatches exactly the next tier of
// the org chart (graph.ts) and returns; the loop lives in the callbacks.
export const dispatchNextWave = internalAction({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.runQuery(api.tickets.listByEpic, { epicId });

    // Guard, not scheduler state: if anything is still running this is a
    // duplicate wake-up, and the real completion will come back around.
    if (tickets.some((t) => t.status === "running")) return;

    const approved = tickets.filter((t) => t.status === "approved");
    if (approved.length === 0) return;

    const repoUrl = await ensureRepoFor(ctx, epicId);
    if (!repoUrl) {
      await Promise.all(
        approved.map((t) =>
          ctx.runMutation(internal.messages.append, {
            ticketId: t._id,
            role: "system",
            content: "could not create the epic's repo — run not started",
          }),
        ),
      );
      return;
    }

    const wave = groupIntoWaves(approved)[0];
    await Promise.all(wave.map((t) => dispatchOne(ctx, t._id, t.agentType, repoUrl)));
  },
});
