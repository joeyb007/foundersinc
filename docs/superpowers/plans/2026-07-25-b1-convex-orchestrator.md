# B1 — Autonomous SDLC Orchestrator (Convex brain + FastAPI agents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `b1` "brain": Convex functions + a durable Workflow that runs specialized agents in parallel and lands real GitHub PRs, with the agent brains implemented as a FastAPI/Python service behind the Convex seam.

**Architecture:** Convex is the reactive substrate and the *only* interface the teammate's frontend (`frontend/src`, b2) touches — it owns the schema, the UI-facing queries/mutations, and the `executeApproved` **Workflow** that fans tickets out in parallel via `Promise.all(step.runAction(...))`. Each parallel step (`runOne`, a Convex action) owns all DB writes and delegates the actual agent work to a stateless FastAPI endpoint that returns JSON (`{log, prUrl?, diff?}`). FastAPI never touches Convex, so it's trivially testable and swappable — if the FastAPI hop fights, `runOne` collapses to inline work behind the same seam and the UI never knows.

**Tech Stack:** Convex (`convex`, `@convex-dev/workflow`) in TypeScript under `frontend/convex/`; FastAPI + `anthropic` (Claude, `claude-opus-4-8`) + `httpx` (GitHub REST) under `backend/`.

## Global Constraints

- **Schema is locked verbatim** (from `docs/ctd.md`) and must not change after Task 0: `epics {title, body, status}`, `tickets {epicId, title, body, agentType: "ui"|"ml"|"ds"|"swe", status: "proposed"|"approved"|"running"|"review"|"done"}`, `runs {ticketId, agentType, status, prUrl?, diff?, log: string[]}`, `messages {ticketId, role: "agent"|"human"|"system", content}`.
- **Build by DEMO VALUE, not pipeline order.** The parallel live board on SEEDED tickets must work (Task 2) before decomposition exists.
- **Agent types are the fixed enum `{ui, ml, ds, swe}`** with hardcoded configs (system prompt + one target filename each). Never generate capabilities dynamically.
- **Agents produce 1–2 trivial real files** and open a real PR. "A PR appeared" is the win — do not chase compilable/correct output.
- **All LLM calls live in FastAPI (Python).** Convex queries/mutations are deterministic; Convex actions only orchestrate and `fetch()` FastAPI.
- **The UI only calls Convex functions and subscribes to Convex queries.** Never expose FastAPI to the frontend.
- **Interface seam functions (public):** `submitEpic(title, body)`, `proposeDecomposition(epicId)`, `approveTickets(epicId)`, `runApproved(epicId)`, plus queries `tickets.listByEpic`, `runs.listByEpic`, `messages.listByTicket`.
- **Claude model:** `claude-opus-4-8` exactly. Auth via `ANTHROPIC_API_KEY` in `backend/.env`.
- **GitHub fallback:** if PR auth fails, write the file body to `runs.diff` instead. Decide the fallback at ~40 min, not hour 2.

## File Structure

```
frontend/                      # Next.js app (b2 owns src/; YOU own convex/)
├── convex/
│   ├── convex.config.ts       # registers the workflow component
│   ├── schema.ts              # locked schema + shared validators
│   ├── validators.ts          # agentType / ticketStatus reused across files
│   ├── workflows.ts           # WorkflowManager + executeApproved
│   ├── orchestrator.ts        # submitEpic, proposeDecomposition, approveTickets, runApproved (public seam)
│   ├── agents.ts              # runOne (internalAction) — delegates to FastAPI
│   ├── tickets.ts             # listByEpic (public), get/approvedForEpic/setStatus (internal)
│   ├── runs.ts                # listByEpic (public), create/finish (internal)
│   ├── messages.ts            # listByTicket (public), append (internal)
│   └── seed.ts                # seedDemo (internalMutation) for testing before decompose exists
└── .env.local                # NEXT_PUBLIC_CONVEX_URL, CONVEX_DEPLOYMENT (managed by convex dev)

backend/                       # FastAPI agent service (YOU own this)
├── app/
│   ├── main.py                # existing app + mounts agents router
│   ├── api/agents.py          # POST /agents/run, POST /decompose
│   ├── agents/
│   │   ├── configs.py         # AGENT_CONFIGS: 4 hardcoded {system, filename}
│   │   └── base.py            # run_agent(), decompose_epic()
│   └── github.py              # open_pr()
├── tests/
│   ├── test_github.py
│   └── test_agents.py
└── .env                       # ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BASE
```

