# Deploy Runbook — one public link

Three hosts, all with free tiers, producing one public URL (the Vercel link):

- **Convex Cloud** — the reactive brain + orchestrator (`frontend/convex/`). Managed; one command.
- **Railway** — the FastAPI agent service (`backend/`). Must be a **container**: it shells out to `git`, `gh`, and the Claude Code CLI, and runs jobs for minutes. Render and Fly.io work identically.
- **Vercel** — the Next.js frontend (`frontend/`). The public link.

Plus a **GitHub org** the agents create repos in, and an **Anthropic API key**.

> The configs have a dependency cycle: Convex needs the Railway URL, Railway needs the Convex URL. The order below resolves it. Go top to bottom.

---

## 0. Prereqs (once)

```bash
# accounts: convex.dev, railway.app (or render.com), vercel.com, github.com
npm i -g vercel                 # optional; the dashboard works too

# one shared secret for the Convex <-> FastAPI callbacks
openssl rand -hex 32            # -> CALLBACK_SECRET (the SAME value in both places)
```

**GitHub token.** A repo is created per epic, so the token needs repo-creation
rights. Use a **fine-grained PAT** whose *resource owner is the throwaway org*:

- github.com/settings/personal-access-tokens/new
- Resource owner: **your throwaway org** (a token owned by your personal account
  can never act on org resources, whatever permissions you tick)
