import { v } from "convex/values";

export const agentType = v.union(
  v.literal("ui"),
  v.literal("ml"),
  v.literal("ds"),
  v.literal("swe"),
);

export const ticketStatus = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("running"),
  v.literal("review"),
  v.literal("done"),
);