Convex env var (set in the Convex dashboard, **not** `.env.local`): `AGENT_SERVICE_URL` = the reachable URL of the FastAPI service. Convex dev deployments run in Convex cloud and **cannot reach `localhost`** — during the demo, expose FastAPI with a tunnel (`ngrok http 8000` / `cloudflared`) and set `AGENT_SERVICE_URL` to that HTTPS URL.

---

### Task 0: Convex project + locked schema + seed data

**Files:**
- Create: `frontend/convex/validators.ts`, `frontend/convex/schema.ts`, `frontend/convex/seed.ts`
- Modify: `frontend/package.json` (adds `convex`), `frontend/.env.local` (managed by `convex dev`)

**Interfaces:**
- Produces: `agentType`, `ticketStatus` validators; the four tables; `internal.seed.seedDemo({}) -> epicId` inserting 1 epic + 4 approved tickets (one per agent type).

- [ ] **Step 1: Install Convex and initialize the dev deployment**

```bash
cd frontend
npm install convex
npx convex dev --once   # logs in, provisions a dev deployment, writes NEXT_PUBLIC_CONVEX_URL to .env.local
```
Expected: `frontend/convex/` created, `.env.local` gains `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`.

- [ ] **Step 2: Shared validators**

```typescript
// frontend/convex/validators.ts
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
```

- [ ] **Step 3: Locked schema**

```typescript
// frontend/convex/schema.ts
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
```

- [ ] **Step 4: Seed helper (lets Task 2 prove the board before decompose exists)**

```typescript
// frontend/convex/seed.ts
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
```

- [ ] **Step 5: Push and verify schema + seed**

```bash
npx convex dev --once
npx convex run seed:seedDemo '{}'
npx convex data tickets   # expect 4 rows, status "approved", one per agentType
```
Expected: `seedDemo` returns an epic id; `tickets` shows 4 approved rows.

- [ ] **Step 6: Commit**

```bash
git add frontend/convex frontend/package.json frontend/package-lock.json
git commit -m "feat(convex): locked schema + seed for orchestrator"
```

---

### Task 1: UI-seam queries + internal mutations for tickets/runs/messages

**Files:**
- Create: `frontend/convex/tickets.ts`, `frontend/convex/runs.ts`, `frontend/convex/messages.ts`

**Interfaces:**
- Produces (public queries the teammate subscribes to):
  - `api.tickets.listByEpic({epicId}) -> Ticket[]`
  - `api.runs.listByEpic({epicId}) -> Run[]`
  - `api.messages.listByTicket({ticketId}) -> Message[]`
- Produces (internal, consumed by Tasks 2/5):
  - `internal.tickets.get({ticketId}) -> Ticket`
  - `internal.tickets.approvedForEpic({epicId}) -> Ticket[]`
  - `internal.tickets.setStatus({ticketId, status})`
  - `internal.runs.create({ticketId, agentType}) -> runId`
  - `internal.runs.finish({runId, prUrl?, diff?})`
  - `internal.messages.append({ticketId, role, content})`

- [ ] **Step 1: tickets.ts**

```typescript
// frontend/convex/tickets.ts
import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ticketStatus } from "./validators";

export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) =>
    ctx.db.query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect(),
});

export const get = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) => ctx.db.get(ticketId),
});

export const approvedForEpic = internalQuery({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect();
    return tickets.filter((t) => t.status === "approved");
  },
});

export const setStatus = internalMutation({
  args: { ticketId: v.id("tickets"), status: ticketStatus },
  handler: (ctx, { ticketId, status }) => ctx.db.patch(ticketId, { status }),
});
```

- [ ] **Step 2: runs.ts**

```typescript
// frontend/convex/runs.ts
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { agentType } from "./validators";

export const listByEpic = query({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect();
    const ids = new Set(tickets.map((t) => t._id));
    const runs = await ctx.db.query("runs").collect();
    return runs.filter((r) => ids.has(r.ticketId));
  },
});

export const create = internalMutation({
  args: { ticketId: v.id("tickets"), agentType },
  handler: (ctx, { ticketId, agentType }) =>
    ctx.db.insert("runs", { ticketId, agentType, status: "running", log: [] }),
});

export const finish = internalMutation({
  args: { runId: v.id("runs"), prUrl: v.optional(v.string()), diff: v.optional(v.string()) },
  handler: (ctx, { runId, prUrl, diff }) =>
    ctx.db.patch(runId, { status: "done", prUrl, diff }),
});
```