- Repository access: **All repositories** (the repos don't exist yet)
- Organization → **Administration: Read and write** (creates repos)
- Repository → **Contents: Read and write**, **Pull requests: Read and write**

The org may also need **Settings → Third-party Access → Personal access tokens
→ Allow access**, or the request sits pending approval.

---

## 1. Convex (deploy the brain, get its URL)

```bash
cd frontend
npm install
npx convex deploy               # provisions a PROD deployment, prints its URL
#   -> copy the printed URL (e.g. https://acoustic-cat-123.convex.cloud) = CONVEX_URL

npx convex env set --prod CALLBACK_SECRET <the-openssl-secret>
# AGENT_SERVICE_URL comes in step 3, once Railway has a URL
```

---

## 2. FastAPI agent service on Railway (get its public URL)

Railway builds `backend/Dockerfile` automatically.

1. railway.app → **New Project → Deploy from GitHub repo** → pick this repo.
2. Service **Settings** → **Root Directory = `backend`**.
3. **Variables**:
   ```
   ANTHROPIC_API_KEY = <your Anthropic key>
   GITHUB_TOKEN      = <the fine-grained PAT from step 0>
   GITHUB_ORG        = <your throwaway org>
   CONVEX_URL        = <CONVEX_URL from step 1>
   CALLBACK_SECRET   = <the SAME openssl secret>
   AGENT_MODEL       = claude-haiku-4-5     # optional; omit for the default
   ```
4. Settings → **Networking → Generate Domain** → copy the public URL
   = **AGENT_SERVICE_URL**.
5. Check the deploy logs show `Uvicorn running`.

> **The domain's target port must match what uvicorn binds.** `entrypoint.sh`
> honors `$PORT`, and Railway defaults it to **8080** — so a domain generated
> against port 8000 returns 502 even though the container is healthy and the
> logs say `Uvicorn running`. Either generate the domain on 8080, or pin
> `PORT=8000` in the service variables. Mismatched-port 502s look exactly like
> a crashed app; check the bound port in the logs before debugging anything else.

From the CLI the whole thing is:

```bash
cd backend
railway init -n cycles-agent-service            # pick a workspace
railway add -s agent                            # empty service
railway variables --service agent --set "ANTHROPIC_API_KEY=..." # ...and the rest
railway domain --service agent --port 8000
railway up --service agent --detach
```

> `backend/.dockerignore` keeps `.env` and `.venv` out of the image — the
> Dockerfile ends in `COPY . .`, so without it your token ships inside a layer.

---

## 3. Point Convex at the agent service

```bash
cd frontend
npx convex env set --prod AGENT_SERVICE_URL <the Railway URL from step 2>
```

The loop is now closed: Convex → Railway (`/agents/repos/ensure`, then
`/agents/run`) → agents edit the epic's repo and open PRs → Railway → Convex
callbacks (`messages:appendPublic` / `runs:finishPublic`) → live board.

---

## 4. Frontend on Vercel (the public link)

```bash
cd frontend
vercel --prod
#   -> Root Directory = frontend, framework Next.js (auto-detected)
#   -> env var NEXT_PUBLIC_CONVEX_URL = <CONVEX_URL from step 1>
```

---

## 5. Smoke test the whole loop

From `frontend/`, driving the public seam via the CLI — no UI needed to prove it:

```bash
EPIC=$(npx convex run --prod orchestrator:submitEpic \
  '{"title":"Ship MVP","body":"add a health endpoint and a README note"}' | tr -d '"')

npx convex run --prod orchestrator:proposeDecomposition "{\"epicId\":\"$EPIC\"}"
#   -> {"count":4,"usedFallback":false}   <- `usedFallback:true` means Convex
#      could not reach Railway; fix AGENT_SERVICE_URL before going further

npx convex run --prod orchestrator:approveAndRun "{\"epicId\":\"$EPIC\"}"

# watch it happen
npx convex run --prod tickets:listByEpic  "{\"epicId\":\"$EPIC\"}"
npx convex run --prod messages:listByEpic "{\"epicId\":\"$EPIC\"}"
npx convex run --prod epics:get           "{\"epicId\":\"$EPIC\"}"   # .repoUrl
```

Then open the epic's repo — the PRs are on its Pull requests tab.

---

## Gotchas (the ones that actually bite)

- **`CALLBACK_SECRET` must be byte-identical** in Convex (`--prod`) and Railway.
  If they differ every callback throws `unauthorized`, the failure is swallowed
  on the agent side, and tickets hang on `running` with no log lines.
- **`usedFallback: true` is the tell** that Convex can't reach the agent service.
  Decomposition still returns a canned ticket set, so the UI looks fine while
  nothing real is happening. Check it during any smoke test.
- **The container must run as a non-root user.** The agents use
  `permission_mode="bypassPermissions"`, and the Claude Code CLI hard-refuses
  that as root: `--dangerously-skip-permissions cannot be used with root/sudo
  privileges`. Containers default to root, so every agent dies instantly while
  `/api/health` returns 200 and the service looks fine — the only symptom is
  runs finishing suspiciously fast with an `agent run failed` diff. The
  Dockerfile creates and switches to `agent`; don't undo it. This cannot be
  reproduced locally, where you aren't root.
- **In-flight runs do not survive a restart.** FastAPI `BackgroundTasks` are
  in-process: a redeploy, crash, or scale-down mid-run leaves that ticket
  `running` forever, because nothing calls `finish_run`. There is no watchdog.
  Re-run the epic. For anything beyond a demo this wants a real queue, or a
  reaper that finalizes runs older than N minutes.
- **Size the box for concurrency.** Each ticket spawns a full Claude Code agent
  with its own git checkout. The workflow fans out up to `maxParallelism`
  (`frontend/convex/workflows.ts`) — on a small instance drop it to 3–4 and give
  it ≥1–2 GB RAM, or the agents thrash.
- **Free tiers idle out.** A cold Railway box adds startup latency to the first
  dispatch; Convex actions have their own timeout, so a very cold start can make
  the first run fail while later ones succeed.
- **The token's blast radius is the agents' blast radius.** They run with
  `bypassPermissions` and a shell inside the checkout. `repo.py` keeps the
  credential out of `.git/config` and scrubs it from logs, but scope the PAT to
  a throwaway org regardless.
- **`agentType` is the fixed 12**: `ui, ux, swe, mobile, devops, qa, security,
  ml, ds, dataeng, pm, docs`. Kept in sync across `convex/validators.ts`,
  `backend/app/agents/configs.py`, and `frontend/src/lib/orchestrator.ts`.
