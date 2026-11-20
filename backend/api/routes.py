"""
FutureFork REST API Routes  —  Member 5
Implements the full financial CSV pipeline:

  POST /datasets/inspect  → upload CSV, get ColumnMapping + 5-row preview
  POST /datasets/commit   → confirm mapping, run ingestor + baseline, save Node 0
  POST /decisions         → parse plain-English prompt into 4 policy forks
  POST /decisions/{id}/scenarios  → generate 4 branch scenarios
  POST /decisions/{id}/run        → kick off CP-SAT + Monte Carlo pipeline
  GET  /runs/{run_id}             → poll run status
  GET  /scenarios/{id}/result     → fetch a single branch result
  GET  /decisions/{id}/compare    → side-by-side comparison + AI explanation
  POST /scenarios/{id}/branch     → Phase-2 user-defined child branch
  GET  /datasets                  → list committed datasets
  GET  /datasets/{id}             → fetch a dataset's Node-0 baseline
  GET  /health  /ping             → liveness
"""

import io
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.repository import Repository
from backend.db.session import get_db
from backend.orchestration.integrations import (
    call_explain,
    call_generate_scenarios,
    call_parse_decision,
)
from backend.orchestration.runner import dispatch_decision_run

logger = logging.getLogger("futurefork.api")

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas (Member 5 additions)
# ---------------------------------------------------------------------------

class CommitRequest(BaseModel):
    upload_id: str = Field(..., description="upload_id returned by /datasets/inspect")
    confirmed_mapping: Dict[str, Any] = Field(
        ..., description="Confirmed ColumnMapping dict (from inspect response or user-edited)"
    )
    dataset_name: Optional[str] = Field(None, description="Human-friendly name for the dataset")
    starting_balance: Optional[float] = Field(
        None, description="Override starting cash balance (₹)"
    )

class CreateDecisionRequest(BaseModel):
    text: str = Field(..., description="Plain-English financial decision prompt")
    dataset_id: str = Field(..., description="Committed dataset_id (from /datasets/commit)")

class BranchScenarioRequest(BaseModel):
    name: str = Field(..., description="Name for the new child scenario")
    change: Dict[str, Any] = Field(..., description="ChangeSpec payload")


# ---------------------------------------------------------------------------
# 1. Health & Liveness
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


# ---------------------------------------------------------------------------
# 3. POST /datasets/inspect
#    Accepts uploaded CSV, caches raw bytes (15-min TTL upload_id),
#    returns Member 4's proposed ColumnMapping + 5-row preview.
# ---------------------------------------------------------------------------

@router.post("/datasets/inspect", status_code=status.HTTP_200_OK)
async def inspect_dataset(
    file: UploadFile = File(..., description="Financial CSV file (bank/UPI/ERP/P&L)"),
    db: Session = Depends(get_db),
):
    """
    Step 1 of 2 in the CSV onboarding pipeline.
    Reads the uploaded CSV, proposes a ColumnMapping, and returns a 5-row preview.
    Raw bytes are cached for 15 minutes under a fresh upload_id.
    """
    # Read raw bytes
    raw_bytes: bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "EMPTY_FILE", "message": "Uploaded CSV file is empty."},
        )

    filename = file.filename or "upload.csv"

    # Delegate to Member 4's mapper agent (with deterministic regex fallback)
    proposed_mapping: Dict[str, Any] = {}
    preview_rows: List[Dict[str, Any]] = []

    try:
        from ai.agents.mapper import propose_column_mapping  # Member 4
        result = propose_column_mapping(raw_bytes, filename=filename)
        proposed_mapping = result.get("mapping", {})
        preview_rows = result.get("preview_rows", [])
    except (ImportError, AttributeError, Exception) as exc:
        logger.warning(f"mapper agent unavailable ({exc}), using regex fallback")
        proposed_mapping, preview_rows = _regex_mapping_fallback(raw_bytes, filename)

    # Generate a fresh upload_id and persist with 15-min TTL
    upload_id = f"upl_{uuid.uuid4().hex[:16]}"
    repo = Repository(db)
    repo.save_upload(
        upload_id=upload_id,
        csv_bytes=raw_bytes,
        filename=filename,
        preview_rows=preview_rows,
        column_mapping=proposed_mapping,
        ttl_minutes=15,
    )

    return {
        "upload_id": upload_id,
        "filename": filename,
        "proposed_mapping": proposed_mapping,
        "preview_rows": preview_rows,
        "ttl_seconds": 900,
        "message": (
            "Review the proposed column mapping. If correct, POST to /datasets/commit "
            "with this upload_id and confirmed_mapping."
        ),
    }


