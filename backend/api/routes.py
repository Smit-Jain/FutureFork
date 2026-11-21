"""
FutureFork REST API Routes
Financial CSV decision pipeline:

  POST /datasets/inspect          → upload CSV, get proposed ColumnMapping + 5-row preview
  POST /datasets/commit           → confirm mapping, compile Node 0 baseline, save dataset
  GET  /datasets                  → list datasets (bundled samples + committed uploads)
  GET  /datasets/{id}             → a dataset's summary and Node 0 metrics
  POST /decisions                 → parse a plain-English decision
  POST /decisions/{id}/scenarios  → generate baseline + 4 policy forks
  POST /decisions/{id}/run        → evaluate all forks (CP-SAT + Monte Carlo) in the background
  GET  /runs/{run_id}             → poll run status
  GET  /scenarios/{id}/result     → one evaluated fork
  GET  /decisions/{id}/compare    → side-by-side results + guarded AI explanation
  POST /scenarios/{id}/branch     → user-defined child fork, evaluated immediately
  GET  /health  /ping             → liveness
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import settings
from backend.db.repository import Repository, build_dataset_record
from backend.db.session import get_db
from backend.orchestration.integrations import (
    call_evaluate_scenario,
    call_explain,
    call_generate_scenarios,
    call_parse_decision,
    call_stress_test,
    dataset_type_of,
    load_instance,
    to_api_result,
)
from backend.orchestration.runner import dispatch_decision_run
from contracts.schemas import (
    ComparisonResponse,
    FinancialScenarioResult,
    RunStatus,
    Scenario,
    StressRequest,
    StressResponse,
)

logger = logging.getLogger("futurefork.api")

router = APIRouter()

UPLOAD_TTL_MINUTES = 15
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAPPING_SAMPLE_ROWS = 200
DATASET_TYPES = ("personal", "institute", "startup")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    upload_id: str = Field(..., description="upload_id returned by /datasets/inspect")
    confirmed_mapping: Dict[str, Any] = Field(
        ..., description="Confirmed ColumnMapping (from the inspect response, optionally edited)"
    )
    dataset_name: Optional[str] = Field(None, description="Human-friendly name for the dataset")
    starting_balance: Optional[float] = Field(
        None, description="Opening cash balance (₹). Overrides any balance inferred from the CSV."
    )
    dataset_type: Optional[str] = Field(
        None, description="personal | institute | startup (defaults to the type detected at inspect)"
    )
    monthly_income: Optional[float] = Field(
        None, description="Monthly income (₹). Use when the file has no income rows, e.g. an expenses-only export."
    )


class CreateDecisionRequest(BaseModel):
    text: str = Field(..., description="Plain-English financial decision prompt")
    dataset_id: str = Field(..., description="Dataset id (from /datasets or /datasets/commit)")


class BranchScenarioRequest(BaseModel):
    name: str = Field(..., description="Name for the new child scenario")
    change: Dict[str, Any] = Field(
        ...,
        description="ChangeSpec: {type: upfront|emi|phased|trim, params: {...overrides}}",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _not_found(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": code, "message": message})


def _dataset_type_hint(filename: str) -> Optional[str]:
    name = filename.lower()
    if any(k in name for k in ["erp", "institute", "college"]):
        return "institute"
    if any(k in name for k in ["pnl", "startup", "burn"]):
        return "startup"
    return None


def _get_dataset_or_404(repo: Repository, dataset_id: str) -> Dict[str, Any]:
    ds = repo.get_dataset(dataset_id)
    if not ds:
        raise _not_found("DATASET_NOT_FOUND", f"Dataset {dataset_id} not found")
    return ds


def _get_decision_or_404(repo: Repository, decision_id: str) -> Dict[str, Any]:
    decision = repo.get_decision(decision_id)
    if not decision:
        raise _not_found("DECISION_NOT_FOUND", f"Decision {decision_id} not found")
    return decision


# ---------------------------------------------------------------------------
# 1. Health & liveness
# ---------------------------------------------------------------------------

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "futurefork-backend", "engine": "cp-sat+numpy"}


@router.get("/ping")
def keep_warm_ping():
    return {"ping": "pong", "status": "warm"}


# ---------------------------------------------------------------------------
# 2. Datasets — list & get
# ---------------------------------------------------------------------------

@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    return Repository(db).list_datasets()


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = _get_dataset_or_404(Repository(db), dataset_id)
    return {
        "id": ds["id"],
        "name": ds["name"],
        "description": ds["description"],
        "dataset_type": dataset_type_of(ds.get("payload") or {}),
        "stats": ds["stats"],
        "baseline_metrics": ds["baseline_metrics"],
    }


# ---------------------------------------------------------------------------
# 3. POST /datasets/inspect — step 1 of CSV onboarding
# ---------------------------------------------------------------------------

@router.post("/datasets/inspect", status_code=status.HTTP_200_OK)
async def inspect_dataset(
    file: UploadFile = File(..., description="Financial CSV file (bank/UPI/ERP/P&L)"),
    db: Session = Depends(get_db),
):
    """
    Reads the uploaded CSV, proposes a ColumnMapping, and returns a 5-row preview.
    Raw bytes are held for 15 minutes under a fresh upload_id.
    """
    raw_bytes: bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "EMPTY_FILE", "message": "The uploaded file is empty."},
        )
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"error": "FILE_TOO_LARGE", "message": "Files up to 10 MB are supported."},
        )

    filename = file.filename or "upload.csv"
    from ai.agents.mapper import propose_mapping
    from data.normalize import UnreadableFileError, load_table

    try:
        table = load_table(raw_bytes, filename)
    except UnreadableFileError as exc:
        raise HTTPException(status_code=422, detail={"error": "UNREADABLE_FILE", "message": str(exc)})

    df = table.df
    headers = list(df.columns)
    sample = df.head(MAPPING_SAMPLE_ROWS).to_dict(orient="records")
    preview_rows = df.head(5).to_dict(orient="records")

    result = propose_mapping(headers, sample, dataset_type_hint=_dataset_type_hint(filename))
    proposed_mapping = result.mapping.to_dict()
    dataset_type = result.dataset_type if result.dataset_type in DATASET_TYPES else "personal"

    notes: List[str] = []
    if table.skipped_preamble_rows:
        notes.append(f"Skipped {table.skipped_preamble_rows} line(s) above the header row.")
    if not (proposed_mapping.get("amount_col") or proposed_mapping.get("debit_col") or proposed_mapping.get("credit_col")):
        notes.append("Couldn't tell which column holds the amounts. Please pick it below.")

    upload_id = f"upl_{uuid.uuid4().hex[:16]}"
    Repository(db).save_upload(
        upload_id=upload_id,
        csv_bytes=raw_bytes,
        filename=filename,
        preview_rows=preview_rows,
        column_mapping={**proposed_mapping, "_dataset_type": dataset_type},
        ttl_minutes=UPLOAD_TTL_MINUTES,
    )

    return {
        "upload_id": upload_id,
        "filename": filename,
        "headers": headers,
        "proposed_mapping": proposed_mapping,
        "mapping_confidence": result.confidence,
        "mapping_source": result.tier_used,
        "dataset_type": dataset_type,
        "preview_rows": preview_rows,
        "row_count": int(len(df)),
        "warnings": notes,
        "ttl_seconds": UPLOAD_TTL_MINUTES * 60,
    }


# ---------------------------------------------------------------------------
# 4. POST /datasets/commit — step 2 of CSV onboarding (Node 0)
# ---------------------------------------------------------------------------

@router.post("/datasets/commit", status_code=status.HTTP_201_CREATED)
def commit_dataset(req: CommitRequest, db: Session = Depends(get_db)):
    """Compiles the uploaded CSV into a 12-month baseline (Node 0) and saves it as a dataset."""
    repo = Repository(db)
    upload = repo.get_upload(req.upload_id)
    if not upload:
        raise _not_found(
            "UPLOAD_NOT_FOUND",
            f"Upload {req.upload_id} not found or has expired (15-min TTL). "
            "Please re-upload via POST /datasets/inspect.",
        )

    filename: str = upload["filename"]
    mapping = {k: v for k, v in req.confirmed_mapping.items() if not k.startswith("_")}
    if req.starting_balance is not None:
        mapping["starting_balance"] = req.starting_balance

    detected_type = (upload.get("column_mapping") or {}).get("_dataset_type", "personal")
    dataset_type = req.dataset_type if req.dataset_type in DATASET_TYPES else detected_type
    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    ds_name = req.dataset_name or filename.rsplit(".", 1)[0].replace("_", " ").title()

    from data.ingestor import ColumnMapping, FinancialIngestor

    try:
        instance = FinancialIngestor.compile(
            csv_source=upload["csv_bytes"],
            mapping=ColumnMapping.from_dict(mapping),
            dataset_id=dataset_id,
            name=ds_name,
            starting_balance=req.starting_balance,
            monthly_income=req.monthly_income,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error": "INGEST_FAILED", "message": str(exc)})
    except Exception as exc:
        logger.exception(f"CSV compilation failed for {filename}: {exc}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INGEST_FAILED",
                "message": "Could not build a baseline from this file with this column mapping. "
                "Check the date and amount (or debit/credit) columns.",
            },
        )

    record = build_dataset_record(instance, dataset_id, ds_name, dataset_type, filename, mapping)
    repo.save_dataset(record)
    repo.delete_upload(req.upload_id)

    return {
        "dataset_id": dataset_id,
        "name": ds_name,
        "dataset_type": dataset_type,
        "stats": record["stats"],
        "baseline_metrics": record["baseline_metrics"],
        "baseline_risks": _extract_baseline_risks(record["baseline_metrics"]),
        "warnings": record["stats"]["warnings"],
    }


def _extract_baseline_risks(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Summarises the Node 0 risk signals."""
    risks: Dict[str, Any] = {}
    if not metrics:
        return risks
    if metrics.get("months_below_floor", 0) > 0:
        risks["floor_breach_months"] = metrics["months_below_floor"]
        risks["floor_breach_severity"] = "HIGH" if metrics["months_below_floor"] >= 3 else "MEDIUM"
    if metrics.get("cash_out_risk_pct", 0) > 0:
        risks["cash_out_risk_pct"] = metrics["cash_out_risk_pct"]
    if metrics.get("runway_months") is not None:
        risks["runway_months"] = metrics["runway_months"]
    if metrics.get("survival_score_pct") is not None:
        score = metrics["survival_score_pct"]
        risks["survival_score_pct"] = score
        risks["health"] = "GOOD" if score >= 80 else ("FAIR" if score >= 50 else "POOR")
    return risks


