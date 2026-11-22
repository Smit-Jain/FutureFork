"""
FutureFork Database Repository & Seeder
Persists uploads, datasets, decisions, scenarios, runs, results and the result cache.
Seeds the bundled sample CSVs as ready-to-use financial datasets on startup.
"""

import base64
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.db.models import (
    CacheModel,
    DatasetModel,
    DecisionModel,
    ResultModel,
    RunModel,
    ScenarioModel,
    TaxProfileModel,
    UploadModel,
    UserModel,
)
from backend.db.session import DATABASE_URL, SessionLocal, engine

logger = logging.getLogger("futurefork.db")

# Bundled sample CSVs seeded as ready-to-use datasets: (dataset_id, csv name, display name, type)
SAMPLE_DATASETS = [
    ("sample_personal", "personal_upi.csv", "Sample: Personal UPI Statement", "personal"),
    ("sample_institute", "institute_erp_1.8cr.csv", "Sample: Institute ERP Ledger (~₹1.8 Cr)", "institute"),
    ("sample_startup", "startup_pnl.csv", "Sample: Startup P&L / Burn", "startup"),
]


def build_dataset_record(
    instance: Any,
    dataset_id: str,
    name: str,
    dataset_type: str,
    source_filename: str,
    column_mapping: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Builds the persisted dataset record (summary + compiled instance + Node 0 metrics)."""
    from engine.solver import attach_simulation, evaluate_financial_baseline

    instance.dataset_id = dataset_id
    instance.name = name
    baseline = attach_simulation(evaluate_financial_baseline(instance, emergency_floor=0.0), instance)
    stats = {
        "months": len(instance.months),
        "categories": len(instance.categories),
        "starting_balance": instance.starting_balance,
        "total_inflow": round(float(sum(instance.inflows)), 2),
        "total_outflow": round(float(sum(instance.total_outflows)), 2),
        "category_types": instance.category_types,
        "observed_months": int(instance.raw_metadata.get("observed_months", len(instance.months))),
        "projected_months": list(instance.raw_metadata.get("projected_months", [])),
        "currency": instance.raw_metadata.get("currency", "INR"),
        "warnings": list(instance.raw_metadata.get("warnings", [])),
    }
    description = f"Financial dataset compiled from {source_filename}"
    summary = {
        "id": dataset_id,
        "name": name,
        "description": description,
        "dataset_type": dataset_type,
        "stats": stats,
        "baseline_metrics": baseline.metrics,
    }
    return {
        "id": dataset_id,
        "name": name,
        "description": description,
        "stats": stats,
        "baseline_metrics": baseline.metrics,
        "payload": {
            "summary": summary,
            "instance": instance.to_dict(),
            "column_mapping": column_mapping or {},
            "source_filename": source_filename,
        },
    }


ROOT_DIR = Path(__file__).resolve().parents[2]


def run_migrations() -> None:
    """Brings the database to the latest Alembic revision (idempotent; safe on every start)."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    # Pre-Alembic repair (from upstream 17c4887): very old local DBs had a results table with
    # another shape; drop it so migration 0001 recreates it. Results are a cache of engine output.
    with engine.connect() as conn:
        inspector = inspect(conn)
        if "results" in inspector.get_table_names():
            columns = {col["name"] for col in inspector.get_columns("results")}
            if "decision_id" not in columns or "payload" not in columns:
                logger.info("Migrating legacy results table to modern schema...")
                conn.execute(text("DROP TABLE results"))
                conn.commit()

    cfg = Config(str(ROOT_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT_DIR / "backend" / "db" / "migrations"))
    cfg.attributes["embedded"] = True  # keep the app's logging configuration
    command.upgrade(cfg, "head")
    logger.info("Database schema is up to date (%s)", DATABASE_URL.split("://", 1)[0])


def init_db():
    run_migrations()
    db = SessionLocal()
    try:
        repo = Repository(db)
        for dataset_id, csv_name, display_name, dataset_type in SAMPLE_DATASETS:
            if repo.get_dataset(dataset_id):
                continue
            try:
                from data.loader import load_sample_instance

                instance = load_sample_instance(csv_name)
                repo.save_dataset(
                    build_dataset_record(instance, dataset_id, display_name, dataset_type, csv_name)
                )
            except Exception as exc:  # a broken sample must not stop the API from starting
                logger.warning("Could not seed sample dataset %s: %s", dataset_id, exc)
    finally:
        db.close()


class Repository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # MEMBER 5: Upload buffer (inspect → commit flow)
    # ------------------------------------------------------------------

    def save_upload(
        self,
        upload_id: str,
        csv_bytes: bytes,
        filename: str,
        preview_rows: List[Dict[str, Any]],
        column_mapping: Dict[str, Any],
        ttl_minutes: int = 15,
        user_id: Optional[str] = None,
    ) -> UploadModel:
        """Persist raw CSV bytes (base64) with a TTL expiry for /datasets/inspect."""
        encoded = base64.b64encode(csv_bytes).decode("utf-8")
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=ttl_minutes)
        model = UploadModel(
            upload_id=upload_id,
            filename=filename,
            csv_bytes=encoded,
            preview_rows=preview_rows,
            column_mapping=column_mapping,
            expires_at=expires,
            user_id=user_id,
        )
        self.db.merge(model)
        self.db.commit()
        return model

    def get_upload(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a non-expired upload by ID."""
        row = self.db.query(UploadModel).filter(UploadModel.upload_id == upload_id).first()
        if not row:
            return None
        if row.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            # TTL expired — delete and return None
            self.db.delete(row)
            self.db.commit()
            return None
        return {
            "upload_id": row.upload_id,
            "filename": row.filename,
            "csv_bytes": base64.b64decode(row.csv_bytes),
            "preview_rows": row.preview_rows,
            "column_mapping": row.column_mapping,
            "expires_at": row.expires_at.isoformat(),
            "user_id": row.user_id,
        }

    def delete_upload(self, upload_id: str) -> None:
        row = self.db.query(UploadModel).filter(UploadModel.upload_id == upload_id).first()
        if row:
            self.db.delete(row)
            self.db.commit()

    # ------------------------------------------------------------------
    # Dataset queries
    # ------------------------------------------------------------------

    def list_datasets(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Shared datasets (the samples) plus the given user's own, newest first after the samples."""
        q = self.db.query(DatasetModel)
        q = q.filter((DatasetModel.user_id.is_(None)) | (DatasetModel.user_id == user_id)) if user_id else q.filter(DatasetModel.user_id.is_(None))
        rows = q.order_by(DatasetModel.user_id.isnot(None), DatasetModel.created_at.desc()).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "stats": r.stats,
                "baseline_metrics": r.baseline_metrics,
            }
            for r in rows
        ]

    def save_dataset(self, ds_dict: Dict[str, Any]) -> DatasetModel:
        """Upsert a dataset bundle (used by /datasets/commit)."""
        model = DatasetModel(
            id=ds_dict["id"],
            name=ds_dict["name"],
            description=ds_dict.get("description", ""),
            stats=ds_dict["stats"],
            baseline_metrics=ds_dict["baseline_metrics"],
            payload=ds_dict.get("payload"),
            user_id=ds_dict.get("user_id"),
        )
        self.db.merge(model)
        self.db.commit()
        return model

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        r = self.db.query(DatasetModel).filter(DatasetModel.id == dataset_id).first()
        if not r:
            return None
        return {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "stats": r.stats,
            "baseline_metrics": r.baseline_metrics,
            "payload": r.payload,
            "user_id": r.user_id,
        }

    # ------------------------------------------------------------------
    # Decision queries
    # ------------------------------------------------------------------

    def save_decision(self, spec: Dict[str, Any], user_id: Optional[str] = None) -> DecisionModel:
        model = DecisionModel(
            id=spec["id"],
            text=spec["text"],
            dataset_id=spec["dataset_id"],
            status=spec["status"],
            message=spec.get("message"),
            spec=spec,
            user_id=user_id,
        )
        self.db.merge(model)
        self.db.commit()
        return model

    def get_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        row = self.db.query(DecisionModel).filter(DecisionModel.id == decision_id).first()
        return row.spec if row else None

    def get_decision_owner(self, decision_id: str) -> tuple[bool, Optional[str]]:
        """(exists, owning user id) for a decision."""
        row = self.db.query(DecisionModel.user_id).filter(DecisionModel.id == decision_id).first()
        return (row is not None, row[0] if row else None)

    def list_decisions_for(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """A user's decisions, newest first, with dataset name and the latest run's status."""
        rows = (
            self.db.query(DecisionModel, DatasetModel.name)
            .outerjoin(DatasetModel, DatasetModel.id == DecisionModel.dataset_id)
            .filter(DecisionModel.user_id == user_id)
            .order_by(DecisionModel.created_at.desc(), DecisionModel.id.desc())
            .limit(limit)
            .all()
        )
        out: List[Dict[str, Any]] = []
        for d, dataset_name in rows:
            run = (
                self.db.query(RunModel.overall_status)
                .filter(RunModel.decision_id == d.id)
                .order_by(RunModel.created_at.desc())
                .first()
            )
            spec = d.spec or {}
            out.append(
                {
                    "id": d.id,
                    "text": d.text,
                    "dataset_id": d.dataset_id,
                    "dataset_name": dataset_name or d.dataset_id,
                    "status": d.status,
                    "decision_kind": spec.get("decision_kind"),
                    "understood": spec.get("understood"),
                    "run_status": run[0] if run else None,
                    "created_at": (d.created_at.isoformat() + "Z") if d.created_at else None,  # stored as UTC
                }
            )
        return out

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def upsert_google_user(self, sub: str, email: str, name: Optional[str], picture: Optional[str]) -> UserModel:
        """Find the user by Google's stable `sub`, or create them; refresh profile fields on each login."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        user = self.db.query(UserModel).filter(UserModel.google_sub == sub).first()
        if user is None:
            user = UserModel(id=uuid.uuid4().hex, google_sub=sub, email=email, name=name, picture=picture, created_at=now)
            self.db.add(user)
        else:
            user.email, user.name, user.picture = email, name, picture
        user.last_login_at = now
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_user(self, user_id: str) -> Optional[UserModel]:
        return self.db.query(UserModel).filter(UserModel.id == user_id).first()

    # ------------------------------------------------------------------
    # Scenario queries
    # ------------------------------------------------------------------

    def save_scenarios(self, scenarios: List[Dict[str, Any]]):
        for s in scenarios:
            model = ScenarioModel(
                id=s["id"],
                decision_id=s["decision_id"],
                parent_id=s.get("parent_id"),
                name=s["name"],
                description=s.get("description", ""),
                change=s["change"],
                status=s.get("status", "queued"),
            )
            self.db.merge(model)
        self.db.commit()

    def get_scenarios(self, decision_id: str) -> List[Dict[str, Any]]:
        rows = self.db.query(ScenarioModel).filter(ScenarioModel.decision_id == decision_id).all()
        return [
            {
                "id": r.id,
                "decision_id": r.decision_id,
                "parent_id": r.parent_id,
                "name": r.name,
                "description": r.description,
                "change": r.change,
                "status": r.status,
            }
            for r in rows
        ]

    def update_scenario_status(self, scenario_id: str, status: str):
        row = self.db.query(ScenarioModel).filter(ScenarioModel.id == scenario_id).first()
        if row:
            row.status = status
            self.db.commit()

    # ------------------------------------------------------------------
    # Run queries
    # ------------------------------------------------------------------

    def create_run(self, run_id: str, decision_id: str, scenario_ids: List[str]) -> RunModel:
        statuses = {s_id: "queued" for s_id in scenario_ids}
        run = RunModel(
            id=run_id,
            decision_id=decision_id,
            overall_status="queued",
            progress_percent=0.0,
            scenario_statuses=statuses,
        )
        self.db.add(run)
        self.db.commit()
        return run

    def update_run_status(
        self,
        run_id: str,
        overall_status: str,
        progress_percent: float,
        scenario_statuses: Dict[str, str],
    ):
        run = self.db.query(RunModel).filter(RunModel.id == run_id).first()
        if run:
            run.overall_status = overall_status
            run.progress_percent = progress_percent
            run.scenario_statuses = scenario_statuses
            self.db.commit()

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        r = self.db.query(RunModel).filter(RunModel.id == run_id).first()
        if not r:
            return None
        return {
            "run_id": r.id,
            "decision_id": r.decision_id,
            "overall_status": r.overall_status,
            "progress_percent": r.progress_percent,
            "scenarios": r.scenario_statuses,
        }

    # ------------------------------------------------------------------
    # Result queries
    # ------------------------------------------------------------------

    def save_result(self, result: Dict[str, Any]):
        """Stores a raw engine result (see integrations.call_evaluate_scenario)."""
        model = ResultModel(
            scenario_id=result["scenario_id"],
            decision_id=result.get("decision_id"),
            branch_type=result.get("branch_type"),
            payload=result,
        )
        self.db.merge(model)
        self.db.commit()

    def get_result(self, scenario_id: str) -> Optional[Dict[str, Any]]:
        """Returns the raw engine result dict for a scenario, or None."""
        r = self.db.query(ResultModel).filter(ResultModel.scenario_id == scenario_id).first()
        return dict(r.payload) if r else None

    # ------------------------------------------------------------------
    # Caching
    # ------------------------------------------------------------------

    def get_cached_result(self, key: str) -> Optional[Dict[str, Any]]:
        row = self.db.query(CacheModel).filter(CacheModel.cache_key == key).first()
        return row.result if row else None

    def set_cached_result(self, key: str, val: Dict[str, Any]):
        entry = CacheModel(cache_key=key, result=val)
        self.db.merge(entry)
        self.db.commit()

    # ------------------------------------------------------------------
    # ITR helper: tax profiles (always owned by one user)
    # ------------------------------------------------------------------

    @staticmethod
    def _iso(dt: Optional[datetime]) -> Optional[str]:
        return (dt.isoformat() + "Z") if dt else None  # stored as naive UTC

    def _tax_dict(self, row: TaxProfileModel) -> Dict[str, Any]:
        return {
            "id": row.id,
            "label": row.label,
            "fy": row.fy,
            "inputs": row.inputs,
            "report": row.report,
            "created_at": self._iso(row.created_at),
            "updated_at": self._iso(row.updated_at),
        }

    def get_tax_profile(self, profile_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        row = (
            self.db.query(TaxProfileModel)
            .filter(TaxProfileModel.id == profile_id, TaxProfileModel.user_id == user_id)
            .first()
        )
        return self._tax_dict(row) if row else None

    def save_tax_profile(
        self,
        user_id: str,
        label: str,
        inputs: Dict[str, Any],
        report: Optional[Dict[str, Any]],
        profile_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create, or update the caller's own profile. Returns None if profile_id isn't theirs."""
        from backend.db.models import utcnow

        if profile_id:
            row = (
                self.db.query(TaxProfileModel)
                .filter(TaxProfileModel.id == profile_id, TaxProfileModel.user_id == user_id)
                .first()
            )
            if row is None:
                return None
        else:
            row = TaxProfileModel(id=f"tax_{uuid.uuid4().hex[:16]}", user_id=user_id, created_at=utcnow())
            self.db.add(row)
        row.label, row.fy, row.inputs, row.report = label, inputs.get("fy", "2025-26"), inputs, report
        row.updated_at = utcnow()
        self.db.commit()
        self.db.refresh(row)
        return self._tax_dict(row)

    def delete_tax_profile(self, profile_id: str, user_id: str) -> bool:
        n = (
            self.db.query(TaxProfileModel)
            .filter(TaxProfileModel.id == profile_id, TaxProfileModel.user_id == user_id)
            .delete()
        )
        self.db.commit()
        return n > 0

    def list_tax_profiles(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        rows = (
            self.db.query(TaxProfileModel)
            .filter(TaxProfileModel.user_id == user_id)
            .order_by(TaxProfileModel.updated_at.desc(), TaxProfileModel.id.desc())
            .limit(limit)
            .all()
        )
        out = []
        for r in rows:
            report = r.report or {}
            out.append(
                {
                    "id": r.id,
                    "label": r.label,
                    "fy": r.fy,
                    "taxpayer_type": (r.inputs or {}).get("taxpayer_type", "salaried"),
                    "headline": (report.get("verdict") or {}).get("headline"),
                    "form": (report.get("form") or {}).get("form"),
                    "updated_at": self._iso(r.updated_at),
                }
            )
        return out