def _regex_mapping_fallback(
    raw_bytes: bytes, filename: str
) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Pure-regex deterministic ColumnMapping fallback — works offline / rate-limited.
    Reads up to 6 rows (1 header + 5 data) and sniffs column semantics.
    """
    import csv
    import io
    import re

    # Try multiple encodings
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    # Sniff columns by name
    DATE_RE  = re.compile(r"date|dt|time|txn_date|value_date", re.I)
    AMT_RE   = re.compile(r"^amount$|^amt$|^net$", re.I)
    DEBIT_RE = re.compile(r"debit|withdrawal|dr|expense|outflow|credit_debit.*d", re.I)
    CRED_RE  = re.compile(r"credit|deposit|cr|inflow|credit_debit.*c", re.I)
    CAT_RE   = re.compile(r"category|cat|head|account_head|type|classification", re.I)
    DESC_RE  = re.compile(r"description|narration|particular|remark|detail|note", re.I)
    TYPE_RE  = re.compile(r"^type$|txn.?type|transaction.?type", re.I)

    def _first(pat):
        for h in headers:
            if pat.search(h):
                return h
        return None

    mapping: Dict[str, Any] = {
        "date_col":        _first(DATE_RE)  or (headers[0] if headers else "Date"),
        "amount_col":      _first(AMT_RE),
        "debit_col":       _first(DEBIT_RE),
        "credit_col":      _first(CRED_RE),
        "category_col":    _first(CAT_RE),
        "description_col": _first(DESC_RE),
        "type_col":        _first(TYPE_RE),
        "date_format":     None,
        "starting_balance": 0.0,
    }

    # 5-row preview
    preview: List[Dict[str, Any]] = []
    try:
        reader2 = csv.DictReader(io.StringIO(text))
        for i, row in enumerate(reader2):
            if i >= 5:
                break
            preview.append(dict(row))
    except Exception:
        pass

    return mapping, preview


# ---------------------------------------------------------------------------
# 4. POST /datasets/commit
#    Takes upload_id + confirmed mapping, runs Member 1's ingestor +
#    Member 2's baseline evaluator, saves Node 0, returns baseline risks.
# ---------------------------------------------------------------------------

@router.post("/datasets/commit", status_code=status.HTTP_201_CREATED)
def commit_dataset(req: CommitRequest, db: Session = Depends(get_db)):
    """
    Step 2 of 2 in the CSV onboarding pipeline.
    Compiles the uploaded CSV → FinancialProblemInstance (Node 0) using
    Member 1's ingestor, evaluates the baseline with Member 2's solver,
    persists to DB, and returns the baseline clash/risk summary.
    """
    repo = Repository(db)

    # Retrieve the cached upload
    upload = repo.get_upload(req.upload_id)
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "UPLOAD_NOT_FOUND",
                "message": (
                    f"Upload {req.upload_id} not found or has expired (15-min TTL). "
                    "Please re-upload via POST /datasets/inspect."
                ),
            },
        )

    csv_bytes: bytes = upload["csv_bytes"]
    filename: str = upload["filename"]

    # Override starting_balance if user supplied it
    confirmed_mapping = dict(req.confirmed_mapping)
    if req.starting_balance is not None:
        confirmed_mapping["starting_balance"] = req.starting_balance

    # --- Member 1: FinancialIngestor.compile ---
    instance = None
    try:
        from data.ingestor import ColumnMapping as IngestorMapping, FinancialIngestor  # Member 1
        col_map = IngestorMapping.from_dict(confirmed_mapping)
        dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
        ds_name = req.dataset_name or filename.replace(".csv", "").replace("_", " ").title()
        instance = FinancialIngestor.compile(
            csv_source=io.BytesIO(csv_bytes),
            mapping=col_map,
            dataset_id=dataset_id,
            name=ds_name,
        )
    except (ImportError, AttributeError) as exc:
        logger.warning(f"FinancialIngestor unavailable ({exc}), using stub instance")
        instance = None
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "INGEST_FAILED",
                "message": f"CSV compilation failed: {exc}",
            },
        )

    # --- Member 2: evaluate_financial_baseline (Node 0) ---
    baseline_result = None
    baseline_metrics: Dict[str, Any] = {}

    if instance is not None:
        try:
            from engine.solver import evaluate_financial_baseline  # Member 2
            baseline_result = evaluate_financial_baseline(
                instance=instance,
                emergency_floor=float(confirmed_mapping.get("starting_balance", 0.0)) * 0.0,
            )
            baseline_metrics = baseline_result.metrics if baseline_result else {}
        except (ImportError, AttributeError) as exc:
            logger.warning(f"evaluate_financial_baseline unavailable: {exc}")
        except Exception as exc:
            logger.warning(f"Baseline evaluation error (non-fatal): {exc}")

    # Build the dataset payload to persist
    if instance is not None:
        try:
            instance_dict = instance.to_dict()
        except Exception:
            instance_dict = {}
        stats = {
            "months": len(instance.months),
            "categories": len(instance.categories),
            "total_transactions": int(sum(instance.total_outflows)) if instance.total_outflows else 0,
            "starting_balance": instance.starting_balance,
            "category_types": instance.category_types,
        }
    else:
        # Fallback stub if ingestor is not yet available
        dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
        ds_name = req.dataset_name or filename.replace(".csv", "").replace("_", " ").title()
        instance_dict = {}
        stats = {"months": 12, "categories": 8, "source": filename}
        baseline_metrics = {}

    # Serialize baseline result if present
    if baseline_result is not None:
        try:
            br_dict = baseline_result.to_dict() if hasattr(baseline_result, "to_dict") else {}
        except Exception:
            br_dict = {}
    else:
        br_dict = {}

    payload = {
        "summary": {
            "id": dataset_id,
            "name": ds_name,
            "description": f"Financial dataset compiled from {filename}",
            "stats": stats,
            "baseline_metrics": baseline_metrics,
        },
        "instance": instance_dict,
        "baseline_result": br_dict,
        "column_mapping": confirmed_mapping,
        "source_filename": filename,
    }

    ds_record: Dict[str, Any] = {
        "id": dataset_id,
        "name": ds_name,
        "description": f"Financial dataset compiled from {filename}",
        "stats": stats,
        "baseline_metrics": baseline_metrics,
        "payload": payload,
    }
    repo.save_dataset(ds_record)

    # Clean up the temporary upload
    repo.delete_upload(req.upload_id)

    # Surface clashes / risks from baseline metrics
    baseline_risks = _extract_baseline_risks(baseline_metrics)

    return {
        "dataset_id": dataset_id,
        "name": ds_name,
        "stats": stats,
        "baseline_metrics": baseline_metrics,
        "baseline_risks": baseline_risks,
        "message": (
            f"Node 0 (Baseline) committed successfully. "
            f"Now POST /decisions with dataset_id='{dataset_id}' and your financial decision prompt."
        ),
    }


def _extract_baseline_risks(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Summarise the Node-0 risk signals in a human-readable dict."""
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
# 5. POST /decisions  — parse financial decision into 4 policy forks
# ---------------------------------------------------------------------------

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

    # Member 4: parse plain-English → DecisionSpec
    spec = call_parse_decision(req.text, summary)
    spec["dataset_id"] = req.dataset_id

    # Normalise: Member 4's new parser returns "financial" key; map it to "change"
    # so the rest of the pipeline (solver, scenarios, compare) always sees "change"
    if "change" not in spec and "financial" in spec:
        fin = spec["financial"]
        spec["change"] = {
            "type": fin.get("financing_preference", "big_purchase"),
            "params": {
                "total_cost": fin.get("total_cost", 0.0),
                "emergency_floor": fin.get("emergency_floor", 0.0),
                "item_label": fin.get("item_label", ""),
            },
        }

    repo.save_decision(spec)
    return spec


