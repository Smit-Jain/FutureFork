"""
FutureFork Column Mapper Agent (Member 4)

Proposes a ColumnMapping from CSV headers + ≤3 sample rows.

Tier 1: LLM — sends ONLY headers + max 3 rows, validates mapped cols against
         real headers (case-insensitive), rejects hallucinated columns.
         1 retry on invalid JSON/hallucination, then falls to Tier 2.
Tier 2: Deterministic regex/heuristic fallback — always works offline.

Public API:
  propose_mapping(headers, sample_rows, dataset_type_hint=None) -> MappingResult

MappingResult is a dataclass with:
  mapping:       ColumnMapping
  confidence:    float  (0.0–1.0)
  dataset_type:  str    ("personal" | "institute" | "startup" | "unknown")
  tier_used:     str    ("llm" | "regex")
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

from engine.model import ColumnMapping

logger = logging.getLogger("futurefork.ai.agents.mapper")

# ---------------------------------------------------------------------------
# Public result type
# ---------------------------------------------------------------------------


@dataclass
class MappingResult:
    """
    Result of propose_mapping().

    Attributes:
        mapping:       A ColumnMapping ready for FinancialIngestor.compile().
        confidence:    0.0–1.0 confidence score.
        dataset_type:  Detected dataset type string.
        tier_used:     "llm" or "regex".
    """

    mapping: ColumnMapping
    confidence: float
    dataset_type: str
    tier_used: str


# ---------------------------------------------------------------------------
# LLM-tier helpers
# ---------------------------------------------------------------------------

_LLM_SYSTEM_PROMPT = """You are a financial CSV column mapper.
Given CSV headers and sample rows, output a JSON object with these keys
(use null if column not applicable):
  date_col, amount_col, debit_col, credit_col, category_col, description_col, type_col, date_format

IMPORTANT: Every non-null value MUST be one of the exact CSV column header strings provided.
Do not invent column names. Output ONLY valid JSON, no explanation."""


def _call_llm_for_mapping(
    headers: List[str],
    sample_rows: List[Union[List[Any], Dict[str, Any]]],
) -> Optional[Dict[str, Any]]:
    """
    Calls the LLM for a column mapping suggestion.

    Returns:
        Parsed JSON dict or None if LLM unavailable / fails.
    """
    offline = os.environ.get("FUTUREFORK_OFFLINE", "").strip() in ("1", "true", "yes")
    if offline:
        logger.debug("FUTUREFORK_OFFLINE=1: skipping LLM tier in mapper.")
        return None

    # Build a compact prompt
    rows_to_send = sample_rows[:3]
    prompt_data = {
        "headers": headers,
        "sample_rows": rows_to_send,
    }
    prompt = f"CSV metadata:\n{json.dumps(prompt_data, default=str, indent=2)}"

    try:
        from pydantic import BaseModel

        from ai.llm import call_structured_llm

        class _MapSchema(BaseModel):
            date_col: Optional[str] = None
            amount_col: Optional[str] = None
            debit_col: Optional[str] = None
            credit_col: Optional[str] = None
            category_col: Optional[str] = None
            description_col: Optional[str] = None
            type_col: Optional[str] = None
            date_format: Optional[str] = None

        result = call_structured_llm(
            prompt=prompt,
            system_prompt=_LLM_SYSTEM_PROMPT,
            response_model=_MapSchema,
            fallback_generator=lambda: None,
            max_retries=1,
        )
        if result is None:
            return None
        return result.model_dump()
    except Exception as exc:
        logger.warning("LLM call for column mapping failed: %s", exc)
        return None


def _validate_llm_mapping(
    llm_dict: Dict[str, Any],
    headers: List[str],
) -> Optional[Dict[str, Any]]:
    """
    Validate LLM mapping by ensuring every non-None value exists in headers
    (case-insensitive). Reject hallucinated column names.

    Returns:
        Sanitised dict or None if too many hallucinations.
    """
    hmap_lower = {h.lower(): h for h in headers}
    cleaned: Dict[str, Any] = {}
    hallucinations = 0
    total_non_null = 0

    skip_fields = {"date_format"}

    for field, val in llm_dict.items():
        if field in skip_fields:
            cleaned[field] = val
            continue
        if val is None:
            cleaned[field] = None
            continue
        total_non_null += 1
        orig = hmap_lower.get(str(val).lower())
        if orig is not None:
            cleaned[field] = orig
        else:
            logger.warning(
                "LLM hallucinated column '%s' for field '%s' (not in headers). Dropping.",
                val,
                field,
            )
            cleaned[field] = None
            hallucinations += 1

    if total_non_null > 0 and hallucinations / total_non_null > 0.5:
        logger.warning(
            "Too many hallucinations (%d/%d). Rejecting LLM mapping entirely.",
            hallucinations,
            total_non_null,
        )
        return None

    return cleaned


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def propose_mapping(
    headers: List[str],
    sample_rows: List[Union[List[Any], Dict[str, Any]]],
    dataset_type_hint: Optional[str] = None,
) -> MappingResult:
    """
    Propose a ColumnMapping from CSV headers and sample rows.

    Tier 1 (LLM, optional): headers + up to 3 rows. Only columns that exist are accepted.
    Tier 2 (deterministic): data.normalize.detect_columns on headers AND values. It also
    fills any role the LLM left empty (e.g. the running-balance column).

    Args:
        headers:           Column headers (already cleaned by data.normalize.load_table).
        sample_rows:       Sample rows (dicts keyed by header, or lists in header order).
        dataset_type_hint: Optional "personal" | "institute" | "startup".
    """
    import pandas as pd

    from data.normalize import detect_columns, detect_dataset_type

    if not headers:
        return MappingResult(mapping=ColumnMapping(), confidence=0.0, dataset_type="personal", tier_used="regex")

    rows = [r if isinstance(r, dict) else dict(zip(headers, r)) for r in sample_rows]
    df = pd.DataFrame(rows, columns=headers, dtype=object).fillna("")
    detection = detect_columns(df)
    dataset_type = dataset_type_hint or detect_dataset_type(df, detection.mapping)

    llm_raw = _call_llm_for_mapping(headers, rows[:3])
    if llm_raw is not None:
        validated = _validate_llm_mapping(llm_raw, headers)
        if validated is not None:
            det = detection.mapping
            mapping = ColumnMapping(
                date_col=validated.get("date_col") or det.date_col,
                amount_col=validated.get("amount_col"),
                debit_col=validated.get("debit_col"),
                credit_col=validated.get("credit_col"),
                category_col=validated.get("category_col") or det.category_col,
                description_col=validated.get("description_col") or det.description_col,
                type_col=validated.get("type_col") or det.type_col,
                balance_col=det.balance_col,
                date_format=validated.get("date_format"),
                starting_balance=0.0,
            )
            if not (mapping.amount_col or mapping.debit_col or mapping.credit_col):
                mapping.amount_col, mapping.debit_col, mapping.credit_col = det.amount_col, det.debit_col, det.credit_col
            logger.info("mapper: used LLM tier (dataset_type=%s)", dataset_type)
            return MappingResult(mapping=mapping, confidence=max(0.88, detection.confidence),
                                 dataset_type=dataset_type, tier_used="llm")
        logger.info("mapper: LLM mapping validation failed, using deterministic detection.")

    logger.info("mapper: used deterministic detection (dataset_type=%s, confidence=%.2f)",
                dataset_type, detection.confidence)
    return MappingResult(mapping=detection.mapping, confidence=detection.confidence,
                         dataset_type=dataset_type, tier_used="regex")