# ---------------------------------------------------------------------------
# 5. POST /decisions — parse a plain-English decision
# ---------------------------------------------------------------------------

@router.post("/decisions", status_code=status.HTTP_201_CREATED)
def create_decision(req: CreateDecisionRequest, db: Session = Depends(get_db)):
    repo = Repository(db)
    ds = _get_dataset_or_404(repo, req.dataset_id)
    payload = ds.get("payload") or {}
    spec = call_parse_decision(
        req.text,
        dataset_id=req.dataset_id,
        instance=load_instance(payload),
        dataset_type=dataset_type_of(payload),
    )
    repo.save_decision(spec)
    return spec


# ---------------------------------------------------------------------------
# 6. POST /decisions/{id}/scenarios — baseline + 4 policy forks
# ---------------------------------------------------------------------------

def _generate_and_save_scenarios(repo: Repository, decision: Dict[str, Any]) -> List[Dict[str, Any]]:
    if decision.get("status") != "ok":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "DECISION_NOT_READY",
                "message": decision.get("message") or "Decision needs clarification before forking.",
            },
        )
    ds = _get_dataset_or_404(repo, decision["dataset_id"])
    scenarios = call_generate_scenarios(decision, load_instance(ds.get("payload") or {}))
    repo.save_scenarios(scenarios)
    return scenarios