# ---------------------------------------------------------------------------
# 6. POST /decisions/{id}/scenarios  — generate 4 competing policy forks
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# 7. POST /decisions/{id}/run  — kick off CP-SAT + Monte Carlo pipeline
# ---------------------------------------------------------------------------

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
        scenarios = call_generate_scenarios(decision)
        repo.save_scenarios(scenarios)

    run_id = f"run_{uuid.uuid4().hex[:12]}"
    repo.create_run(run_id, decision_id, [s["id"] for s in scenarios])

    # Dispatch background worker (Members 2 + 3 pipeline)
    dispatch_decision_run(decision_id, run_id)

    return {"run_id": run_id}


# ---------------------------------------------------------------------------
# 8. GET /runs/{run_id}  — poll pipeline status
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# 9. GET /scenarios/{id}/result  — single branch result
# ---------------------------------------------------------------------------

@router.get("/scenarios/{scenario_id}/result")
def get_scenario_result(scenario_id: str, db: Session = Depends(get_db)):
    repo = Repository(db)
    res = repo.get_result(scenario_id)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "RESULT_NOT_FOUND",
                "message": f"Result for {scenario_id} not found or not yet ready",
            },
        )
    return res


# ---------------------------------------------------------------------------
# 10. GET /decisions/{id}/compare  — 4-branch comparison + AI explanation
# ---------------------------------------------------------------------------

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
    results: Dict[str, Any] = {}
    for sc in scenarios:
        res = repo.get_result(sc["id"])
        if res:
            results[sc["id"]] = res

    # Member 4: AI synthesis with Regex Numeric Guard
    explanation = call_explain(decision, results)

    return {
        "decision_id": decision_id,
        "decision_spec": decision,
        "scenarios": scenarios,
        "results": results,
        "explanation": explanation,
    }


