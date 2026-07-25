from unittest.mock import patch

from fastapi.testclient import TestClient

from app.agents.repo import RepoError
from app.main import app

REPO_URL = "https://github.com/me/fi-demo-a1b2c3.git"


def test_run_endpoint_returns_202_and_schedules_background_work():
    client = TestClient(app)
    payload = {
        "ticketId": "ticket_1",
        "runId": "run_1",
        "agentType": "swe",
        "title": "Add health endpoint",
        "body": "Expose GET /healthz",
        "repoUrl": REPO_URL,
    }

    with patch("app.api.agents._run_execute_ticket") as fake_run:
        resp = client.post("/agents/run", json=payload)

    assert resp.status_code == 202
    assert resp.json() == {"accepted": True}
    # BackgroundTasks in TestClient runs synchronously after the response is
    # built, so by the time we get here the scheduled task has already been
    # invoked once for our request with the ticket's fields.
    assert fake_run.call_count == 1
    assert fake_run.call_args.args == (
        "ticket_1",
        "run_1",
        "swe",
        "Add health endpoint",
        "Expose GET /healthz",
        REPO_URL,
    )


def test_run_endpoint_rejects_a_request_with_no_repo():
    """There is nothing to clone without it, so this must fail at the edge
    rather than as a mystifying failure inside the background job."""
    resp = TestClient(app).post(
        "/agents/run",
        json={
            "ticketId": "t",
            "runId": "r",
            "agentType": "swe",
            "title": "x",
            "body": "y",
        },
    )
    assert resp.status_code == 422


def test_repos_ensure_returns_the_created_clone_url():
    with patch("app.api.agents.ensure_repo", return_value=REPO_URL):
        resp = TestClient(app).post("/agents/repos/ensure", json={"title": "Ship the MVP"})

    assert resp.status_code == 200
    assert resp.json() == {"repoUrl": REPO_URL}


def test_repos_ensure_surfaces_a_github_failure_as_502():
    """Convex treats a non-2xx as "no repo" and reports it per ticket, so the
    status code is what stops the board showing a run that can't start."""
    with patch("app.api.agents.ensure_repo", side_effect=RepoError("could not create repo (403)")):
        resp = TestClient(app).post("/agents/repos/ensure", json={"title": "Ship the MVP"})

    assert resp.status_code == 502
    assert "403" in resp.json()["detail"]


def test_repos_ensure_reports_a_missing_token_as_500():
    with patch("app.api.agents.ensure_repo", side_effect=KeyError("GITHUB_TOKEN")):
        resp = TestClient(app).post("/agents/repos/ensure", json={"title": "Ship the MVP"})

    assert resp.status_code == 500
    assert "GITHUB_TOKEN" in resp.json()["detail"]
