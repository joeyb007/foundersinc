import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { agentType, ticketStatus } from "./validators";

export default defineSchema({
  epics: defineTable({
    title: v.string(),
    body: v.string(),
    status: v.string(),
  }),
  tickets: defineTable({
    epicId: v.id("epics"),
    title: v.string(),
    body: v.string(),
    agentType,
    status: ticketStatus,
  }).index("by_epic", ["epicId"]),
  runs: defineTable({
    ticketId: v.id("tickets"),
    agentType,
    status: v.string(),
    prUrl: v.optional(v.string()),
    diff: v.optional(v.string()),
    log: v.array(v.string()),
  }).index("by_ticket", ["ticketId"]),
  messages: defineTable({
    ticketId: v.id("tickets"),
    role: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    content: v.string(),
  }).index("by_ticket", ["ticketId"]),
});
