import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) => ctx.db.get(epicId),
});
