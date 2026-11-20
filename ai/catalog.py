"""
FutureFork AI Catalog (Member 4)
Financial decision schemas for FutureFork 2.0.

Provides:
  - BigPurchaseDecision: Pydantic model for a financial purchase decision.
  - FINANCIAL_CATALOG: dict mapping decision type name to schema metadata.
  - get_financial_catalog_summary() -> str
  - is_financial_decision(text: str) -> bool
  - lookup_decision_schema(name: str) -> dict

Backward-compatible stubs (old timetable catalog):
  - CATALOG: original timetable dict (preserved as-is)
  - SUPPORTED_CHANGE_TYPES: list of old change type names
  - is_supported_change_type(change_type: str) -> bool
  - get_catalog_summary_text() -> str
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# ==============================================================================
# FINANCIAL CATALOG (NEW)
# ==============================================================================


class BigPurchaseDecision(BaseModel):
    """
    Schema for a financial big-purchase decision.

    Fields:
        item_label: Human-readable name of the item (e.g. "GPU Lab PCs").
        quantity: Optional count of units (e.g. 40 PCs).
        total_amount_inr: Total cost in Indian Rupees.
        emergency_floor_inr: Minimum cash reserve not to drop below (INR).
        target_month: Intended purchase month index 0-11 (0 = immediate).
        financing_preference: "upfront" | "emi" | "phased" | "trim" | "auto".
        emi_months: Number of EMI installments (3, 6, 9, or 12).
        dataset_type: Source dataset type ("personal" | "institute" | "startup").
    """

    item_label: str
    quantity: Optional[int] = None
    total_amount_inr: float
    emergency_floor_inr: float = 0.0
    target_month: int = 0
    financing_preference: str = "auto"  # "upfront"|"emi"|"phased"|"trim"|"auto"
    emi_months: int = 6
    dataset_type: str = "personal"  # "personal"|"institute"|"startup"


FINANCIAL_CATALOG: Dict[str, Dict[str, Any]] = {
    "big_purchase": {
        "name": "Big Purchase Decision",
        "description": (
            "Evaluates the financial feasibility of a one-time large capital purchase "
            "(equipment, infrastructure, assets) across 4 financing strategies: "
            "Upfront, EMI, Phased, and Trim-and-Buy."
        ),
        "schema": BigPurchaseDecision.model_json_schema(),
        "examples": [
            {
                "item_label": "GPU Lab PCs",
                "quantity": 40,
                "total_amount_inr": 6000000,
                "emergency_floor_inr": 2500000,
                "target_month": 0,
                "financing_preference": "auto",
                "emi_months": 6,
                "dataset_type": "institute",
            },
            {
                "item_label": "Laptop",
                "total_amount_inr": 120000,
                "emergency_floor_inr": 30000,
                "target_month": 0,
                "financing_preference": "emi",
                "emi_months": 12,
                "dataset_type": "personal",
            },
        ],
        "keywords": [
            "buy", "purchase", "acquire", "invest", "spend", "laptop", "pc", "server",
            "equipment", "machinery", "vehicle", "infrastructure", "hire", "recruit",
            "cloud", "credits", "gpu", "salary", "annual cost",
        ],
        "parameters": {
            "item_label": {"type": "string", "required": True},
            "quantity": {"type": "integer", "required": False},
            "total_amount_inr": {"type": "float", "required": True},
            "emergency_floor_inr": {"type": "float", "required": False, "default": 0.0},
            "target_month": {"type": "integer", "required": False, "default": 0},
            "financing_preference": {
                "type": "string",
                "enum": ["upfront", "emi", "phased", "trim", "auto"],
                "required": False,
                "default": "auto",
            },
            "emi_months": {"type": "integer", "required": False, "default": 6},
            "dataset_type": {
                "type": "string",
                "enum": ["personal", "institute", "startup"],
                "required": False,
                "default": "personal",
            },
        },
    },
}


def get_financial_catalog_summary() -> str:
    """Returns a human-readable summary of supported financial decision types."""
    lines = ["Supported Financial Decision Types in FutureFork 2.0:"]
    for k, v in FINANCIAL_CATALOG.items():
        lines.append(f"- {k}: {v['description']}")
    return "\n".join(lines)


_FINANCIAL_KEYWORDS: List[str] = [
    "buy", "purchase", "acquire", "invest", "laptop", "pc", "server", "equipment",
    "machinery", "vehicle", "infrastructure", "hire", "recruit", "cloud", "gpu",
    "₹", "rs ", "inr", "lakh", "crore", "salary", "annual cost", "worth",
    "without dropping", "emergency", "reserve", "emi", "upfront", "phased", "trim",
]


def is_financial_decision(text: str) -> bool:
    """
    Returns True if the text looks like a financial purchase/investment decision.

    Args:
        text: Plain-English decision prompt.

    Returns:
        True if it appears to be a financial decision; False otherwise.
    """
    lower = text.lower()
    return any(kw in lower for kw in _FINANCIAL_KEYWORDS)


def lookup_decision_schema(name: str) -> Dict[str, Any]:
    """
    Looks up a financial decision schema by name (case-insensitive).

    Args:
        name: Decision type name (e.g. "big_purchase").

    Returns:
        Schema metadata dict. Raises KeyError if not found.
    """
    key = name.lower().strip()
    if key in FINANCIAL_CATALOG:
        return FINANCIAL_CATALOG[key]
    # Try partial match
    for k, v in FINANCIAL_CATALOG.items():
        if key in k or k in key:
            return v
    raise KeyError(f"Decision schema '{name}' not found in FINANCIAL_CATALOG. "
                   f"Available: {list(FINANCIAL_CATALOG.keys())}")


# ==============================================================================
# BACKWARD COMPATIBILITY STUBS (old timetable catalog)
# ==============================================================================

CATALOG: Dict[str, Dict[str, Any]] = {
    "shift_time_window": {
        "name": "Shift Time Window",
        "description": "Shifts class sessions between morning (slots 0-3, 09:00-13:00) and afternoon (slots 4-7, 13:00-17:00).",
        "parameters": {
            "from": {
                "type": "string",
                "enum": ["morning", "afternoon"],
                "description": "Source time window to move sessions from.",
                "required": True,
            },
            "to": {
                "type": "string",
                "enum": ["morning", "afternoon"],
                "description": "Target time window to move sessions into.",
                "required": True,
            },
            "selection": {
                "type": "string",
                "enum": ["all", "electives", "labs", "lowest_enrollment_n", "explicit_ids"],
                "description": "Filter criteria for which classes in the source window are shifted.",
                "required": True,
            },
        },
        "examples": [
            {"from": "afternoon", "to": "morning", "selection": "all"},
        ],
    },
    "room_change": {
        "name": "Room Inventory Change",
        "description": "Removes unavailable/closed rooms or adds reserve venue capacity to the timetable inventory.",
        "parameters": {
            "action": {
                "type": "string",
                "enum": ["remove", "add"],
                "required": True,
            },
        },
        "examples": [{"action": "remove", "room_ids": ["R101"]}],
    },
    "faculty_load_cap": {
        "name": "Faculty Teaching Load Cap",
        "description": "Sets a maximum upper threshold on weekly teaching hours across faculty members.",
        "parameters": {
            "max_hours_per_week": {
                "type": "integer",
                "minimum": 1,
                "maximum": 40,
                "required": True,
            },
        },
        "examples": [{"max_hours_per_week": 18}],
    },
}

SUPPORTED_CHANGE_TYPES: List[str] = list(CATALOG.keys())


def is_supported_change_type(change_type: str) -> bool:
    """Backward-compatible: returns True if change_type is in the old timetable catalog."""
    return change_type in CATALOG


def get_catalog_summary_text() -> str:
    """Backward-compatible: returns the old timetable catalog summary."""
    lines = ["Supported Change Types in FutureFork MVP:"]
    for k, v in CATALOG.items():
        lines.append(f"- {k}: {v['description']}")
    return "\n".join(lines)
