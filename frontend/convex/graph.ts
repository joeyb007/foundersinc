import type { Infer } from "convex/values";
import type { agentType } from "./validators";

export type AgentType = Infer<typeof agentType>;

// The org chart. Agents are not a flat pool — they depend on each other's
// output, so a ticket set runs in waves rather than all at once:
//
//   pm
//    └─ ux ──┬─ ui ─────┐
//            │  mobile  │
//   swe ─────┴──────────┼─ qa ─ docs
//   devops              │
//   security            │
//   dataeng ─ ds ─ ml ──┘
//
// Reading it: planning precedes design, design precedes the surfaces built on
// it, data engineering precedes analysis precedes modelling, QA can only test
// something that exists, and docs describe what finally shipped.
//
// This is deliberately FIXED rather than model-generated. The orchestrator
// SELECTS among pre-built roles (docs/ctd.md) — the shape of the org chart is
// a property of the org, not something to re-derive per epic.
export const AGENT_TIER: Record<AgentType, number> = {
  pm: 0,

  ux: 1,
  swe: 1,
  devops: 1,
  security: 1,
  dataeng: 1,

  ui: 2,
  mobile: 2,
  ds: 2,

  ml: 3,

  qa: 4,

  docs: 5,
};

export const TIER_LABEL: Record<number, string> = {
  0: "Plan",
  1: "Foundations",
  2: "Surfaces",
  3: "Models",
  4: "Verify",
  5: "Document",
};

/** Split a ticket set into execution waves, lowest tier first.
 *
 *  Only tiers that actually have tickets produce a wave — an epic with no
 *  `pm` ticket must not sit through an empty planning wave. Everything inside
 *  one wave runs concurrently; waves themselves run in order. */
export function groupIntoWaves<T extends { agentType: string }>(tickets: T[]): T[][] {
  const byTier = new Map<number, T[]>();
  for (const ticket of tickets) {
    const tier = AGENT_TIER[ticket.agentType as AgentType] ?? 1;
    const bucket = byTier.get(tier);
    if (bucket) bucket.push(ticket);
    else byTier.set(tier, [ticket]);
  }
  return [...byTier.keys()].sort((a, b) => a - b).map((tier) => byTier.get(tier)!);
}
