"""
FutureFork Database Models
Stores flexible payloads as JSON/JSONB across SQLite and Supabase Postgres.

Member 5 additions:
  - UploadModel  : transient raw-CSV store with 15-min TTL and ColumnMapping cache
"""


from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, String, Text


def utcnow() -> datetime:
    """Naive UTC timestamp, set by the app so every database stores the same clock
    (Postgres' now() would otherwise use the server's local time zone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

from backend.db.session import Base

# ---------------------------------------------------------------------------
# Users (Google Sign-In)
# ---------------------------------------------------------------------------

class UserModel(Base):
    __tablename__ = "users"

    id            = Column(String(64), primary_key=True)             # uuid4 hex
    google_sub    = Column(String(255), nullable=False, unique=True, index=True)  # Google's stable user id
    email         = Column(String(320), nullable=False, index=True)
    name          = Column(String(255), nullable=True)
    picture       = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=utcnow)
    last_login_at = Column(DateTime, default=utcnow)


def _owner():
    """Owning user; NULL for shared rows such as the bundled sample datasets."""
    return Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)


# ---------------------------------------------------------------------------
# MEMBER 5: Upload buffer for POST /datasets/inspect → POST /datasets/commit
# ---------------------------------------------------------------------------

class UploadModel(Base):
    __tablename__ = "uploads"

    upload_id    = Column(String(100), primary_key=True, index=True)
    filename     = Column(String(500), nullable=True)
    csv_bytes    = Column(Text, nullable=False)          # base64-encoded raw CSV bytes
    preview_rows = Column(JSON,  nullable=True)          # 5-row preview list[dict]
    column_mapping = Column(JSON, nullable=True)         # proposed ColumnMapping dict
    expires_at   = Column(DateTime, nullable=False)      # created_at + 15 min TTL
    created_at   = Column(DateTime, default=utcnow)
    user_id      = _owner()


# ---------------------------------------------------------------------------
# EXISTING MODELS (unchanged)
# ---------------------------------------------------------------------------

class DatasetModel(Base):
    __tablename__ = "datasets"

    id               = Column(String(100), primary_key=True, index=True)
    name             = Column(String(255), nullable=False)
    description      = Column(Text, nullable=True)
    stats            = Column(JSON, nullable=False)
    baseline_metrics = Column(JSON, nullable=False)
    payload          = Column(JSON, nullable=True)   # Full dataset bundle
    created_at       = Column(DateTime, default=utcnow)
    user_id          = _owner()


class DecisionModel(Base):
    __tablename__ = "decisions"

    id         = Column(String(100), primary_key=True, index=True)
    text       = Column(Text, nullable=False)
    dataset_id = Column(String(100), nullable=False, index=True)
    status     = Column(String(50), default="ok")
    message    = Column(Text, nullable=True)
    spec       = Column(JSON, nullable=False)         # DecisionSpec dict
    created_at = Column(DateTime, default=utcnow, index=True)
    user_id    = _owner()


class ScenarioModel(Base):
    __tablename__ = "scenarios"

    id          = Column(String(100), primary_key=True, index=True)
    decision_id = Column(String(100), nullable=False, index=True)
    parent_id   = Column(String(100), nullable=True)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    change      = Column(JSON, nullable=False)
    status      = Column(String(50), default="queued")  # queued|running|done|failed
    created_at  = Column(DateTime, default=utcnow)


class RunModel(Base):
    __tablename__ = "runs"

    id               = Column(String(100), primary_key=True, index=True)
    decision_id      = Column(String(100), nullable=False, index=True)
    overall_status   = Column(String(50), default="queued")  # queued|running|done|failed
    progress_percent = Column(Float, default=0.0)
    scenario_statuses = Column(JSON, default=dict)           # Dict[scenario_id, status]
    created_at       = Column(DateTime, default=utcnow)
    updated_at       = Column(DateTime, default=utcnow, onupdate=utcnow)


class ResultModel(Base):
    __tablename__ = "results"

    scenario_id = Column(String(100), primary_key=True, index=True)
    decision_id = Column(String(100), nullable=True, index=True)
    branch_type = Column(String(50), nullable=True)
    payload     = Column(JSON, nullable=False)   # raw engine ScenarioEvaluationResult dict
    created_at  = Column(DateTime, default=utcnow)


class CacheModel(Base):
    __tablename__ = "cache"

    cache_key  = Column(String(255), primary_key=True, index=True)
    result     = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# ITR helper: one saved tax profile (inputs + last computed report) per row
# ---------------------------------------------------------------------------

class TaxProfileModel(Base):
    __tablename__ = "tax_profiles"

    id          = Column(String(64), primary_key=True)
    user_id     = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    fy          = Column(String(10), nullable=False)
    label       = Column(String(120), nullable=False)
    inputs      = Column(JSON, nullable=False)
    report      = Column(JSON, nullable=True)
    created_at  = Column(DateTime, default=utcnow)
    updated_at  = Column(DateTime, default=utcnow, onupdate=utcnow, index=True)
