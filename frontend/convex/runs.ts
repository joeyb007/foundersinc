import { query, internalMutation } from "./_generated/server";
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
