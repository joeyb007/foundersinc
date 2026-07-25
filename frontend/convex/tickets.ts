import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { agentType, ticketStatus } from "./validators";

// Statuses a human may set from the board. "running" is deliberately absent:
// tickets only enter it through the orchestrator's approve-and-run fan-out,
// and setting it by hand would show an agent working that was never started.
const manualStatus = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("review"),
  v.literal("done"),
);

export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) =>
    ctx.db.query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).take(100),
});

export const get = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) => ctx.db.get("tickets", ticketId),
});

export const approvedForEpic = internalQuery({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).take(100);
    return tickets.filter((t) => t.status === "approved");
  },
});

/** Manual ticket entry from the board. Lands as `proposed`, exactly like a
 *  PM-agent ticket, so it flows through the same approval gate. */
export const create = mutation({
  args: { epicId: v.id("epics"), title: v.string(), body: v.string(), agentType },
  handler: (ctx, args) => ctx.db.insert("tickets", { ...args, status: "proposed" }),
});

export const remove = mutation({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) => ctx.db.delete("tickets", ticketId),
});

export const updateStatus = mutation({
  args: { ticketId: v.id("tickets"), status: manualStatus },
  handler: (ctx, { ticketId, status }) => ctx.db.patch("tickets", ticketId, { status }),
});

export const setStatus = internalMutation({
  args: { ticketId: v.id("tickets"), status: ticketStatus },
  handler: (ctx, { ticketId, status }) => ctx.db.patch("tickets", ticketId, { status }),
});

export const insertProposed = internalMutation({
  args: { epicId: v.id("epics"), title: v.string(), body: v.string(), agentType },
  handler: (ctx, args) => ctx.db.insert("tickets", { ...args, status: "proposed" }),
});