- [ ] **Step 3: messages.ts**

```typescript
// frontend/convex/messages.ts
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: (ctx, { ticketId }) =>
    ctx.db.query("messages").withIndex("by_ticket", (q) => q.eq("ticketId", ticketId)).collect(),
});

export const append = internalMutation({
  args: {
    ticketId: v.id("tickets"),
    role: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    content: v.string(),
  },
  handler: (ctx, { ticketId, role, content }) =>
    ctx.db.insert("messages", { ticketId, role, content }),
});
```

- [ ] **Step 4: Push and verify queries compile + return**

```bash
cd frontend && npx convex dev --once
# using an epicId from Task 0's seed:
npx convex run tickets:listByEpic '{"epicId":"<EPIC_ID>"}'
```
Expected: no type errors on push; `listByEpic` returns the 4 seeded tickets.

- [ ] **Step 5: Commit**

```bash
git add frontend/convex/tickets.ts frontend/convex/runs.ts frontend/convex/messages.ts
git commit -m "feat(convex): ticket/run/message queries + internal mutations"
```

---

### Task 2: Workflow + stubbed runOne + runApproved — prove the parallel live board (MONEY SHOT)

This is the wow. Wire it end-to-end with a **stubbed** `runOne` (fake progress + fake PR link) so the parallel board works before any agent exists. Your teammate builds their board against this.

**Files:**
- Create: `frontend/convex/convex.config.ts`, `frontend/convex/workflows.ts`, `frontend/convex/agents.ts`, `frontend/convex/orchestrator.ts`
- Modify: `frontend/package.json` (adds `@convex-dev/workflow`)

**Interfaces:**
- Consumes: `internal.tickets.approvedForEpic`, `internal.tickets.setStatus`, `internal.runs.create`, `internal.runs.finish`, `internal.messages.append`.
- Produces: `internal.workflows.executeApproved`; `internal.agents.runOne({ticketId, agentType})`; public `api.orchestrator.runApproved({epicId})`.

- [ ] **Step 1: Install + register the workflow component**

```bash
cd frontend && npm install @convex-dev/workflow
```
```typescript
// frontend/convex/convex.config.ts
import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(workflow, { maxParallelism: 10 });
export default app;
```

- [ ] **Step 2: Stubbed runOne action** (owns all DB writes; agent call comes in Task 5)

```typescript
// frontend/convex/agents.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { agentType } from "./validators";

export const runOne = internalAction({
  args: { ticketId: v.id("tickets"), agentType },
  handler: async (ctx, { ticketId, agentType }) => {
    const runId = await ctx.runMutation(internal.runs.create, { ticketId, agentType });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "running" });
    for (const line of [
      `${agentType}-agent picked up the ticket`,
      "generating files…",
      "opening pull request…",
    ]) {
      await ctx.runMutation(internal.messages.append, { ticketId, role: "agent", content: line });
      await new Promise((r) => setTimeout(r, 900)); // visible streaming; remove in Task 5
    }
    await ctx.runMutation(internal.runs.finish, {
      runId,
      prUrl: "https://github.com/example/demo/pull/1",
    });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
  },
});
```

- [ ] **Step 3: Workflow — fan out in parallel**

```typescript
// frontend/convex/workflows.ts
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";

export const workflow = new WorkflowManager(components.workflow);

export const executeApproved = workflow.define({
  args: { epicId: v.id("epics") },
  handler: async (step, { epicId }): Promise<void> => {
    const tickets = await step.runQuery(internal.tickets.approvedForEpic, { epicId });
    await Promise.all(
      tickets.map((t) =>
        step.runAction(internal.agents.runOne, { ticketId: t._id, agentType: t.agentType }),
      ),
    );
  },
});
```

- [ ] **Step 4: runApproved — start the workflow (public seam)**

```typescript
// frontend/convex/orchestrator.ts
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { workflow } from "./workflows";

export const runApproved = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    await workflow.start(ctx, internal.workflows.executeApproved, { epicId });
  },
});
```

- [ ] **Step 5: Verify parallelism live** — push, open the Convex dashboard data view for `runs`/`messages`, then trigger against the seeded epic:

```bash
cd frontend && npx convex dev --once
npx convex run orchestrator:runApproved '{"epicId":"<EPIC_ID>"}'
npx convex data runs   # re-run a few times within ~3s
```
Expected: four `runs` rows appear near-simultaneously, each flips `running -> done` with a `prUrl`; `messages` stream in interleaved across the four tickets (not one ticket finishing before the next starts). This interleaving IS the proof of parallelism — confirm it before moving on, and hand the epic id to your teammate so they can build the board.

