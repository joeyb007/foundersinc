# Founders Inc

Monorepo with an independently-runnable frontend and backend.

```
foundersinc/
├── frontend/   # Next.js 16 (App Router, TypeScript, Tailwind)
└── backend/    # FastAPI (Python 3.13, uv)
```

The two apps are decoupled: the frontend talks to the backend over HTTP.
Each has its own toolchain and README, so you and a teammate can each own one
side without stepping on each other.

## Quick start

Run each in its own terminal.

**Backend** (http://localhost:8000):

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend** (http://localhost:3000):

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000 — the home page fetches `/api/hello` from the
backend and shows a green "Backend connected" indicator when the two are wired
up correctly.

## How they connect

- The frontend reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`)
  and calls the backend via `src/lib/api.ts`.
- The backend allows the frontend's origin via `CORS_ORIGINS` in
  `backend/.env` (default `http://localhost:3000`).

Change ports or hosts by editing those two env values.

## Per-app docs

- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
