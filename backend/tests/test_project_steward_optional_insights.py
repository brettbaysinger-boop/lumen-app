"""PS-05 regression: canonical v1.1 never serializes missing insights as null.

Run in a disposable environment with PYTHONPATH=backend:
    python -m pytest -q backend/tests/test_project_steward_optional_insights.py

No network, secrets, or production state.
"""
from datetime import datetime, timezone

from lumen.project_steward.config import ProjectStewardSettings
from lumen.project_steward.insights import ProjectInsights
from lumen.project_steward.registry import ProjectRegistry


def test_uncollected_insights_are_omitted_not_null():
    registry = ProjectRegistry(ProjectStewardSettings(
        owner_user_id=None,
        github_token=None,
        supabase_url=None,
        supabase_service_role_key=None,
    ))
    snapshot = registry.generate_snapshot_v11()
    assert snapshot["version"] == "1.1"
    assert snapshot["stale_after_seconds"] == 172800
    assert snapshot["projects"]
    assert all("insights" not in p for p in snapshot["projects"])


def test_collected_insights_remain_objects():
    registry = ProjectRegistry(ProjectStewardSettings(
        owner_user_id=None,
        github_token=None,
        supabase_url=None,
        supabase_service_role_key=None,
    ))
    registry._insights["pesttrails"] = ProjectInsights(
        observed_at=datetime.now(timezone.utc).isoformat(),
        open_prs=None,
        last_commit=None,
        last_deploy=None,
        ci=None,
        next=[],
        activity=[],
        links=[],
    )
    projects = {p["id"]: p for p in registry.generate_snapshot_v11()["projects"]}
    assert isinstance(projects["pesttrails"]["insights"], dict)
    assert "insights" not in projects["chorusfall"]
