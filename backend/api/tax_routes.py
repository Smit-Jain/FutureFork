"""
ITR helper endpoints. Every amount comes from engine/tax; the explainer only adds words.

  GET    /tax/rules                  → supported years and the limits the UI shows as hints
  POST   /tax/compute                → compute a report without saving (live preview)
  GET    /tax/profiles               → the signed-in user's saved returns
  POST   /tax/profiles               → compute and save a new one
  GET    /tax/profiles/{id}          → one saved return (with its last report)
  PUT    /tax/profiles/{id}          → update inputs and recompute
  DELETE /tax/profiles/{id}          → delete
  GET    /tax/profiles/{id}/export   → JSON summary download
"""

from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from backend.auth.deps import require_user
from backend.db.models import UserModel
from backend.db.repository import Repository
from backend.db.session import get_db
from backend.orchestration.integrations import call_tax_report
from contracts.schemas import (
    TaxInputsModel,
    TaxProfile,
    TaxProfileList,
    TaxProfileSave,
    TaxReport,
    TaxRulesResponse,
)
from engine.tax import DEFAULT_FY, RULES

router = APIRouter(prefix="/tax", tags=["tax"])

_TYPE_LABEL = {"salaried": "Salaried", "freelancer": "Freelancer", "business": "Business"}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail={"error": "TAX_PROFILE_NOT_FOUND", "message": "Tax profile not found"})


def _report(inputs: TaxInputsModel, explain: bool = True) -> Dict[str, Any]:
    try:
        return call_tax_report(inputs.model_dump(), explain=explain)
    except ValueError as exc:
        raise HTTPException(
            422, detail={"error": "INVALID_TAX_INPUTS", "message": str(exc)}
        )


def _label(req: TaxProfileSave) -> str:
    if req.label and req.label.strip():
        return req.label.strip()
    return f"{_TYPE_LABEL[req.inputs.taxpayer_type]} · FY {req.inputs.fy}"


@router.get("/rules", response_model=TaxRulesResponse)
def tax_rules(user: UserModel = Depends(require_user)):
    years = []
    for r in RULES.values():
        years.append(
            {
                "fy": r.fy,
                "ay": r.ay,
                "status": r.status,
                "standard_deduction_new": r.new.standard_deduction,
                "standard_deduction_old": r.old.standard_deduction,
                "rebate_limit_new": r.new.rebate_income_limit,
                "cap_80c": r.cap_80c,
                "cap_80ccd1b": r.cap_80ccd1b,
                "cap_80d_self": r.cap_80d_self,
                "cap_80d_self_senior": r.cap_80d_self_senior,
                "cap_80d_parents": r.cap_80d_parents,
                "cap_80d_parents_senior": r.cap_80d_parents_senior,
                "cap_24b": r.cap_24b,
                "ltcg_112a_exempt": r.ltcg_112a_exempt,
                "limit_44ada": r.limit_44ada,
                "limit_44ada_digital": r.limit_44ada_digital,
                "limit_44ad": r.limit_44ad,
                "limit_44ad_digital": r.limit_44ad_digital,
                "due_date_salaried": r.due_date_salaried.isoformat(),
                "due_date_business": r.due_date_business.isoformat(),
                "belated_until": r.belated_until.isoformat(),
            }
        )
    return {"default_fy": DEFAULT_FY, "years": years}


@router.post("/compute", response_model=TaxReport)
def tax_compute(inputs: TaxInputsModel, explain: bool = False, user: UserModel = Depends(require_user)):
    """Live preview while the user types: engine numbers, no saving, no LLM unless asked."""
    return _report(inputs, explain=explain)


@router.get("/profiles", response_model=TaxProfileList)
def list_profiles(db: Session = Depends(get_db), user: UserModel = Depends(require_user)):
    return {"items": Repository(db).list_tax_profiles(user.id)}


@router.post("/profiles", response_model=TaxProfile, status_code=status.HTTP_201_CREATED)
def create_profile(req: TaxProfileSave, db: Session = Depends(get_db), user: UserModel = Depends(require_user)):
    report = _report(req.inputs)
    return Repository(db).save_tax_profile(user.id, _label(req), req.inputs.model_dump(), report)


@router.get("/profiles/{profile_id}", response_model=TaxProfile)
def get_profile(profile_id: str, db: Session = Depends(get_db), user: UserModel = Depends(require_user)):
    p = Repository(db).get_tax_profile(profile_id, user.id)
    if not p:
        raise _not_found()
    return p


@router.put("/profiles/{profile_id}", response_model=TaxProfile)
def update_profile(
    profile_id: str, req: TaxProfileSave, db: Session = Depends(get_db), user: UserModel = Depends(require_user)
):
    repo = Repository(db)
    if not repo.get_tax_profile(profile_id, user.id):
        raise _not_found()
    report = _report(req.inputs)
    return repo.save_tax_profile(user.id, _label(req), req.inputs.model_dump(), report, profile_id=profile_id)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: str, db: Session = Depends(get_db), user: UserModel = Depends(require_user)):
    if not Repository(db).delete_tax_profile(profile_id, user.id):
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/profiles/{profile_id}/export")
def export_profile(profile_id: str, db: Session = Depends(get_db), user: UserModel = Depends(require_user)):
    p = Repository(db).get_tax_profile(profile_id, user.id)
    if not p:
        raise _not_found()
    report = p.get("report") or {}
    summary = {
        "generated_by": "FutureFork ITR helper (guidance only, not a filed return)",
        "label": p["label"],
        "financial_year": report.get("fy"),
        "assessment_year": report.get("ay"),
        "as_of": report.get("as_of"),
        "verdict": report.get("verdict"),
        "itr_form": report.get("form"),
        "filing_window": report.get("window"),
        "recommended_regime": report.get("recommended"),
        "tax": {k: report.get(k, {}).get("total_tax") for k in ("new", "old")},
        "breakdown": report.get(report.get("recommended", "new")),
        "late_fee": report.get("late_fee"),
        "checklist": report.get("checklist"),
        "inputs": p["inputs"],
    }
    filename = f"futurefork-itr-{report.get('ay', 'summary')}-{profile_id}.json"
    return Response(
        content=json.dumps(summary, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