- [ ] **Step 6: Commit**

```bash
git add frontend/convex frontend/package.json frontend/package-lock.json
git commit -m "feat(convex): parallel executeApproved workflow + stubbed runOne (live board)"
```

---

### Task 3: FastAPI agent service — base agent + 4 hardcoded configs (Claude)

**Files:**
- Create: `backend/app/agents/configs.py`, `backend/app/agents/base.py`, `backend/app/agents/__init__.py`
- Create: `backend/app/api/agents.py`, `backend/tests/test_agents.py`
- Modify: `backend/app/main.py` (mount agents router), `backend/pyproject.toml` (add `anthropic`, `httpx`)

**Interfaces:**
- Produces: `run_agent(agent_type: str, title: str, body: str) -> dict` returning `{"log": list[str], "prUrl": str | None, "diff": str | None}`.
- Produces: `POST /agents/run` accepting `{agentType, title, body}` and returning that dict.

- [ ] **Step 1: Add dependencies**

```bash
cd backend && uv add "anthropic>=0.116" "httpx>=0.27"
```

- [ ] **Step 2: Hardcoded agent configs**

```python
# backend/app/agents/configs.py
AGENT_CONFIGS: dict[str, dict[str, str]] = {
    "ui": {
        "filename": "components/GeneratedButton.tsx",
        "system": "You are a UI agent. Output ONLY the contents of a single small React component file. No prose, no markdown fences.",
    },
    "swe": {
        "filename": "generated/handler.py",
        "system": "You are a backend SWE agent. Output ONLY the contents of a single small Python function file. No prose, no markdown fences.",
    },
    "ds": {
        "filename": "generated/analysis.py",
        "system": "You are a data science agent. Output ONLY a single small Python script that prints a summary. No prose, no markdown fences.",
    },
    "ml": {
        "filename": "generated/model.py",
        "system": "You are an ML agent. Output ONLY a single small Python file with a placeholder scoring function. No prose, no markdown fences.",
    },
}
```

- [ ] **Step 3: base.py — one base agent, four configs**

```python
# backend/app/agents/base.py
import anthropic

from app.agents.configs import AGENT_CONFIGS
from app.github import open_pr

_client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY


def run_agent(agent_type: str, title: str, body: str) -> dict:
    cfg = AGENT_CONFIGS[agent_type]
    log = [f"{agent_type}-agent starting on: {title}"]

    resp = _client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1500,
        system=cfg["system"],
        messages=[{"role": "user", "content": f"Ticket: {title}\n\n{body}\n\nProduce the file."}],
    )
    file_body = next((b.text for b in resp.content if b.type == "text"), "").strip()
    log.append(f"generated {cfg['filename']} ({len(file_body)} chars)")

    try:
        pr_url = open_pr(path=cfg["filename"], content=file_body, title=f"[{agent_type}] {title}")
        log.append(f"opened PR: {pr_url}")
        return {"log": log, "prUrl": pr_url, "diff": None}
    except Exception as e:  # 40-min fallback: return the diff instead of a PR
        log.append(f"PR failed ({e}); returning diff")
        return {"log": log, "prUrl": None, "diff": file_body}
```

- [ ] **Step 4: /agents/run endpoint**

```python
# backend/app/api/agents.py
from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.base import run_agent

router = APIRouter(prefix="/agents")


class RunRequest(BaseModel):
    agentType: str
    title: str
    body: str


class RunResult(BaseModel):
    log: list[str]
    prUrl: str | None = None
    diff: str | None = None


@router.post("/run", response_model=RunResult)
def run(req: RunRequest) -> RunResult:
    return RunResult(**run_agent(req.agentType, req.title, req.body))
```

- [ ] **Step 5: Mount the router** in `backend/app/main.py` — add after the existing `app.include_router(router)`:

```python
from app.api.agents import router as agents_router
app.include_router(agents_router)
```

- [ ] **Step 6: Test run_agent with the network mocked** (isolates config/plumbing from Claude + GitHub)

