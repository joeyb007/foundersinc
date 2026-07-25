import { mutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { workflow } from "./workflows";

export const runApproved = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    await workflow.start(ctx, internal.workflows.executeApproved, { epicId });
  },
});

export const submitEpic = mutation({
  args: { title: v.string(), body: v.string() },
  handler: (ctx, { title, body }) => ctx.db.insert("epics", { title, body, status: "draft" }),
});

export const approveTickets = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_epic", (q) => q.eq("epicId", epicId))
      .collect();
    for (const t of tickets) {
      if (t.status === "proposed") await ctx.db.patch(t._id, { status: "approved" });
    }
  },
});

// The fixed 12 agent roles. Mirrors the agentType enum in validators.ts; kept
// as a plain array here so the /agents/decompose response can be validated at
// runtime — a value outside this set would otherwise throw at insertProposed's
// arg validator, outside the try/catch, aborting the action mid-loop.
const AGENT_TYPES = [
  "ui", "ux", "swe", "mobile", "devops", "qa", "security",
  "ml", "ds", "dataeng", "pm", "docs",
] as const;
type AgentType = (typeof AGENT_TYPES)[number];
type ProposedTicket = { agentType: AgentType; title: string; body: string };

// Validate the whole decompose response BEFORE using it, so a malformed body or
// an unknown agentType degrades to the fallback rather than throwing mid-insert.
function parseTickets(data: unknown): ProposedTicket[] | null {
  const list = (data as { tickets?: unknown } | null)?.tickets;
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: ProposedTicket[] = [];
  for (const t of list) {
    const { agentType, title, body } = (t ?? {}) as Record<string, unknown>;
    if (
      typeof title !== "string" ||
      typeof body !== "string" ||
      typeof agentType !== "string" ||
      !(AGENT_TYPES as readonly string[]).includes(agentType)
    ) {
      return null;
    }
    out.push({ agentType: agentType as AgentType, title, body });
  }
  return out;
}

// Hardcoded, known-good decomposition used when /agents/decompose is
// unreachable or returns anything unusable — the demo never hard-blocks on the
// FastAPI hop, and any failure degrades gracefully to this set.
const FALLBACK_TICKETS: ProposedTicket[] = [
  { agentType: "ui", title: "Login button", body: "Primary login button in header." },
  { agentType: "swe", title: "Health endpoint", body: "GET /healthz returns ok." },
  { agentType: "ds", title: "Signup summary", body: "Daily signup counts from CSV." },
  { agentType: "ml", title: "Churn stub", body: "Placeholder churn scorer." },
];

export const proposeDecomposition = action({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const epic = await ctx.runQuery(internal.epics.get, { epicId });
    if (!epic) return;

    // Any failure — network, non-200, unparseable body, or a ticket whose
    // agentType isn't one of the fixed 12 — degrades to FALLBACK_TICKETS.
    let tickets: ProposedTicket[] = FALLBACK_TICKETS;
    try {
      const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: epic.title, body: epic.body }),
      });
      if (res.ok) {
        const parsed = parseTickets(await res.json());
        if (parsed) tickets = parsed;
      }
    } catch {
      // fall through to FALLBACK_TICKETS
    }

    for (const t of tickets) {
      await ctx.runMutation(internal.tickets.insertProposed, {
        epicId,
        title: t.title,
        body: t.body,
        agentType: t.agentType,
      });
    }
  },
});
