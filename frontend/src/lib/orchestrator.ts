// Domain model for the epic board — the view-model side of the Convex schema
// locked in docs/ctd.md:
//   epics    { title, body, status }
//   tickets  { epicId, title, body, agentType, status }
//   runs     { ticketId, agentType, status, prUrl?, diff?, log[] }
//   messages { ticketId, role, content }
//
// There is no seed data here any more: every value the board renders comes from
// Convex through `board-data.ts`. This file holds only the shapes, the agent
// roster, and the presentation helpers.

/** The fixed roster. Must stay in sync with the `agentType` enum in
 *  `convex/validators.ts` and `AGENT_CONFIGS` in `backend/app/agents/configs.py`
 *  — the orchestrator SELECTS among these, it never invents capabilities. */
export const AGENT_TYPES = [
  "ui",
  "ux",
  "swe",
  "mobile",
  "devops",
  "qa",
  "security",
  "ml",
  "ds",
  "dataeng",
  "pm",
  "docs",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const TICKET_STATUSES = [
  "proposed",
  "approved",
  "running",
  "review",
  "done",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type Priority = "high" | "medium" | "low";
export type Effort = "small" | "medium" | "large";
export type MessageRole = "agent" | "human" | "system";

export type Message = {
  id: string;
  ticketId: string;
  role: MessageRole;
  content: string;
  at: string;
};

export type Ticket = {
  id: string;
  key: string;
  epicId: string;
  title: string;
  body: string;
  agentType: AgentType;
  status: TicketStatus;
  priority: Priority;
  effort: Effort;
  updatedAt: string;
  /** Log lines this ticket's agent has streamed back so far. */
  steps: number;
  prUrl?: string;
  prNumber?: number;
  /** Set instead of `prUrl` when the PR hop failed and the agent fell back to
   *  returning a raw diff (the documented fallback in docs/ctd.md). */
  diff?: string;
  filesTouched?: string[];
};

export type Epic = {
  id: string;
  title: string;
  body: string;
  status: string;
  /** `owner/name` of this epic's repo, or null before the first run creates it. */
  repo: string | null;
  repoUrl: string | null;
};

/** Each role is a persona (a system prompt) driving a real Claude Agent SDK
 *  coding agent. `focus` describes what the persona is for — every agent shares
 *  the same underlying toolset (Read/Write/Edit/Bash/Grep/Glob), so listing
 *  per-agent tools here would be fiction. `code` is the ≤3-char form that fits
 *  the square agent tile. */
export const AGENTS: Record<
  AgentType,
  { name: string; role: string; code: string; focus: string[] }
> = {
  ui: { name: "Iris", role: "Interface agent", code: "ui", focus: ["components", "layout", "styling"] },
  ux: { name: "Uma", role: "Experience agent", code: "ux", focus: ["flows", "states", "a11y"] },
  swe: { name: "Sven", role: "Systems agent", code: "swe", focus: ["services", "apis", "data flow"] },
  mobile: { name: "Milo", role: "Mobile agent", code: "mob", focus: ["react native", "screens"] },
  devops: { name: "Dara", role: "Platform agent", code: "ops", focus: ["ci", "pipelines", "infra"] },
  qa: { name: "Quinn", role: "Quality agent", code: "qa", focus: ["tests", "regressions"] },
  security: { name: "Sable", role: "Security agent", code: "sec", focus: ["hardening", "authz"] },
  ml: { name: "Mel", role: "Model agent", code: "ml", focus: ["models", "scoring"] },
  ds: { name: "Dez", role: "Data agent", code: "ds", focus: ["analysis", "summaries"] },
  dataeng: { name: "Dane", role: "Pipeline agent", code: "de", focus: ["etl", "ingestion"] },
  pm: { name: "Pim", role: "Planning agent", code: "pm", focus: ["specs", "breakdown"] },
  docs: { name: "Dot", role: "Docs agent", code: "doc", focus: ["guides", "reference"] },
};

/** The approvers who have to sign off before a ticket set can run. This gate is
 *  frontend-only by design — docs/ctd.md scopes multi-user consensus out. */
export const APPROVERS = [
  { id: "a1", name: "David N.", initials: "DN", signed: true },
  { id: "a2", name: "Priya R.", initials: "PR", signed: false },
];

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const EFFORT_ORDER: Record<Effort, number> = {
  small: 0,
  medium: 1,
  large: 2,
};

/** Long form, for the detail panel where there is room for it. */
export function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short form for the table, so the column never truncates mid-date. */
export function formatUpdatedShort(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
