"""
FutureFork Database Repository & Seeder
Member 5: Added upload/commit methods for the CSV inspect→commit pipeline.
"""

import base64
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.db.models import (
    CacheModel,
    DatasetModel,
    DecisionModel,
    ResultModel,
    RunModel,
    ScenarioModel,
    UploadModel,
)
from backend.db.session import Base, SessionLocal, engine
from data.loader import default_loader


def init_db():
    Base.metadata.create_all(bind=engine)
    # Seed default dataset if not present
    db = SessionLocal()
    try:
        existing = db.query(DatasetModel).filter(DatasetModel.id == "sample_univ_v1").first()
        if not existing:
            bundle = default_loader.load_bundle()
            summary = bundle["summary"]
            ds = DatasetModel(
                id=summary["id"],
                name=summary["name"],
                description=summary["description"],
                stats=summary["stats"],
                baseline_metrics=summary["baseline_metrics"],
                payload=bundle,
            )
            db.add(ds)
            db.commit()
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
    ) -> UploadModel:
        """Persist raw CSV bytes (base64) with a TTL expiry for /datasets/inspect."""
        encoded = base64.b64encode(csv_bytes).decode("utf-8")
        expires = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        model = UploadModel(
            upload_id=upload_id,
            filename=filename,
            csv_bytes=encoded,
            preview_rows=preview_rows,
            column_mapping=column_mapping,
            expires_at=expires,
        )
        self.db.merge(model)
        self.db.commit()
        return model

    def get_upload(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a non-expired upload by ID."""
        row = self.db.query(UploadModel).filter(UploadModel.upload_id == upload_id).first()
        if not row:
            return None
        if row.expires_at < datetime.utcnow():
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
        }

    def delete_upload(self, upload_id: str) -> None:
        row = self.db.query(UploadModel).filter(UploadModel.upload_id == upload_id).first()
        if row:
            self.db.delete(row)
            self.db.commit()

    # ------------------------------------------------------------------
    # Dataset queries
    # ------------------------------------------------------------------

    def list_datasets(self) -> List[Dict[str, Any]]:
        rows = self.db.query(DatasetModel).all()
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
        }

    # ------------------------------------------------------------------
    # Decision queries
    # ------------------------------------------------------------------

    def save_decision(self, spec: Dict[str, Any]) -> DecisionModel:
        model = DecisionModel(
            id=spec["id"],
            text=spec["text"],
            dataset_id=spec["dataset_id"],
            status=spec["status"],
            message=spec.get("message"),
            spec=spec,
        )
        self.db.merge(model)
        self.db.commit()
        return model

    def get_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        row = self.db.query(DecisionModel).filter(DecisionModel.id == decision_id).first()
        return row.spec if row else None

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
        model = ResultModel(
            scenario_id=result["scenario_id"],
            solver=result["solver"],
            metrics=result["metrics"],
            simulation=result["simulation"],
            timetable=result["timetable"],
            explanation=result.get("explanation"),
        )
        self.db.merge(model)
        self.db.commit()

    def get_result(self, scenario_id: str) -> Optional[Dict[str, Any]]:
        r = self.db.query(ResultModel).filter(ResultModel.scenario_id == scenario_id).first()
        if not r:
            return None
        return {
            "scenario_id": r.scenario_id,
            "solver": r.solver,
            "metrics": r.metrics,
            "simulation": r.simulation,
            "timetable": r.timetable,
            "explanation": r.explanation,
        }

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