```python
# backend/tests/test_agents.py
from unittest.mock import patch, MagicMock
from app.agents import base


def test_run_agent_returns_pr_url_on_success():
    fake_msg = MagicMock()
    fake_msg.content = [MagicMock(type="text", text="print('hi')")]
    with patch.object(base._client.messages, "create", return_value=fake_msg), \
         patch.object(base, "open_pr", return_value="https://github.com/x/y/pull/7"):
        out = base.run_agent("swe", "Add health", "expose /healthz")
    assert out["prUrl"] == "https://github.com/x/y/pull/7"
    assert out["diff"] is None
    assert any("opened PR" in line for line in out["log"])


def test_run_agent_falls_back_to_diff_when_pr_fails():
    fake_msg = MagicMock()
    fake_msg.content = [MagicMock(type="text", text="CODE")]
    with patch.object(base._client.messages, "create", return_value=fake_msg), \
         patch.object(base, "open_pr", side_effect=RuntimeError("401")):
        out = base.run_agent("ui", "Add button", "primary login button")
    assert out["prUrl"] is None
    assert out["diff"] == "CODE"
```

```bash
cd backend && uv run pytest tests/test_agents.py -v
```
Expected: both tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents backend/app/api/agents.py backend/app/main.py backend/tests/test_agents.py backend/pyproject.toml backend/uv.lock
git commit -m "feat(agents): base agent + 4 hardcoded configs + /agents/run"
```

---

### Task 4: GitHub PR tool (with diff fallback)

**Files:**
- Create: `backend/app/github.py`, `backend/tests/test_github.py`
- Modify: `backend/.env.example` (document GITHUB_* vars)

**Interfaces:**
- Produces: `open_pr(path: str, content: str, title: str) -> str` (returns the PR `html_url`; raises on any GitHub error so `run_agent` can fall back to `diff`).

- [ ] **Step 1: open_pr — branch ref → PUT file (commits) → POST pulls**

```python
# backend/app/github.py
import base64
import os
import time

import httpx

_API = "https://api.github.com"


def _cfg() -> dict[str, str]:
    return {
        "owner": os.environ["GITHUB_OWNER"],
        "repo": os.environ["GITHUB_REPO"],
        "base": os.environ.get("GITHUB_BASE", "main"),
        "token": os.environ["GITHUB_TOKEN"],
    }


def open_pr(path: str, content: str, title: str) -> str:
    c = _cfg()
    branch = f"agent/{int(time.time() * 1000)}"
    headers = {"Authorization": f"Bearer {c['token']}", "Accept": "application/vnd.github+json"}
    repo = f"{_API}/repos/{c['owner']}/{c['repo']}"

    with httpx.Client(headers=headers, timeout=30) as client:
        ref = client.get(f"{repo}/git/ref/heads/{c['base']}")
        ref.raise_for_status()
        base_sha = ref.json()["object"]["sha"]

        client.post(f"{repo}/git/refs", json={"ref": f"refs/heads/{branch}", "sha": base_sha}).raise_for_status()

        client.put(
            f"{repo}/contents/{path}",
            json={
                "message": f"agent: {title}",
                "content": base64.b64encode(content.encode()).decode(),
                "branch": branch,
            },
        ).raise_for_status()

        pr = client.post(
            f"{repo}/pulls",
            json={"title": title, "head": branch, "base": c["base"], "body": "Autonomous agent PR"},
        )
        pr.raise_for_status()
        return pr.json()["html_url"]
```

- [ ] **Step 2: Test the happy path with httpx mocked** (via `respx` or a transport stub)

```bash
cd backend && uv add --dev respx pytest
```
```python
# backend/tests/test_github.py
import os
import httpx
import respx
from app import github


@respx.mock
def test_open_pr_returns_html_url(monkeypatch):
    monkeypatch.setenv("GITHUB_OWNER", "me")
    monkeypatch.setenv("GITHUB_REPO", "throwaway")
    monkeypatch.setenv("GITHUB_TOKEN", "t")
    base = "https://api.github.com/repos/me/throwaway"
    respx.get(f"{base}/git/ref/heads/main").mock(
        return_value=httpx.Response(200, json={"object": {"sha": "abc"}}))
    respx.post(f"{base}/git/refs").mock(return_value=httpx.Response(201, json={}))
    respx.put(respx.patterns.M(url__startswith=f"{base}/contents/")).mock(
        return_value=httpx.Response(201, json={}))
    respx.post(f"{base}/pulls").mock(
        return_value=httpx.Response(201, json={"html_url": "https://github.com/me/throwaway/pull/3"}))

    url = github.open_pr(path="generated/x.py", content="print(1)", title="test")
    assert url == "https://github.com/me/throwaway/pull/3"
