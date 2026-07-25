import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";

export const workflow = new WorkflowManager(components.workflow);

export const executeApproved = workflow.define({
  args: { epicId: v.id("epics") },
  handler: async (step, { epicId }): Promise<void> => {
    const tickets = await step.runQuery(internal.tickets.approvedForEpic, { epicId });
    await Promise.all(
      tickets.map((t) =>
        step.runAction(internal.agents.runOne, { ticketId: t._id, agentType: t.agentType }),
      ),
    );
  },
});
