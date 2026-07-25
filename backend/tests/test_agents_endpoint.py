from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def test_run_endpoint_returns_202_and_schedules_background_work():
    client = TestClient(app)
    payload = {
        "ticketId": "ticket_1",
        "runId": "run_1",
        "agentType": "swe",
        "title": "Add health endpoint",
        "body": "Expose GET /healthz",
    }

    with patch("app.api.agents._run_execute_ticket") as fake_run:
        resp = client.post("/agents/run", json=payload)

    assert resp.status_code == 202
    assert resp.json() == {"accepted": True}
    # BackgroundTasks in TestClient runs synchronously after the response is
    # built, so by the time we get here the scheduled task has already been
    # invoked once for our request with the ticket's fields.
    assert fake_run.call_count == 1
    assert fake_run.call_args.args == ("ticket_1", "run_1", "swe", "Add health endpoint", "Expose GET /healthz")
