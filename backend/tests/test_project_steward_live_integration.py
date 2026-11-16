"""PS-06 integration smoke: owner-gated snapshot and nonblocking refresh.

Tests run only in a disposable combined Forge checkout. No network or
production configuration. Source-level checks alone are not deployment proof.
"""
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from lumen.project_steward import handler
from lumen.project_steward.config import ProjectStewardSettings
from lumen.project_steward.registry import ProjectRegistry


def make_app():
    settings = ProjectStewardSettings(
        owner_user_id="11111111-2222-3333-4444-555555555555",
        github_token=None,
        supabase_url=None,
        supabase_service_role_key=None,
    )
    app = FastAPI()
    app.include_router(handler.router)
    app.dependency_overrides[handler.get_steward_settings] = lambda: settings
    app.dependency_overrides[handler.get_registry] = lambda: ProjectRegistry(settings)
    app.dependency_overrides[handler.get_collector] = lambda: DummyDisabledCollector()
    return app


class DummyDisabledCollector:
    is_enabled = False


def test_anonymous_cannot_read_project_snapshot():
    client = TestClient(make_app())
    resp = client.get("/v0.1/project-steward/snapshot/v1.1")
    assert resp.status_code == 401, resp.text


def test_owner_gate_and_live_contract():
    app = make_app()
    app.dependency_overrides[handler.require_steward_owner] = lambda: handler.AuthUser(
        id="11111111-2222-3333-4444-555555555555", token="test-session-only"
    )
    client = TestClient(app)
    resp = client.get("/v0.1/project-steward/snapshot/v1.1")
    assert resp.status_code == 200, resp.text
    snapshot = resp.json()
    assert snapshot["version"] == "1.1"
    assert snapshot["stale_after_seconds"] == 172800
    assert len(snapshot["projects"]) == 21
    assert all("insights" not in p for p in snapshot["projects"])
    schema_path = Path(__file__).resolve().parents[2] / "lib" / "project-steward" / "proposed" / "project-snapshot.v1.1.schema.json"
    import json
    schema = json.loads(schema_path.read_text())
    Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(snapshot)


def test_background_refresh_does_not_schedule_when_collector_disabled():
    bg = BackgroundTasks()
    settings = ProjectStewardSettings(
        owner_user_id=None,
        github_token=None,
        supabase_url=None,
        supabase_service_role_key=None,
    )
    reg = ProjectRegistry(settings)
    handler._schedule_git_read(bg, reg, DummyDisabledCollector(), True)
    assert bg.tasks == []


def test_production_route_wiring_present_in_candidate():
    main = Path(__file__).resolve().parents[1] / "lumen" / "main.py"
    source = main.read_text()
    assert "from .project_steward.handler import router as project_steward_router" in source
    assert "app.include_router(project_steward_router)" in source
