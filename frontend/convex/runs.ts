import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { agentType } from "./validators";

export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect();
    const ids = new Set(tickets.map((t) => t._id));
    const runs = await ctx.db.query("runs").collect();
    return runs.filter((r) => ids.has(r.ticketId));
  },
});

export const create = internalMutation({
  args: { ticketId: v.id("tickets"), agentType },
  handler: (ctx, { ticketId, agentType }) =>
    ctx.db.insert("runs", { ticketId, agentType, status: "running", log: [] }),
});

export const finish = internalMutation({
  args: { runId: v.id("runs"), prUrl: v.optional(v.string()), diff: v.optional(v.string()) },
  handler: (ctx, { runId, prUrl, diff }) =>
    ctx.db.patch(runId, { status: "done", prUrl, diff }),
});

// PUBLIC, secret-guarded callback for the FastAPI agent service. Finalizes
// the run (and its ticket) once the coding agent finishes out-of-band —
// the Convex action that dispatched it already returned.
export const finishPublic = mutation({
  args: {
    secret: v.string(),
    runId: v.id("runs"),
    prUrl: v.optional(v.string()),
    diff: v.optional(v.string()),
  },
  handler: async (ctx, { secret, runId, prUrl, diff }) => {
    if (secret !== process.env.CALLBACK_SECRET) {
      throw new Error("unauthorized");
    }
    const patch: { status: "done"; prUrl?: string; diff?: string } = { status: "done" };
    if (prUrl !== undefined) patch.prUrl = prUrl;
    if (diff !== undefined) patch.diff = diff;
    await ctx.db.patch(runId, patch);

    const run = await ctx.db.get(runId);
    if (run) {
      await ctx.db.patch(run.ticketId, { status: "done" });
    }
  },
});
