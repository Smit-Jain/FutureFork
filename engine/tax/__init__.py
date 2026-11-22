"""Indian income-tax engine (ITR helper). Pure Python: no HTTP, database or LLM."""

from engine.tax.compute import compute_tax, hra_exemption, slab_tax
from engine.tax.profile import TaxInputs
from engine.tax.report import build_tax_report, fmt_inr
from engine.tax.rules import DEFAULT_FY, RULES, get_rules

__all__ = [
    "DEFAULT_FY",
    "RULES",
    "TaxInputs",
    "build_tax_report",
    "compute_tax",
    "fmt_inr",
    "get_rules",
    "hra_exemption",
    "slab_tax",
]
