import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Both queries keep the NEWEST slice. Taking in ascending order froze a chatty
// run's feed at its first N lines — the latest activity, the workdir census,
// and the "opened PR" line all fell off the end, exactly the messages the
// board exists to show.
export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const newest = await ctx.db
      .query("messages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .order("desc")
      .take(500);
    return newest.reverse();
  },
});

// The live board shows every lane at once, so it takes the whole epic's feed in
// one subscription rather than opening one per running ticket.
export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_epic", (q) => q.eq("epicId", epicId))
      .take(100);

    const perTicket = await Promise.all(
      tickets.map((t) =>
        ctx.db
          .query("messages")
          .withIndex("by_ticket", (q) => q.eq("ticketId", t._id))
          .order("desc")
          .take(200),
      ),
    );

    return perTicket.flat().sort((a, b) => a._creationTime - b._creationTime);
  },
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
