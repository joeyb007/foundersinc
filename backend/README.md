# Backend — FastAPI

## Setup

Requires [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`).

```bash
cd backend
cp .env.example .env        # optional; sensible defaults exist
uv sync                     # create venv + install deps from uv.lock
```

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

- API root: http://localhost:8000/
- Interactive docs (Swagger): http://localhost:8000/docs
- Health: http://localhost:8000/api/health

## Layout

```
app/
├── main.py          # FastAPI app + CORS, mounts the router
├── api/routes.py    # HTTP endpoints
└── core/config.py   # env-driven settings (pydantic-settings)
```

Add new endpoints in `app/api/` and register their routers in `app/main.py`.
