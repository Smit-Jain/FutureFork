"""
Backend Integration & Contract Unit Tests
"""

import pytest
from backend.db.repository import init_db, SessionLocal, Repository
from backend.api import routes

@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()

def test_health_check():
    res = routes.health_check()
    assert res["status"] == "ok"
    assert "futurefork-backend" in res["service"]

def test_keep_warm_ping():
    res = routes.keep_warm_ping()
    assert res["ping"] == "pong"

def test_list_datasets(db_session):
    datasets = routes.list_datasets(db=db_session)
    assert len(datasets) >= 1
    assert any(d["id"] == "sample_univ_v1" for d in datasets)

def test_get_dataset_summary(db_session):
    ds = routes.get_dataset("sample_univ_v1", db=db_session)
    assert ds["id"] == "sample_univ_v1"
    assert ds["stats"]["events_count"] == 68
    assert ds["baseline_metrics"]["student_clashes"] == 8
    assert ds["baseline_metrics"]["faculty_clashes"] == 3

def test_create_decision_valid(db_session):
    req = routes.CreateDecisionRequest(
        text="Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week.",
        dataset_id="sample_univ_v1",
    )
    res = routes.create_decision(req, db=db_session)
    assert res["status"] == "ok"
    assert res["change"]["type"] == "shift_time_window"
    assert len(res["objectives"]) >= 3

def test_create_decision_unsupported(db_session):
    req = routes.CreateDecisionRequest(
        text="Invest endowments into bitcoin crypto assets",
        dataset_id="sample_univ_v1",
    )
    res = routes.create_decision(req, db=db_session)
    assert res["status"] == "unsupported"
    assert "Unsupported" in res["message"]

def test_create_decision_clarification(db_session):
    req = routes.CreateDecisionRequest(
        text="make it better",
        dataset_id="sample_univ_v1",
    )
    res = routes.create_decision(req, db=db_session)
    assert res["status"] == "needs_clarification"
    assert "Please specify" in res["message"]

def test_scenarios_and_execution_flow(db_session):
    # Create decision
    req = routes.CreateDecisionRequest(
        text="Move all afternoon classes to the morning",
        dataset_id="sample_univ_v1",
    )
    dec = routes.create_decision(req, db=db_session)
    dec_id = dec["id"]

    # Generate scenarios
    scenarios = routes.generate_scenarios_endpoint(dec_id, db=db_session)
    assert len(scenarios) >= 3
    assert scenarios[0]["id"] == "baseline"

    # Start run
    run_resp = routes.start_run(dec_id, db=db_session)
    run_id = run_resp["run_id"]
    assert run_id.startswith("run_")

    # Check status
    run_status = routes.get_run_status(run_id, db=db_session)
    assert run_status["run_id"] == run_id
    assert run_status["overall_status"] in ["queued", "running", "done"]

def test_branch_scenario_phase2(db_session):
    req = routes.BranchScenarioRequest(
        name="Scenario E: Extended Lab",
        change={"type": "room_change", "params": {"action": "add", "capacity": 30}},
    )
    child = routes.branch_scenario_endpoint("scenario_b", req, db=db_session)
    assert child["parent_id"] == "scenario_b"
    assert child["name"] == "Scenario E: Extended Lab"