@router.post("/decisions/{decision_id}/scenarios", response_model=list[Scenario])
def generate_scenarios_endpoint(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    return _generate_and_save_scenarios(repo, _get_decision_or_404(repo, decision_id))


# ---------------------------------------------------------------------------
# 7. POST /decisions/{id}/run — CP-SAT + Monte Carlo in the background
# ---------------------------------------------------------------------------

@router.post("/decisions/{decision_id}/run")
def start_run(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    decision = _get_decision_or_404(repo, decision_id)

    scenarios = repo.get_scenarios(decision_id) or _generate_and_save_scenarios(repo, decision)

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    repo.create_run(run_id, decision_id, [s["id"] for s in scenarios])
    dispatch_decision_run(decision_id, run_id)
    return {"run_id": run_id}


# ---------------------------------------------------------------------------
# 8. GET /runs/{run_id}
# ---------------------------------------------------------------------------

@router.get("/runs/{run_id}", response_model=RunStatus)
def get_run_status(run_id: str, db: Session = Depends(get_db)):
    run_info = Repository(db).get_run(run_id)
    if not run_info:
        raise _not_found("RUN_NOT_FOUND", f"Run {run_id} not found")
    return run_info


# ---------------------------------------------------------------------------
# 9. GET /scenarios/{id}/result
# ---------------------------------------------------------------------------

@router.get("/scenarios/{scenario_id}/result", response_model=FinancialScenarioResult)
def get_scenario_result(scenario_id: str, db: Session = Depends(get_db)):
    raw = Repository(db).get_result(scenario_id)
    if not raw:
        raise _not_found("RESULT_NOT_FOUND", f"Result for {scenario_id} not found or not yet ready")
    return to_api_result(raw)


# ---------------------------------------------------------------------------
# 10. GET /decisions/{id}/compare — side-by-side + guarded AI explanation
# ---------------------------------------------------------------------------

@router.get("/decisions/{decision_id}/compare", response_model=ComparisonResponse)
def get_decision_comparison(decision_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    decision = _get_decision_or_404(repo, decision_id)
    scenarios = repo.get_scenarios(decision_id)

    raw_results: Dict[str, Any] = {}
    for sc in scenarios:
        raw = repo.get_result(sc["id"])
        if raw:
            raw_results[sc["id"]] = raw

    return {
        "decision_id": decision_id,
        "decision_spec": decision,
        "scenarios": scenarios,
        "results": {sid: to_api_result(raw) for sid, raw in raw_results.items()},
        "explanation": call_explain(decision, raw_results),
    }


# ---------------------------------------------------------------------------
# 10b. POST /decisions/{id}/stress — Crisis Playground (engine-backed)
# ---------------------------------------------------------------------------

@router.post("/decisions/{decision_id}/stress", response_model=StressResponse)
def stress_decision(decision_id: str, req: StressRequest, db: Session = Depends(get_db)):
    """
    Re-runs the Monte Carlo simulation for every fork of a decision with extra shocks
    (late inflows, a surprise bill, higher spending, a different floor). Takes a few ms,
    so the UI can call it as sliders move.
    """
    repo = Repository(db)
    decision = _get_decision_or_404(repo, decision_id)
    scenarios = repo.get_scenarios(decision_id)
    if not scenarios:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "NO_SCENARIOS", "message": "Generate scenarios for this decision first."},
        )
    ds = _get_dataset_or_404(repo, decision["dataset_id"])
    try:
        out = call_stress_test(
            load_instance(ds.get("payload") or {}),
            scenarios,
            req.model_dump(),
            n_sims=settings.NUM_SIMULATION_RUNS,
            seed=settings.RANDOM_SEED,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "STRESS_FAILED", "message": str(exc)},
        ) from exc
    return {"decision_id": decision_id, "stress": req.model_dump(), **out}


