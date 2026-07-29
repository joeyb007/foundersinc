# Beacon — Public Launch Kit

**Product:** Beacon is a hosted status page for small teams — one page that tells
your users whether you're up, degraded, or down, without the enterprise pricing.

**This epic:** everything needed to open Beacon's public waitlist. It is a
greenfield repo. Ship each workstream as an independent pull request.

---

## Constraints (apply to every workstream)

- **No build step.** The site is static HTML/CSS/JS served as files. No
  bundlers, no frameworks, no `npm install`.
- **No external services.** No databases, no email providers, no third-party
  APIs, no secrets. Persistence is a local JSON file.
- **Python 3.11+ / FastAPI** for anything server-side; **pytest** for tests.
  These are the only dependencies allowed.
- **Own your files.** Each workstream writes only the paths listed for it below
  so parallel work never collides.
- **The contract below is the interface.** Build against it, not against
  another workstream's code — it may not exist yet.

## The waitlist contract

All workstreams share this contract:

- `POST /api/waitlist` — body `{"email": string, "team_size": "solo" | "2-10" | "11-50" | "50+"}`.
  Returns `201 {"position": int}` on success, `422` on invalid email,
  `409` if the email is already registered.
- `GET /api/waitlist/count` — returns `200 {"count": int}`.
- Store: `data/waitlist.json`, an array of
  `{"email": string, "team_size": string, "joined_at": ISO-8601 string}`.

---

## Workstreams

### 1. Marketing site (UI)

A single landing page: hero ("Your status page. Finally simple."), three
feature blurbs (uptime checks, incident timeline, subscriber alerts), a
waitlist signup form (email + team size select), and a footer. Clean,
confident, no template look.
**Owns:** `site/index.html`, `site/styles.css`

### 2. Signup flow behavior (UX)

The form's client-side behavior as a standalone script: inline validation with
specific error copy, loading state on submit, success state showing the
waitlist position from the response, duplicate-email state, full keyboard and
screen-reader accessibility. Posts to the contract endpoint.
**Owns:** `site/form.js`

### 3. Waitlist API (SWE)

A FastAPI service implementing the contract exactly: both endpoints, JSON file
persistence with atomic writes, CORS for the static site, and a `/api/health`
endpoint. Include a `uv`/`pip` requirements file and a one-line run command.
**Owns:** `api/main.py`, `api/store.py`, `api/requirements.txt`

### 4. Abuse protection (Security)

A standalone hardening module designed to wrap the API: per-IP sliding-window
rate limiter (in-memory), strict email validation, payload size cap, and a
honeypot form-field check. Ship it as an importable FastAPI middleware/utility
module with its own unit tests and a short note on how to wire it in.
**Owns:** `api/hardening.py`, `tests/test_hardening.py`

### 5. Contract test suite (QA)

A pytest suite that verifies any implementation of the waitlist contract:
happy path, invalid emails, duplicates, count accuracy, store schema, and
concurrent-signup ordering. Tests target the contract above and must run
against `api.main:app` via FastAPI's TestClient.
**Owns:** `tests/test_waitlist_contract.py`, `tests/conftest.py`

### 6. Mobile signup screen (Mobile)

A self-contained React Native component for the same signup flow — email
field, team-size picker, submit against the contract, success/error states.
Component file only; no app scaffold, no native config, no build.
**Owns:** `mobile/SignupScreen.jsx`

### 7. CI pipeline (DevOps)

GitHub Actions workflow: on push and PR, install Python deps, run the full
pytest suite, and HTML-validate `site/index.html`. Plus a `Makefile` with
`make serve-site`, `make serve-api`, `make test`.
**Owns:** `.github/workflows/ci.yml`, `Makefile`

### 8. Signup analytics (Data)

A small script that reads `data/waitlist.json` and prints a launch report:
signups per day, cumulative total, and team-size distribution as aligned
ASCII tables. Include a tiny generator for sample data so it runs on a fresh
clone.
**Owns:** `analytics/report.py`, `analytics/sample_data.py`

### 9. Docs (Docs)

The repo's `README.md`: what Beacon is, quickstart for the site and API, the
waitlist API reference (from the contract), and a launch-day checklist.
**Owns:** `README.md`, `docs/api.md`

---

## Done means

Every workstream is an open PR with reviewable code that satisfies the
contract and its owned-files list. `make test` passes on the merged result.
