import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { agentType } from "./validators";

export const runOne = internalAction({
  args: { ticketId: v.id("tickets"), agentType },
  handler: async (ctx, { ticketId, agentType }) => {
    const runId = await ctx.runMutation(internal.runs.create, { ticketId, agentType });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "running" });
    for (const line of [
      `${agentType}-agent picked up the ticket`,
      "generating files…",
      "opening pull request…",
    ]) {
      await ctx.runMutation(internal.messages.append, { ticketId, role: "agent", content: line });
      await new Promise((r) => setTimeout(r, 900)); // visible streaming; remove in Task 5
    }
    await ctx.runMutation(internal.runs.finish, {
      runId,
      prUrl: "https://github.com/example/demo/pull/1",
    });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
  },
});