# ---------------------------------------------------------------------------
# 11. POST /scenarios/{id}/branch — user-defined child fork
# ---------------------------------------------------------------------------

@router.post(
    "/scenarios/{parent_scenario_id}/branch",
    status_code=status.HTTP_201_CREATED,
    response_model=Scenario,
)
def branch_scenario_endpoint(
    parent_scenario_id: str,
    req: BranchScenarioRequest,
    db: Session = Depends(get_db),
):
    repo = Repository(db)
    from backend.db.models import ScenarioModel

    parent = repo.db.query(ScenarioModel).filter(ScenarioModel.id == parent_scenario_id).first()
    if not parent:
        raise _not_found("PARENT_NOT_FOUND", f"Parent scenario {parent_scenario_id} not found")

    from engine.changes import normalize_branch_type

    try:
        branch_type = normalize_branch_type(req.change.get("type", ""))
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"error": "UNSUPPORTED_CHANGE", "message": str(exc)},
        )

    # Child inherits the decision's purchase goal, then the parent's params; the request overrides
    decision = _get_decision_or_404(repo, parent.decision_id)
    params = {
        **((decision.get("change") or {}).get("params") or {}),
        **((parent.change or {}).get("params") or {}),
        **(req.change.get("params") or {}),
    }
    child = {
        "id": f"branch_{uuid.uuid4().hex[:8]}",
        "decision_id": parent.decision_id,
        "parent_id": parent_scenario_id,
        "name": req.name,
        "description": f"Custom {branch_type} fork branched from '{parent.name}'.",
        "change": {"type": branch_type, "params": params},
        "status": "queued",
    }
    repo.save_scenarios([child])

    ds =_get_dataset_or_404(repo, decision["dataset_id"])
    try:
        raw = call_evaluate_scenario(
            load_instance(ds.get("payload") or {}),
            child,
            n_sims=settings.NUM_SIMULATION_RUNS,
            seed=settings.RANDOM_SEED,
        )
        repo.save_result(raw)
        child["status"] = "done"
    except Exception as exc:
        logger.warning(f"Child scenario evaluation failed: {exc}")
        child["status"] = "failed"
    repo.update_scenario_status(child["id"], child["status"])
    return child
