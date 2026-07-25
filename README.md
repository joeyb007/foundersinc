# Founders Inc

Autonomous SDLC orchestrator. A human submits an **epic**; a PM agent decomposes
it into **tickets**; the human approves the set (the gate); specialized **agents**
execute their tickets in parallel and each opens a real GitHub **PR**.

```
foundersinc/
├── frontend/
│   ├── convex/   # the brain: schema, queries, mutations, parallel Workflow
│   └── src/      # the surface: Next.js 16, live via Convex subscriptions
└── backend/      # FastAPI: the agent bodies (Claude Agent SDK + git/gh)
```

## How the three pieces connect

Convex is the substrate and the only thing the UI talks to. FastAPI is reached
**only** from Convex, never from the browser.

```
browser ──useQuery/useMutation──▶ Convex ──fetch──▶ FastAPI ──▶ Claude Agent SDK
   ▲                                 ▲                 │              │
   └──── live subscriptions ─────────┘                 │         git + gh pr
                                                       │              │
                       secret-guarded public mutations │◀─────────────┘
                    (messages:appendPublic, runs:finishPublic)
```

A coding agent runs for minutes — far longer than a Convex action should stay
alive. So `agents.runOne` only *dispatches*: it creates the run row, flips the
ticket to `running`, and POSTs to FastAPI without awaiting. The agent service
streams progress and the final PR back through the two secret-guarded callbacks,
and those writes are what light up the board in real time.

## Quick start

**1. Convex** (provisions the deployment, generates `convex/_generated`):

```bash
cd frontend && npm install && npx convex dev
```

**2. Backend** (http://localhost:8000):

```bash
cd backend && uv sync
cp .env.example .env    # fill in the values below
uv run uvicorn app.main:app --reload --port 8000
```

**3. Expose the backend.** Convex deployments run in Convex cloud and **cannot
reach `localhost`**, so the agent service needs a public URL:

```bash
cloudflared tunnel --url http://localhost:8000    # or: ngrok http 8000
npx convex env set AGENT_SERVICE_URL https://<your-tunnel-url>
```

**4. Frontend** (http://localhost:3000):

```bash
cd frontend && npm run dev
```

Open http://localhost:3000, drop in a spec (`docs/sample-epic.md` works), hand it
to the PM agent, then approve the ticket set on the board.

## Configuration

| Where | Key | What it's for |
| --- | --- | --- |
| `frontend/.env.local` | `NEXT_PUBLIC_CONVEX_URL` | Written by `convex dev`. The UI subscribes here. |
| `frontend/.env.local` | `NEXT_PUBLIC_TARGET_REPO` | Cosmetic: the repo shown on the board. |
| Convex env | `AGENT_SERVICE_URL` | Public URL of the FastAPI service. |
| Convex env | `CALLBACK_SECRET` | Must match `backend/.env`. |
| `backend/.env` | `ANTHROPIC_API_KEY` | Agent SDK coding agents + the PM decompose call. |
| `backend/.env` | `TARGET_REPO` | **Throwaway repo only** — agents get `bypassPermissions` inside a per-run clone of it. |
| `backend/.env` | `CONVEX_URL` / `CALLBACK_SECRET` | Where the callbacks go, and the shared secret. |

`gh` must also be authenticated on the backend host for `gh pr create`.

Set Convex env vars with `npx convex env set KEY value` (not `.env.local` — they
are read by functions running in Convex cloud).

## Graceful degradation

Every external hop has a fallback, so a broken link degrades instead of hanging:

- PM agent unreachable → `proposeDecomposition` uses a built-in ticket set and
  the UI says so.
- Dispatch fails → the run is finalized immediately, so the board never shows a
  ticket stuck at "running".
- `gh pr create` fails → the agent returns a raw `git diff`, shown in the ticket
  panel in place of the PR link.

## Per-app docs

- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
- [docs/ctd.md](docs/ctd.md) — the project thesis and hard scope rules
