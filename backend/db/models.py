"""
FutureFork Database Models
Stores flexible payloads as JSON/JSONB across SQLite and Supabase Postgres.
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, String, Text

from backend.db.session import Base


class DatasetModel(Base):
    __tablename__ = "datasets"

    id = Column(String(100), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    stats = Column(JSON, nullable=False)
    baseline_metrics = Column(JSON, nullable=False)
    payload = Column(JSON, nullable=True) # Full dataset bundle
    created_at = Column(DateTime, default=datetime.utcnow)

class DecisionModel(Base):
    __tablename__ = "decisions"

    id = Column(String(100), primary_key=True, index=True)
    text = Column(Text, nullable=False)
    dataset_id = Column(String(100), nullable=False, index=True)
    status = Column(String(50), default="ok")
    message = Column(Text, nullable=True)
    spec = Column(JSON, nullable=False) # DecisionSpec dict
    created_at = Column(DateTime, default=datetime.utcnow)

class ScenarioModel(Base):
    __tablename__ = "scenarios"

    id = Column(String(100), primary_key=True, index=True)
    decision_id = Column(String(100), nullable=False, index=True)
    parent_id = Column(String(100), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    change = Column(JSON, nullable=False)
    status = Column(String(50), default="queued") # queued | running | done | failed
    created_at = Column(DateTime, default=datetime.utcnow)

class RunModel(Base):
    __tablename__ = "runs"

    id = Column(String(100), primary_key=True, index=True)
    decision_id = Column(String(100), nullable=False, index=True)
    overall_status = Column(String(50), default="queued") # queued | running | done | failed
    progress_percent = Column(Float, default=0.0)
    scenario_statuses = Column(JSON, default=dict) # Dict[scenario_id, status]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ResultModel(Base):
    __tablename__ = "results"

    scenario_id = Column(String(100), primary_key=True, index=True)
    solver = Column(JSON, nullable=False)
    metrics = Column(JSON, nullable=False)
    simulation = Column(JSON, nullable=False)
    timetable = Column(JSON, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class CacheModel(Base):
    __tablename__ = "cache"

    cache_key = Column(String(255), primary_key=True, index=True)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
