import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";

// maxParallelism is what makes the fan-out actually concurrent: every ticket in
// an epic dispatches at once rather than queueing behind the one before it.
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 10 },
});

export const executeApproved = workflow.define({
  args: { epicId: v.id("epics") },
  handler: async (step, { epicId }): Promise<void> => {
    const tickets = await step.runQuery(internal.tickets.approvedForEpic, { epicId });
    if (tickets.length === 0) return;

    // Sequential on purpose, and only this one step is: every agent works in
    // the same repo, so it has to exist before anyone clones it.
    const repoUrl = await step.runAction(internal.agents.ensureRepo, { epicId });

    if (!repoUrl) {
      // Nothing to clone. Report it on each ticket and leave them `approved`
      // rather than faking completion — the human can fix the credential and
      // press Run again, and ensureRepo stays idempotent across that retry.
      await Promise.all(
        tickets.map((t) =>
          step.runMutation(internal.messages.append, {
            ticketId: t._id,
            role: "system",
            content: "could not create the epic's repo — run not started",
          }),
        ),
      );
      return;
    }

    // The money shot: every approved ticket dispatches at once.
    await Promise.all(
      tickets.map((t) =>
        step.runAction(internal.agents.runOne, {
          ticketId: t._id,
          agentType: t.agentType,
          repoUrl,
        }),
      ),
    );
  },
});