```

```bash
cd backend && uv run pytest tests/test_github.py -v
```
Expected: PASS.

- [ ] **Step 3: Live smoke test against a THROWAWAY repo** (real PAT with `repo` scope; this is the go/no-go decision point at ~40 min):

```bash
cd backend
# set GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN, GITHUB_BASE in .env first
uv run python -c "from app.github import open_pr; print(open_pr('generated/smoke.py','print(1)','smoke test'))"
```
Expected: prints a real PR URL. If auth fights past ~40 min, stop here and rely on the `diff` fallback (Task 3 already handles it) — do not keep debugging GitHub.

- [ ] **Step 4: Commit**

```bash
git add backend/app/github.py backend/tests/test_github.py backend/.env.example backend/pyproject.toml backend/uv.lock
git commit -m "feat(github): open_pr branch->file->PR with diff fallback"
```

---

### Task 5: Wire runOne → FastAPI (replace the stub)

**Files:**
- Modify: `frontend/convex/agents.ts`
- Set: Convex dashboard env var `AGENT_SERVICE_URL`

**Interfaces:**
- Consumes: `POST {AGENT_SERVICE_URL}/agents/run` (Task 3).
- Unchanged seam: `internal.agents.runOne` signature stays `{ticketId, agentType}` so the workflow and UI are untouched.

- [ ] **Step 1: Replace the stub body with the real delegation**

```typescript
// frontend/convex/agents.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { agentType } from "./validators";

export const runOne = internalAction({
  args: { ticketId: v.id("tickets"), agentType },
  handler: async (ctx, { ticketId, agentType }) => {
    const ticket = await ctx.runQuery(internal.tickets.get, { ticketId });
    if (!ticket) return;

    const runId = await ctx.runMutation(internal.runs.create, { ticketId, agentType });
    await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "running" });
    await ctx.runMutation(internal.messages.append, {
      ticketId,
      role: "system",
      content: `dispatched to ${agentType}-agent`,
    });

    try {
      const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType, title: ticket.title, body: ticket.body }),
      });
      if (!res.ok) throw new Error(`agent service ${res.status}`);
      const data: { log: string[]; prUrl?: string; diff?: string } = await res.json();

      for (const line of data.log) {
        await ctx.runMutation(internal.messages.append, { ticketId, role: "agent", content: line });
      }
      await ctx.runMutation(internal.runs.finish, {
        runId,
        prUrl: data.prUrl ?? undefined,
        diff: data.diff ?? undefined,
      });
      await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
    } catch (e) {
      await ctx.runMutation(internal.messages.append, {
        ticketId,
        role: "system",
        content: `agent failed: ${String(e)}`,
      });
      await ctx.runMutation(internal.runs.finish, { runId, diff: "agent error" });
      await ctx.runMutation(internal.tickets.setStatus, { ticketId, status: "done" });
    }
  },
});
```

- [ ] **Step 2: Expose FastAPI + set the Convex env var**

```bash
# terminal A: run FastAPI
cd backend && uv run uvicorn app.main:app --port 8000
# terminal B: tunnel it (Convex cloud cannot reach localhost)
ngrok http 8000    # copy the https URL
# terminal C: point Convex at the tunnel
cd frontend && npx convex env set AGENT_SERVICE_URL https://<your-ngrok-subdomain>.ngrok.app
```

- [ ] **Step 3: End-to-end verify on seeded tickets**

```bash
cd frontend
npx convex run seed:seedDemo '{}'          # fresh epic (or reuse Task 0's)
npx convex run orchestrator:runApproved '{"epicId":"<EPIC_ID>"}'
npx convex data runs                        # each run gets a real prUrl (or a diff on fallback)
```
Expected: real PRs appear on the throwaway repo (or `runs.diff` is populated if GitHub is on fallback), and `messages` show the real agent log lines. If the tunnel fights, temporarily revert `runOne` to the Task 2 stub — the seam is identical and the board still demos.

- [ ] **Step 4: Commit**

```bash
git add frontend/convex/agents.ts
git commit -m "feat(convex): runOne delegates to FastAPI agent service"
```

---

### Task 6: Decompose + classify (FastAPI /decompose + Convex action with seeded fallback)

**Files:**
- Modify: `backend/app/api/agents.py`, `backend/app/agents/base.py`
- Modify: `frontend/convex/orchestrator.ts`

**Interfaces:**
- Produces: `POST /decompose {title, body} -> {tickets: [{title, body, agentType}]}` (one model call returns tickets WITH types).
- Produces: `api.orchestrator.proposeDecomposition({epicId})` — calls `/decompose`, inserts tickets as `proposed`; on any failure inserts a hardcoded known-good decomposition.

- [ ] **Step 1: decompose_epic in base.py** (structured output; enum-typed)

```python
# backend/app/agents/base.py  (append)
import json

