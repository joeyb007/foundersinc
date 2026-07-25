PROJECT: Autonomous SDLC orchestrator. A human submits an EPIC. A PM-agent 
decomposes it into TICKETS. A human approves the ticket set (gate). An 
ORCHESTRATOR classifies each ticket to a pre-built AGENT TYPE from an enum 
(ui|ml|ds|swe). The agents execute their tickets IN PARALLEL and each opens a 
REAL GitHub PR. Automates the SDLC.

STACK: Convex (reactive DB + Workflow + Agent components) as the backend/substrate. 
React + Convex client as the surface. TypeScript throughout. GitHub REST API for PRs.

THESIS: graph-engineering (agents as an org chart of specialized nodes, not a single 
loop) + human-as-PM + automated SDLC. The WOW is watching specialized agents execute 
in parallel, live, and real PRs landing on a real repo.

HARD SCOPE RULES (3-hour build, 2 devs — violate these and we don't ship):
- Agent types are PRE-BUILT with FIXED toolsets. The orchestrator SELECTS among 
  ui/ml/ds/swe; it does NOT generate capabilities dynamically.
- Agents write 1-2 TRIVIAL real files each and open a real PR. The demo value is 
  "a PR appeared," NOT "the code is good." Do not chase compilable/correct output.
- Approval = ONE human clicks approve. Multi-user consensus is a STRETCH GOAL only.
- One rehearsed demo path. Anything off it does not ship.
- If GitHub auth isn't working by the 40-min mark, fall back to text-diff output 
  and drop real PRs. Decide at 40 min, not at hour 2.

CONVEX SCHEMA (lock verbatim, do not change after the first 20 min):
- epics:    { title, body, status }
- tickets:  { epicId, title, body, agentType: "ui"|"ml"|"ds"|"swe",
              status: "proposed"|"approved"|"running"|"review"|"done" }
- runs:     { ticketId, agentType, status, prUrl?, diff?, log: string[] }
- messages: { ticketId, role: "agent"|"human"|"system", content }

INTERFACE SEAM (so we never block each other):
Backend exposes Convex functions; the UI ONLY calls those functions and subscribes 
to Convex queries. Never import across branches. ALL shared state flows through 
Convex. Both devs build against SEEDED data first so neither waits on the other.

FIRST 10 MIN — VERIFY, don't trust memory: pull docs.convex.dev on the Workflow 
component and the Agent component and build against their REAL current signatures. 
The component APIs may differ from assumptions.