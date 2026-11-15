"""FutureFork AI Layer: LangGraph multi-agent pipeline for decision parsing,
scenario branching, and explainability with strict Numeric Guard.
"""

from ai.catalog import CATALOG, SUPPORTED_CHANGE_TYPES, is_supported_change_type, get_catalog_summary_text
from ai.agents.parser import parse_decision
from ai.agents.scenario import generate_scenarios
from ai.agents.explainer import explain
from ai.graph import agent_graph, build_futurefork_graph

CHANGE_CATALOG = CATALOG

__all__ = [
    "CATALOG",
    "CHANGE_CATALOG",
    "SUPPORTED_CHANGE_TYPES",
    "is_supported_change_type",
    "get_catalog_summary_text",
    "parse_decision",
    "generate_scenarios",
    "explain",
    "agent_graph",
    "build_futurefork_graph",
]
