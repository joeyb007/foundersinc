import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) =>
    ctx.db.query("messages").withIndex("by_ticket", (q) => q.eq("ticketId", ticketId)).collect(),
});

export const append = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    role: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    content: v.string(),
  },
  handler: (ctx, { ticketId, role, content }) =>
    ctx.db.insert("messages", { ticketId, role, content }),
});