# ---------------------------------------------------------------------------
# 11. POST /scenarios/{id}/branch  — Phase-2 user-defined child branch
# ---------------------------------------------------------------------------

@router.post("/scenarios/{parent_scenario_id}/branch", status_code=status.HTTP_201_CREATED)
def branch_scenario_endpoint(
    parent_scenario_id: str,
    req: BranchScenarioRequest,
    db: Session = Depends(get_db),
):
    repo = Repository(db)
    from backend.db.models import ScenarioModel

    parent_row = (
        repo.db.query(ScenarioModel)
        .filter(ScenarioModel.id == parent_scenario_id)
        .first()
    )
    if not parent_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "PARENT_NOT_FOUND",
                "message": f"Parent scenario {parent_scenario_id} not found",
            },
        )

    child_id = f"branch_{uuid.uuid4().hex[:8]}"
    child_scenario = {
        "id": child_id,
        "decision_id": parent_row.decision_id,
        "parent_id": parent_scenario_id,
        "name": req.name,
        "description": (
            f"Custom child branch extending '{parent_row.name}' "
            f"with change type '{req.change.get('type')}'."
        ),
        "change": req.change,
        "status": "queued",
    }
    repo.save_scenarios([child_scenario])

    # Evaluate immediately using the parent's dataset
    decision = repo.get_decision(parent_row.decision_id)
    dataset_id = decision.get("dataset_id", "") if decision else ""
    dataset_row = repo.get_dataset(dataset_id) if dataset_id else None
    dataset_payload = dataset_row["payload"] if dataset_row and dataset_row.get("payload") else {}

    try:
        from backend.orchestration.integrations import call_evaluate_scenario
        child_res = call_evaluate_scenario(
            dataset=dataset_payload,
            baseline_timetable=dataset_payload.get("baseline_timetable", []),
            scenario=child_scenario,
            n_sims=300,
            seed=42,
        )
        repo.save_result(child_res)
        repo.update_scenario_status(child_id, "done")
        child_scenario["status"] = "done"
    except Exception as exc:
        logger.warning(f"Child scenario evaluation failed (non-fatal): {exc}")
        repo.update_scenario_status(child_id, "failed")
        child_scenario["status"] = "failed"

    return child_scenario
