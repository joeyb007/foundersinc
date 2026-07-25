import { internalMutation } from "./_generated/server";

const DEMO_TICKETS = [
  { agentType: "ui" as const, title: "Add a Login button", body: "Render a primary Login button in the header." },
  { agentType: "swe" as const, title: "Add a health endpoint", body: "Expose GET /healthz returning ok." },
  { agentType: "ds" as const, title: "Summarize signup CSV", body: "Compute daily signup counts." },
  { agentType: "ml" as const, title: "Stub churn scorer", body: "Add a placeholder churn score function." },
];

export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const epicId = await ctx.db.insert("epics", {
      title: "Ship the MVP dashboard",
      body: "Demo epic",
      status: "approved",
    });
    for (const t of DEMO_TICKETS) {
      await ctx.db.insert("tickets", { epicId, status: "approved", ...t });
    }
    return epicId;
  },
});
