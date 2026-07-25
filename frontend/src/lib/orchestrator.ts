// Domain model for the epic board. Mirrors the schema locked in docs/ctd.md:
//   epics    { title, body, status }
//   tickets  { epicId, title, body, agentType, status }
//   runs     { ticketId, agentType, status, prUrl?, diff?, log[] }
//   messages { ticketId, role, content }
//
// This file is UI-only seed data — no backend calls. docs/ctd.md asks both
// sides to build against seeded data so neither dev blocks the other.

export const AGENT_TYPES = ["ui", "ml", "ds", "swe"] as const;
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
  /** Percent complete, only meaningful while status is "running". */
  progress?: number;
  prUrl?: string;
  prNumber?: number;
  filesTouched?: string[];
};

export type Epic = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "decomposed" | "executing" | "shipped";
  repo: string;
};

/** The four pre-built agents. Fixed toolsets — the orchestrator selects, it
 *  does not invent capabilities (hard scope rule in docs/ctd.md). */
export const AGENTS: Record<
  AgentType,
  { name: string; role: string; tools: string[] }
> = {
  ui: {
    name: "Iris",
    role: "Interface agent",
    tools: ["next", "tailwind", "shadcn"],
  },
  ml: {
    name: "Mel",
    role: "Model agent",
    tools: ["transformers", "eval-harness"],
  },
  ds: {
    name: "Dez",
    role: "Data agent",
    tools: ["duckdb", "pandas", "schema-diff"],
  },
  swe: {
    name: "Sven",
    role: "Systems agent",
    tools: ["fastapi", "pytest", "gh-api"],
  },
};

export const EPIC: Epic = {
  id: "epic_1",
  title: "Realtime chat for Founders Inc",
  body: "Members need a live chat surface inside the portal: message history, presence, and typing indicators, backed by an API that survives reconnects.",
  status: "executing",
  repo: "foundersinc/chat-app",
};

export const TICKETS: Ticket[] = [
  {
    id: "t1",
    key: "FI-101",
    epicId: "epic_1",
    title: "Message thread view with virtualized scroll",
    body: "Render the message list, group consecutive messages by author, and keep scroll pinned to the newest message.",
    agentType: "ui",
    status: "done",
    priority: "high",
    effort: "medium",
    updatedAt: "2026-07-24T20:18:00Z",
    prUrl: "https://github.com/foundersinc/chat-app/pull/42",
    prNumber: 42,
    filesTouched: ["src/components/message-thread.tsx"],
  },
  {
    id: "t2",
    key: "FI-102",
    epicId: "epic_1",
    title: "WebSocket gateway with reconnect backoff",
    body: "Expose /ws, fan messages out to room subscribers, and reconnect with exponential backoff on drop.",
    agentType: "swe",
    status: "running",
    priority: "high",
    effort: "large",
    updatedAt: "2026-07-24T20:31:00Z",
    progress: 62,
    filesTouched: ["backend/app/api/ws.py"],
  },
  {
    id: "t3",
    key: "FI-103",
    epicId: "epic_1",
    title: "Presence and typing indicator store",
    body: "Track who is online per room and expire typing state after 3s of silence.",
    agentType: "ds",
    status: "running",
    priority: "medium",
    effort: "medium",
    updatedAt: "2026-07-24T20:30:00Z",
    progress: 41,
    filesTouched: ["backend/app/store/presence.py"],
  },
  {
    id: "t4",
    key: "FI-104",
    epicId: "epic_1",
    title: "Toxicity filter on inbound messages",
    body: "Score each message and hold anything above threshold for review instead of broadcasting it.",
    agentType: "ml",
    status: "review",
    priority: "medium",
    effort: "medium",
    updatedAt: "2026-07-24T20:08:00Z",
    filesTouched: ["backend/app/ml/moderate.py"],
  },
  {
    id: "t5",
    key: "FI-105",
    epicId: "epic_1",
    title: "Composer with attachment drop zone",
    body: "Text input that grows to four lines, sends on Enter, and accepts dragged images.",
    agentType: "ui",
    status: "approved",
    priority: "medium",
    effort: "small",
    updatedAt: "2026-07-24T19:52:00Z",
  },
  {
    id: "t6",
    key: "FI-106",
    epicId: "epic_1",
    title: "Message retention and archive job",
    body: "Roll messages older than 90 days into cold storage on a nightly schedule.",
    agentType: "ds",
    status: "proposed",
    priority: "low",
    effort: "large",
    updatedAt: "2026-07-24T19:35:00Z",
  },
  {
    id: "t7",
    key: "FI-107",
    epicId: "epic_1",
    title: "Unread badge counts per room",
    body: "Derive unread counts from last-read markers and keep them correct across tabs.",
    agentType: "swe",
    status: "proposed",
    priority: "medium",
    effort: "small",
    updatedAt: "2026-07-24T19:34:00Z",
  },
  {
    id: "t8",
    key: "FI-108",
    epicId: "epic_1",
    title: "Smart reply suggestions under the composer",
    body: "Offer three short replies based on the last message in the thread.",
    agentType: "ml",
    status: "proposed",
    priority: "low",
    effort: "medium",
    updatedAt: "2026-07-24T19:33:00Z",
  },
];

export const MESSAGES: Message[] = [
  {
    id: "m1",
    ticketId: "t2",
    role: "system",
    content: "Run started · agent swe · toolset fastapi, pytest, gh-api",
    at: "20:28:41",
  },
  {
    id: "m2",
    ticketId: "t2",
    role: "agent",
    content: "Read backend/app/main.py — found existing APIRouter mount.",
    at: "20:29:02",
  },
  {
    id: "m3",
    ticketId: "t2",
    role: "agent",
    content: "Wrote backend/app/api/ws.py — /ws endpoint with room fan-out.",
    at: "20:30:15",
  },
  {
    id: "m4",
    ticketId: "t2",
    role: "agent",
    content: "Adding reconnect backoff (250ms → 8s, jittered).",
    at: "20:31:07",
  },
  {
    id: "m5",
    ticketId: "t3",
    role: "system",
    content: "Run started · agent ds · toolset duckdb, pandas, schema-diff",
    at: "20:29:50",
  },
  {
    id: "m6",
    ticketId: "t3",
    role: "agent",
    content: "Modeling presence as a TTL keyed on (room, member).",
    at: "20:30:28",
  },
  {
    id: "m7",
    ticketId: "t1",
    role: "system",
    content: "Run started · agent ui · toolset next, tailwind, shadcn",
    at: "20:14:03",
  },
  {
    id: "m8",
    ticketId: "t1",
    role: "agent",
    content: "Wrote src/components/message-thread.tsx.",
    at: "20:16:44",
  },
  {
    id: "m9",
    ticketId: "t1",
    role: "agent",
    content: "Opened PR #42 → foundersinc/chat-app.",
    at: "20:18:00",
  },
  {
    id: "m10",
    ticketId: "t1",
    role: "human",
    content: "Approved. Scroll anchoring looks right.",
    at: "20:21:12",
  },
  {
    id: "m11",
    ticketId: "t4",
    role: "system",
    content: "Run started · agent ml · toolset transformers, eval-harness",
    at: "20:02:19",
  },
  {
    id: "m12",
    ticketId: "t4",
    role: "agent",
    content: "Threshold at 0.82 held back 3 of 500 sample messages.",
    at: "20:07:35",
  },
  {
    id: "m13",
    ticketId: "t4",
    role: "system",
    content: "Bounced to review — reviewer wants the threshold configurable.",
    at: "20:08:00",
  },
];

/** The approvers who have to sign off before a ticket set can run. */
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
