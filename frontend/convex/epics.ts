import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Public: both the intake screen and the board read the epic they're pointed
// at, so this is part of the UI seam rather than an internal-only read.
export const get = query({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) => ctx.db.get("epics", epicId),
});

export const list = query({
  args: {},
  handler: (ctx) => ctx.db.query("epics").order("desc").take(20),
});

/** Turns the board's raw `?epicId=` string into a real epic, falling back to
 *  the most recent one. Takes a string rather than `v.id` on purpose: a stale
 *  bookmark or a hand-edited URL should land on the latest epic, not throw an
 *  argument-validation error the client can't recover from. */
export const resolve = query({
  args: { epicId: v.optional(v.string()) },
  handler: async (ctx, { epicId }) => {
    if (epicId) {
      const id = ctx.db.normalizeId("epics", epicId);
      if (id) {
        const epic = await ctx.db.get("epics", id);
        if (epic) return epic;
      }
    }
    const [latest] = await ctx.db.query("epics").order("desc").take(1);
    return latest ?? null;
  },
});

export const setStatus = internalMutation({
  args: { epicId: v.id("epics"), status: v.string() },
  handler: (ctx, { epicId, status }) => ctx.db.patch("epics", epicId, { status }),
});

export const setRepoUrl = internalMutation({
  args: { epicId: v.id("epics"), repoUrl: v.string() },
  handler: (ctx, { epicId, repoUrl }) => ctx.db.patch("epics", epicId, { repoUrl }),
});
