import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { workflow } from "./workflows";

export const runApproved = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    await workflow.start(ctx, internal.workflows.executeApproved, { epicId });
  },
});
