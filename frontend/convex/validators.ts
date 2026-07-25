import { v } from "convex/values";

// Fixed, hardcoded set of specialized agent roles. The orchestrator SELECTS
// among these; it never generates capabilities dynamically. Keep in sync with
// backend AGENT_CONFIGS and the b2 frontend badges.
export const agentType = v.union(
  v.literal("ui"),
  v.literal("ux"),
  v.literal("swe"),
  v.literal("mobile"),
  v.literal("devops"),
  v.literal("qa"),
  v.literal("security"),
  v.literal("ml"),
  v.literal("ds"),
  v.literal("dataeng"),
  v.literal("pm"),
  v.literal("docs"),
);

export const ticketStatus = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("running"),
  v.literal("review"),
  v.literal("done"),
);
