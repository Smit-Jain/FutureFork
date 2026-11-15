"""
FutureFork REST API Routes
Implements the shared contract defined in contracts/schemas.py and section 5.
"""

import uuid
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.db.repository import Repository
from backend.orchestration.runner import dispatch_decision_run
from backend.orchestration.integrations import (
    call_parse_decision,
    call_generate_scenarios,
    call_explain,
)

logger = logging.getLogger("futurefork.api")

router = APIRouter()

# Request schemas
class CreateDecisionRequest(BaseModel):
    text: str = Field(..., description="Plain-English decision prompt")
    dataset_id: str = Field(..., description="Dataset identifier")

class BranchScenarioRequest(BaseModel):
    name: str = Field(..., description="Name for the new child scenario")
    change: Dict[str, Any] = Field(..., description="ChangeSpec payload")

# 1. Health & Liveness
@router.get("/health")
def health_check():
    return {"status": "ok", "service": "futurefork-backend", "engine": "cp-sat+numpy"}

@router.get("/ping")
def keep_warm_ping():
    return {"ping": "pong", "status": "warm"}

# 2. Datasets
@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    repo = Repository(db)
    return repo.list_datasets()

@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    ds = repo.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "DATASET_NOT_FOUND", "message": f"Dataset {dataset_id} not found"},
        )
    return {
        "id": ds["id"],
        "name": ds["name"],
        "description": ds["description"],
        "stats": ds["stats"],
        "baseline_metrics": ds["baseline_metrics"],
    }

# 3. Decisions
@router.post("/decisions", status_code=status.HTTP_201_CREATED)
def create_decision(req: CreateDecisionRequest, db: Session = Depends(get_db)):
    repo = Repository(db)
    ds = repo.get_dataset(req.dataset_id)
    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "DATASET_NOT_FOUND", "message": f"Dataset {req.dataset_id} not found"},
        )

    summary = {
        "id": ds["id"],
        "name": ds["name"],
        "stats": ds["stats"],
        "baseline_metrics": ds["baseline_metrics"],
    }

    # Call AI Parser
    spec = call_parse_decision(req.text, summary)
    spec["dataset_id"] = req.dataset_id

    # Persist in DB
    repo.save_decision(spec)
    return spec

# 4. Scenarios
@router.post("/decisions/{decision_id}/scenarios")
def generate_scenarios_endpoint(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    decision = repo.get_decision(decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "DECISION_NOT_FOUND", "message": f"Decision {decision_id} not found"},
        )

    scenarios = call_generate_scenarios(decision)
    repo.save_scenarios(scenarios)
    return scenarios

# 5. Run Execution & Polling
@router.post("/decisions/{decision_id}/run")
def start_run(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    decision = repo.get_decision(decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "DECISION_NOT_FOUND", "message": f"Decision {decision_id} not found"},
        )

    scenarios = repo.get_scenarios(decision_id)
    if not scenarios:
        # Auto-generate if not yet generated
        scenarios = call_generate_scenarios(decision)
        repo.save_scenarios(scenarios)

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    repo.create_run(run_id, decision_id, [s["id"] for s in scenarios])

    # Dispatch async background worker
    dispatch_decision_run(decision_id, run_id)

    return {"run_id": run_id}

@router.get("/runs/{run_id}")
def get_run_status(run_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    run_info = repo.get_run(run_id)
    if not run_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "RUN_NOT_FOUND", "message": f"Run {run_id} not found"},
        )
    return run_info

# 6. Scenario Results & Comparison
@router.get("/scenarios/{scenario_id}/result")
def get_scenario_result(scenario_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    res = repo.get_result(scenario_id)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "RESULT_NOT_FOUND", "message": f"Result for {scenario_id} not found or not yet ready"},
        )
    return res

@router.get("/decisions/{decision_id}/compare")
def get_decision_comparison(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    decision = repo.get_decision(decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "DECISION_NOT_FOUND", "message": f"Decision {decision_id} not found"},
        )

    scenarios = repo.get_scenarios(decision_id)
    results = {}
    for sc in scenarios:
        res = repo.get_result(sc["id"])
        if res:
            results[sc["id"]] = res

    # AI Synthesis
    explanation = call_explain(decision, results)

    return {
        "decision_id": decision_id,
        "decision_spec": decision,
        "scenarios": scenarios,
        "results": results,
        "explanation": explanation,
    }

# 7. Phase 2 Stub: Branch Scenario
@router.post("/scenarios/{parent_scenario_id}/branch", status_code=status.HTTP_201_CREATED)
def branch_scenario_endpoint(
    parent_scenario_id: str,
    req: BranchScenarioRequest,
    db: Session = Depends(get_db),
):
    repo = Repository(db)
    # Find the parent scenario from DB
    from backend.db.models import ScenarioModel
    parent_row = repo.db.query(ScenarioModel).filter(ScenarioModel.id == parent_scenario_id).first()
    if not parent_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "PARENT_NOT_FOUND", "message": f"Parent scenario {parent_scenario_id} not found"},
        )

    child_id = f"branch_{uuid.uuid4().hex[:8]}"
    child_scenario = {
        "id": child_id,
        "decision_id": parent_row.decision_id,
        "parent_id": parent_scenario_id,
        "name": req.name,
        "description": f"Custom child branch extending {parent_row.name} with {req.change.get('type')}.",
        "change": req.change,
        "status": "done",
    }
    repo.save_scenarios([child_scenario])

    # Evaluate child scenario immediately
    dataset_row = repo.get_dataset("sample_univ_v1")
    dataset_payload = dataset_row["payload"] if dataset_row and dataset_row.get("payload") else {}
    baseline_tt = dataset_payload.get("baseline_timetable", [])

    from backend.orchestration.integrations import call_evaluate_scenario
    child_res = call_evaluate_scenario(
        dataset=dataset_payload,
        baseline_timetable=baseline_tt,
        scenario=child_scenario,
        n_sims=300,
        seed=42,
    )
    repo.save_result(child_res)

    return child_scenario