_DECOMPOSE_SYSTEM = (
    "You are a PM agent. Decompose the epic into 3-4 small tickets. "
    "Return ONLY JSON: {\"tickets\":[{\"title\":str,\"body\":str,"
    "\"agentType\":\"ui\"|\"ml\"|\"ds\"|\"swe\"}]}. No prose."
)


def decompose_epic(title: str, body: str) -> list[dict]:
    resp = _client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1200,
        system=_DECOMPOSE_SYSTEM,
        messages=[{"role": "user", "content": f"Epic: {title}\n\n{body}"}],
    )
    text = next((b.text for b in resp.content if b.type == "text"), "{}")
    tickets = json.loads(text)["tickets"]
    valid = {"ui", "ml", "ds", "swe"}
    return [t for t in tickets if t.get("agentType") in valid][:4]
```

- [ ] **Step 2: /decompose endpoint** (append to `backend/app/api/agents.py`)

```python
class DecomposeRequest(BaseModel):
    title: str
    body: str


class Ticket(BaseModel):
    title: str
    body: str
    agentType: str


class DecomposeResult(BaseModel):
    tickets: list[Ticket]


@router.post("/decompose", response_model=DecomposeResult)
def decompose(req: DecomposeRequest) -> DecomposeResult:
    from app.agents.base import decompose_epic
    return DecomposeResult(tickets=[Ticket(**t) for t in decompose_epic(req.title, req.body)])
```
Note: `/decompose` is under the same `/agents` router prefix → path is `POST /agents/decompose`.

- [ ] **Step 3: proposeDecomposition action with seeded fallback** (append to `orchestrator.ts`)

```typescript
// frontend/convex/orchestrator.ts  (append)
import { action } from "./_generated/server";

const FALLBACK_TICKETS = [
  { agentType: "ui" as const, title: "Login button", body: "Primary login button in header." },
  { agentType: "swe" as const, title: "Health endpoint", body: "GET /healthz returns ok." },
  { agentType: "ds" as const, title: "Signup summary", body: "Daily signup counts from CSV." },
  { agentType: "ml" as const, title: "Churn stub", body: "Placeholder churn scorer." },
];

