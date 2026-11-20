"""FutureFork AI Layer: LangGraph multi-agent pipeline for decision parsing,
scenario branching, and explainability with strict Numeric Guard.

FutureFork 2.0 Financial AI exports (Member 4):
  - propose_mapping, MappingResult
  - parse_financial_decision, ParsedDecision, parse_indian_amount
  - build_forks, ForkSet, ForkSpec
  - explain_branches, ExplanationResult

Backward-compatible timetable exports:
  - CATALOG, SUPPORTED_CHANGE_TYPES, is_supported_change_type, get_catalog_summary_text
  - parse_decision (stub)
  - generate_scenarios (stub)
  - explain (stub)
  - agent_graph, build_futurefork_graph
"""

from ai.catalog import (
    CATALOG,
    SUPPORTED_CHANGE_TYPES,
    is_supported_change_type,
    get_catalog_summary_text,
    FINANCIAL_CATALOG,
    BigPurchaseDecision,
    get_financial_catalog_summary,
    is_financial_decision,
    lookup_decision_schema,
)

from ai.agents.parser import parse_decision, parse_financial_decision, ParsedDecision, parse_indian_amount
from ai.agents.scenario import generate_scenarios, build_forks, ForkSet, ForkSpec
from ai.agents.explainer import explain, explain_branches, ExplanationResult
from ai.agents.mapper import propose_mapping, MappingResult

try:
    from ai.graph import agent_graph, build_futurefork_graph
except Exception:
    # graph module may fail if its imports can't resolve — keep it optional
    agent_graph = None  # type: ignore[assignment]
    build_futurefork_graph = None  # type: ignore[assignment]

CHANGE_CATALOG = CATALOG

__all__ = [
    # Financial catalog
    "FINANCIAL_CATALOG",
    "BigPurchaseDecision",
    "get_financial_catalog_summary",
    "is_financial_decision",
    "lookup_decision_schema",
    # Legacy timetable catalog
    "CATALOG",
    "CHANGE_CATALOG",
    "SUPPORTED_CHANGE_TYPES",
    "is_supported_change_type",
    "get_catalog_summary_text",
    # Mapper
    "propose_mapping",
    "MappingResult",
    # Parser
    "parse_financial_decision",
    "ParsedDecision",
    "parse_indian_amount",
    "parse_decision",
    # Scenario
    "build_forks",
    "ForkSet",
    "ForkSpec",
    "generate_scenarios",
    # Explainer
    "explain_branches",
    "ExplanationResult",
    "explain",
    # Graph
    "agent_graph",
    "build_futurefork_graph",
]
