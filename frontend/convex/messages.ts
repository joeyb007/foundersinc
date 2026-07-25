import { query, mutation, internalMutation } from "./_generated/server";
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

// PUBLIC, secret-guarded callback for the FastAPI agent service (Convex Python
// client can only call public functions). Streams live progress into the
// board while a coding agent runs for minutes outside a Convex action.
export const appendPublic = mutation({
  args: {
    secret: v.string(),
    ticketId: v.id("tickets"),
    role: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    content: v.string(),
  },
  handler: (ctx, { secret, ticketId, role, content }) => {
    if (secret !== process.env.CALLBACK_SECRET) {
      throw new Error("unauthorized");
    }
    return ctx.db.insert("messages", { ticketId, role, content });
  },
});