export const proposeDecomposition = action({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const epic = await ctx.runQuery(internal.epics.get, { epicId });
    if (!epic) return;
    let tickets = FALLBACK_TICKETS as { agentType: "ui" | "ml" | "ds" | "swe"; title: string; body: string }[];
    try {
      const res = await fetch(`${process.env.AGENT_SERVICE_URL}/agents/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: epic.title, body: epic.body }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickets) && data.tickets.length) tickets = data.tickets;
      }
    } catch {
      /* fall through to FALLBACK_TICKETS */
    }
    for (const t of tickets) {
      await ctx.runMutation(internal.tickets.insertProposed, { epicId, ...t });
    }
  },
});
```

- [ ] **Step 4: Supporting internal functions** — add `internal.epics.get` (`frontend/convex/epics.ts`, new file) and `internal.tickets.insertProposed`:

```typescript
// frontend/convex/epics.ts
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
export const get = internalQuery({
  args: { epicId: v.id("epics") },
  handler: (ctx, { epicId }) => ctx.db.get(epicId),
});
```
```typescript
// frontend/convex/tickets.ts  (append)
import { internalMutation } from "./_generated/server";  // already imported above
import { agentType } from "./validators";
export const insertProposed = internalMutation({
  args: { epicId: v.id("epics"), title: v.string(), body: v.string(), agentType },
  handler: (ctx, a) => ctx.db.insert("tickets", { ...a, status: "proposed" }),
});
```

- [ ] **Step 5: Verify decompose (real + fallback)**

```bash
cd frontend && npx convex dev --once
# create a bare epic id first via submitEpic (Task 7) OR insert one in the dashboard, then:
npx convex run orchestrator:proposeDecomposition '{"epicId":"<EPIC_ID>"}'
npx convex data tickets   # expect proposed tickets with valid agentTypes
# Fallback check: unset AGENT_SERVICE_URL, re-run — still yields 4 proposed tickets.
```
Expected: proposed tickets appear; with the service down, the seeded fallback still populates 4.

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/base.py backend/app/api/agents.py frontend/convex/orchestrator.ts frontend/convex/epics.ts frontend/convex/tickets.ts
git commit -m "feat: decompose epic -> classified tickets with seeded fallback"
```

---

### Task 7: Complete the public seam — submitEpic / approveTickets

**Files:**
- Modify: `frontend/convex/orchestrator.ts`

**Interfaces:**
- Produces: `api.orchestrator.submitEpic({title, body}) -> epicId`; `api.orchestrator.approveTickets({epicId})` (flips every `proposed` ticket to `approved`).

- [ ] **Step 1: submitEpic + approveTickets** (append to `orchestrator.ts`)

```typescript
// frontend/convex/orchestrator.ts  (append)
export const submitEpic = mutation({
  args: { title: v.string(), body: v.string() },
  handler: (ctx, { title, body }) =>
    ctx.db.insert("epics", { title, body, status: "draft" }),
});

export const approveTickets = mutation({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => {
    const tickets = await ctx.db
      .query("tickets").withIndex("by_epic", (q) => q.eq("epicId", epicId)).collect();
    for (const t of tickets) {
      if (t.status === "proposed") await ctx.db.patch(t._id, { status: "approved" });
    }
  },
});
```

- [ ] **Step 2: Verify the whole seam end-to-end** (this is the rehearsed demo path)

```bash
cd frontend
EPIC=$(npx convex run orchestrator:submitEpic '{"title":"Ship MVP","body":"dashboard + api"}')
npx convex run orchestrator:proposeDecomposition "{\"epicId\":$EPIC}"
npx convex run orchestrator:approveTickets "{\"epicId\":$EPIC}"
npx convex run orchestrator:runApproved "{\"epicId\":$EPIC}"
npx convex data runs   # parallel runs land with PRs/diffs
```
Expected: submit → propose (proposed tickets) → approve (approved) → run (parallel runs + PRs). This is the full human-as-PM flow the judges see.

- [ ] **Step 3: Commit**

```bash
git add frontend/convex/orchestrator.ts
git commit -m "feat(convex): submitEpic + approveTickets complete the UI seam"
```

---

### Task 8 (STRETCH): Reviewer pass — bounce a ticket back once

Only if Tasks 0–7 are solid. A reviewer agent checks a completed run and can bounce a ticket `review -> running` once.

**Files:**
- Modify: `frontend/convex/agents.ts`, `frontend/convex/workflows.ts`, `backend/app/api/agents.py`, `backend/app/agents/base.py`

**Interfaces:**
- Produces: `POST /review {title, body, diff|prUrl} -> {approved: bool, note: str}`; `internal.agents.reviewOne({ticketId})` sets `review`, calls `/review`, and on rejection re-runs `runOne` once (guard with a `reviewed` flag in the run to prevent loops).

- [ ] **Step 1: `/review` endpoint + `review_run` in base.py** — one Claude call returning `{"approved": bool, "note": str}` (mirror the `/decompose` JSON pattern; system prompt: "You are a reviewer. Return ONLY JSON {approved:bool, note:str}.").
- [ ] **Step 2: `reviewOne` action** — set ticket `review`, append the reviewer note to `messages`, and if `!approved` and not yet bounced, set ticket back to `running` and call `runOne` a second time; then `done`. Track a boolean so it bounces at most once.
- [ ] **Step 3: Chain in the workflow** — after each `runOne` resolves, `step.runAction(internal.agents.reviewOne, {ticketId})` (keep it inside the same `Promise.all` map so reviews also run in parallel).
- [ ] **Step 4: Verify** a rejected ticket visibly goes `running -> review -> running -> done` on the board, exactly once.
- [ ] **Step 5: Commit** `feat: stretch reviewer pass with single bounce`.

---

## Notes for the executor

- **Demo-value ordering is load-bearing.** Do Task 2 (parallel board on seeded data) before Tasks 3–7. If you run low on time, a working Task 2 + Task 5 (real agents) + Task 7 (seam) is a complete, impressive demo; Task 6's live decompose and Task 8 are gravy.
- **The FastAPI↔Convex boundary is the whole risk surface.** It's isolated to `runOne` and `proposeDecomposition`. Both have a working fallback (stub / seeded tickets) so the demo never hard-blocks on the tunnel or GitHub auth.
- **Leave-it-integratable (north star):** the teammate needs only the epic id and these six public functions — `submitEpic`, `proposeDecomposition`, `approveTickets`, `runApproved`, and the queries `tickets.listByEpic` / `runs.listByEpic` / `messages.listByTicket`. Everything else is `internal` and invisible to them. Keep it that way.
