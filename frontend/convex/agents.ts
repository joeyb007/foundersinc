import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { agentType } from "./validators";

// Fire-and-forget dispatch. A real coding agent (Claude Agent SDK, driving
// an isolated git checkout) runs for minutes on the FastAPI side — far
// longer than this Convex action/workflow step should stay alive for. So
// runOne only kicks the run off: it creates the run row, flips the ticket to
// running, logs the dispatch, and POSTs to the agent service without
// awaiting completion. The agent service streams progress and the final
// PR/diff back in via the public, secret-guarded callbacks
// (messages.appendPublic / runs.finishPublic), which is what actually
// drives the live board.
export const runOne = internalAction({
  args: { ticketId: v.id("tickets"), agentType },
  handler: async (ctx, { ticketId, agentType }) => {
    const ticket = await ctx.runQuery(internal.tickets.get, { ticketId });
    if (!ticket) return;

    const runId = await ctx.runMutation(internal.runs.create, { ticketId, agentType });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "running" });
    await ctx.runMutation(internal.messages.append, {
      ticketId,
      role: "system",
      content: `dispatched to ${agentType}-agent`,
    });

    try {
      const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          runId,
          agentType,
          title: ticket.title,
          body: ticket.body,
        }),
      });
      if (!res.ok) throw new Error(`agent service ${res.status}`);
      // Do NOT await agent completion — the service returns 202 immediately
      // and finishes the run itself via the callback mutations.
    } catch (e) {
      // Dispatch itself failed (service unreachable, non-2xx, etc). Don't
      // leave the board stuck on a run that never started — finalize here.
      await ctx.runMutation(internal.messages.append, {
        ticketId,
        role: "system",
        content: `dispatch failed: ${String(e)}`,
      });
      await ctx.runMutation(internal.runs.finish, { runId, diff: "dispatch error" });
      await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
    }
  },
});
