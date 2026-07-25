# E2E Deploy Runbook — public hostable link

Three hosts, all with free tiers, producing one public URL (the Vercel link) that judges click:

- **Convex Cloud** — the reactive brain + orchestrator (`frontend/convex/`). Managed; one command.
- **Railway** — the FastAPI agent service (`backend/`). A container, because it runs the Claude Code CLI + git + gh. (Render or Fly.io work the same way.)
- **Vercel** — the Next.js frontend (`frontend/`). The public link.
- Plus a **throwaway GitHub repo** (the agents edit + PR into it) and an **Anthropic API key**.

> The three configs have a small dependency cycle (Convex needs the Railway URL; Railway needs the Convex URL). The order below resolves it. Do it top to bottom.

---

## 0. Prereqs (once)

```bash
# accounts: convex.dev, railway.app (or render.com), vercel.com, github.com
npm i -g vercel                 # Vercel CLI (optional; dashboard works too)

# a throwaway repo the agents will edit — must have at least one commit on main
gh repo create founders-agent-sandbox --public --clone --add-readme
#   -> note its URL, e.g. https://github.com/<you>/founders-agent-sandbox

# a GitHub PAT with `repo` scope (for the hosted agent box):  github.com/settings/tokens
#   -> this becomes GH_TOKEN

# one shared secret for the Convex<->FastAPI callbacks:
openssl rand -hex 32            # -> this becomes CALLBACK_SECRET (use the SAME value everywhere)
```

---

## 1. Convex (deploy the brain, get its URL)

```bash
cd frontend
npm install
npx convex deploy               # logs in, provisions a PROD deployment, prints the deployment URL
#   -> copy the printed URL  (e.g. https://acoustic-cat-123.convex.cloud)  = CONVEX_URL

# set Convex production env vars (dashboard also works: Settings -> Environment Variables)
npx convex env set --prod CALLBACK_SECRET <the-openssl-secret>
# AGENT_SERVICE_URL is set in step 3, once Railway gives us a URL
```

---

## 2. FastAPI agent service on Railway (get its public URL)

Railway builds `backend/Dockerfile` automatically.

1. railway.app → **New Project → Deploy from GitHub repo** → pick this repo.
2. In the service **Settings**: set **Root Directory = `backend`** (so it uses `backend/Dockerfile`).
3. **Variables** (Settings → Variables) — add:
   ```
   ANTHROPIC_API_KEY = <your Anthropic key>
   TARGET_REPO       = https://github.com/<you>/founders-agent-sandbox
   CONVEX_URL        = <the CONVEX_URL from step 1>
   CALLBACK_SECRET   = <the SAME openssl secret>
   GH_TOKEN          = <the GitHub PAT with repo scope>
   ```
4. Settings → **Networking → Generate Domain** → copy the public URL
   (e.g. `https://founders-agent-production.up.railway.app`) = **AGENT_SERVICE_URL**.
5. Redeploy if needed; check the deploy logs show `Uvicorn running`.

> Railway sets `$PORT` automatically and `entrypoint.sh` honors it. `gh auth setup-git` runs on boot from `GH_TOKEN`, so the agents can clone/push/PR headlessly.

---

## 3. Point Convex at the agent service

```bash
cd frontend
npx convex env set --prod AGENT_SERVICE_URL <the Railway URL from step 2>
```

Now the full loop is wired: Convex → Railway (`/agents/run`) → agent edits the sandbox repo + opens a PR → Railway → Convex callbacks (`appendPublic`/`finishPublic`) → live board.

---

## 4. Frontend on Vercel (the public link)

```bash
cd frontend
vercel --prod
#   -> set Root Directory = frontend, framework = Next.js (auto-detected)
#   -> add env var NEXT_PUBLIC_CONVEX_URL = <the CONVEX_URL from step 1>
#   -> Vercel prints the public URL  = YOUR SUBMISSION LINK
```

> The link renders b2's live board. b2 must have wired `ConvexProvider` with a `ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)` and be subscribing to `tickets.listByEpic` / `runs.listByEpic` / `messages.listByTicket`. That UI is their branch; b1's backend is fully deployed and reactive regardless.

---

## 5. Smoke test the whole loop

From `frontend/` (drives the public seam via the Convex CLI — no UI needed to prove it works):

```bash
EPIC=$(npx convex run --prod orchestrator:submitEpic '{"title":"Ship MVP","body":"add a health endpoint and a README note"}')
npx convex run --prod orchestrator:proposeDecomposition "{\"epicId\":$EPIC}"
npx convex run --prod orchestrator:approveTickets "{\"epicId\":$EPIC}"
npx convex run --prod orchestrator:runApproved "{\"epicId\":$EPIC}"

# watch it happen:
npx convex data --prod runs        # rows flip running -> done, prUrl fills in
npx convex data --prod messages    # agent progress streams in
# and check the sandbox repo's Pull Requests tab for real PRs
```

---

## Gotchas (the things that actually bite)

- **`CALLBACK_SECRET` must be byte-identical** in Convex (`--prod`) and Railway. If they differ, every callback 401s (silently swallowed) and tickets hang on `running`.
- **`TARGET_REPO` must be a throwaway** — agents run with `bypassPermissions` (unrestricted edit/bash) inside a fresh clone. The isolation is per-run, but never point it at anything you care about.
- **Size the Railway box for concurrency.** Each ticket spawns a full Claude Code agent. The workflow fans out up to `maxParallelism` (in `frontend/convex/convex.config.ts`) — for a small instance, drop it to `3`–`4` and use a Railway plan with ≥1–2 GB RAM, or agents will OOM/thrash.
- **No stuck-ticket watchdog.** If the Railway service restarts mid-run, that ticket stays `running` with no auto-recovery — re-run the epic.
- **b2 badge sync:** `agentType` is the fixed 12 (`ui, ux, swe, mobile, devops, qa, security, ml, ds, dataeng, pm, docs`).
