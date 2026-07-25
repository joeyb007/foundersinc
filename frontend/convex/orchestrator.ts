import { mutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { agentType } from "./validators";
import { ensureRepoFor } from "./agents";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// The public seam. The UI only ever calls the functions in this file plus the
// three list queries (tickets/runs/messages) — never FastAPI directly.
// ---------------------------------------------------------------------------

export const submitEpic = mutation({
  args: { title: v.string(), body: v.string() },
  handler: (ctx, { title, body }) => ctx.db.insert("epics", { title, body, status: "draft" }),
});

/** Human-authored tickets (the manual path on the intake screen), inserted as
 *  `proposed` so they go through the same approval gate as PM-agent output. */
export const addTickets = mutation({
  args: {
    epicId: v.id("epics"),
    tickets: v.array(v.object({ title: v.string(), body: v.string(), agentType })),
  },
  handler: async (ctx, { epicId, tickets }) => {
    for (const t of tickets) {
      await ctx.db.insert("tickets", { epicId, ...t, status: "proposed" });
    }
    await ctx.db.patch("epics", epicId, { status: "decomposed" });
    return tickets.length;
  },
});

/** Approve the whole proposed set, or just `ticketIds` when the human picked a
 *  subset on the board. */
export const approveTickets = mutation({
  args: { epicId: v.id("epics"), ticketIds: v.optional(v.array(v.id("tickets"))) },
  handler: async (ctx, { epicId, ticketIds }) => {
    const chosen = ticketIds ? new Set<Id<"tickets">>(ticketIds) : null;
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_epic", (q) => q.eq("epicId", epicId))
      .take(100);

    let approved = 0;
    for (const t of tickets) {
      if (t.status !== "proposed") continue;
      if (chosen && !chosen.has(t._id)) continue;
      await ctx.db.patch("tickets", t._id, { status: "approved" });
      approved += 1;
    }
    return approved;
  },
});

/** Create the epic's repo up front, so the board has something to link to the
 *  moment you land on it rather than only after the first run.
 *
 *  Returns null instead of throwing when the agent service or the GitHub
 *  credential is unhappy — an epic with no repo yet is a legitimate state the
 *  board already renders, and the first wave retries the creation anyway. */
export const ensureEpicRepo = action({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }): Promise<string | null> => ensureRepoFor(ctx, epicId),
});

// Both run entry points kick the pipeline the same way: schedule the first
// wave and return. There is no long-lived orchestrator — dispatch is
// fire-and-forget, so each wave's completion callbacks (runs.finishPublic)
// are what schedule the wave after it. See agents.dispatchNextWave.
export const runApproved = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    await ctx.db.patch("epics", epicId, { status: "executing" });
    await ctx.scheduler.runAfter(0, internal.agents.dispatchNextWave, { epicId });
  },
});

/** The approval gate as one transaction: approve the selected tickets and fan
 *  them out together. Two separate client calls would leave a window where a
 *  concurrent `runApproved` sees a half-approved set. */
export const approveAndRun = mutation({
  args: { epicId: v.id("epics"), ticketIds: v.optional(v.array(v.id("tickets"))) },
  handler: async (ctx, { epicId, ticketIds }) => {
    const chosen = ticketIds ? new Set<Id<"tickets">>(ticketIds) : null;
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_epic", (q) => q.eq("epicId", epicId))
      .take(100);

    let approved = 0;
    for (const t of tickets) {
      if (t.status !== "proposed") continue;
      if (chosen && !chosen.has(t._id)) continue;
      await ctx.db.patch("tickets", t._id, { status: "approved" });
      approved += 1;
    }

    await ctx.db.patch("epics", epicId, { status: "executing" });
    await ctx.scheduler.runAfter(0, internal.agents.dispatchNextWave, { epicId });
    return approved;
  },
});

// ---------------------------------------------------------------------------
// Decomposition
// ---------------------------------------------------------------------------

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
  handler: async (ctx, { epicId }): Promise<{ count: number; usedFallback: boolean }> => {
    const epic = await ctx.runQuery(api.epics.get, { epicId });
    if (!epic) return { count: 0, usedFallback: false };

    // Any failure — network, non-200, unparseable body, or a ticket whose
    // agentType isn't one of the fixed 12 — degrades to FALLBACK_TICKETS.
    let tickets: ProposedTicket[] = FALLBACK_TICKETS;
    let usedFallback = true;
    try {
      const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: epic.title, body: epic.body }),
      });
      if (res.ok) {
        const parsed = parseTickets(await res.json());
        if (parsed) {
          tickets = parsed;
          usedFallback = false;
        }
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
    await ctx.runMutation(internal.epics.setStatus, { epicId, status: "decomposed" });

    return { count: tickets.length, usedFallback };
  },
});
