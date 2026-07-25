import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ticketStatus } from "./validators";

const DEMO_TICKETS = [
  { agentType: "ui" as const, title: "Add a Login button", body: "Render a primary Login button in the header." },
  { agentType: "swe" as const, title: "Add a health endpoint", body: "Expose GET /healthz returning ok." },
  { agentType: "ds" as const, title: "Summarize signup CSV", body: "Compute daily signup counts." },
  { agentType: "ml" as const, title: "Stub churn scorer", body: "Add a placeholder churn score function." },
];

/** Seeds one epic and four tickets, one per agent type.
 *
 * Defaults to `proposed` so the board opens on the human approval gate — the
 * demo path. Pass `status: "approved"` to skip the gate and test the parallel
 * fan-out (`orchestrator:runApproved`) directly. */
export const seedDemo = internalMutation({
  args: { status: v.optional(ticketStatus) },
  handler: async (ctx, { status = "proposed" }) => {
    const epicId = await ctx.db.insert("epics", {
      title: "Ship the MVP dashboard",
      body: "Demo epic",
      status: status === "approved" ? "executing" : "decomposed",
    });
    for (const t of DEMO_TICKETS) {
      await ctx.db.insert("tickets", { epicId, status, ...t });
    }
    return epicId;
  },
});
