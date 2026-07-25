import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { agentType, ticketStatus } from "./validators";

export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) =>
    ctx.db.query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect(),
});

export const get = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) => ctx.db.get(ticketId),
});

export const approvedForEpic = internalQuery({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect();
    return tickets.filter((t) => t.status === "approved");
  },
});

export const setStatus = internalMutation({
  args: { ticketId: v.id("tickets"), status: ticketStatus },
  handler: (ctx, { ticketId, status }) => ctx.db.patch(ticketId, { status }),
});

export const insertProposed = internalMutation({
  args: { epicId: v.id("epics"), title: v.string(), body: v.string(), agentType },
  handler: (ctx, args) => ctx.db.insert("tickets", { ...args, status: "proposed" }),
});
