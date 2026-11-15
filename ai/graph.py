"""
FutureFork LangGraph Pipeline
Orchestrates AI agents:
parse -> validate -> (conditional: clarify | branch) -> explain
"""

from typing import Dict, Any, List, Optional, TypedDict
from langgraph.graph import StateGraph, END

from ai.agents.parser import parse_decision
from ai.agents.scenario import generate_scenarios
from ai.agents.explainer import explain

class AgentState(TypedDict):
    text: str
    dataset_summary: Dict[str, Any]
    decision_spec: Optional[Dict[str, Any]]
    scenarios: List[Dict[str, Any]]
    results: Dict[str, Any]
    explanation: Optional[Dict[str, Any]]
    status: str
    message: Optional[str]

def parse_node(state: AgentState) -> Dict[str, Any]:
    spec = parse_decision(state["text"], state["dataset_summary"])
    return {
        "decision_spec": spec,
        "status": spec.get("status", "ok"),
        "message": spec.get("message"),
    }

def validate_condition(state: AgentState) -> str:
    status = state.get("status", "ok")
    if status == "ok":
        return "branch"
    return "clarify"

def clarify_node(state: AgentState) -> Dict[str, Any]:
    return {
        "scenarios": [],
        "explanation": None,
    }

def branch_node(state: AgentState) -> Dict[str, Any]:
    spec = state.get("decision_spec", {})
    scenarios = generate_scenarios(spec)
    return {"scenarios": scenarios}

def explain_node(state: AgentState) -> Dict[str, Any]:
    spec = state.get("decision_spec", {})
    results = state.get("results", {})
    exp = explain(spec, results)
    return {"explanation": exp}

# Build StateGraph
def build_futurefork_graph():
    builder = StateGraph(AgentState)

    builder.add_node("parse", parse_node)
    builder.add_node("clarify", clarify_node)
    builder.add_node("branch", branch_node)
    builder.add_node("explain", explain_node)

    builder.set_entry_point("parse")

    # Conditional routing after parse
    builder.add_conditional_edges(
        "parse",
        validate_condition,
        {
            "branch": "branch",
            "clarify": "clarify",
        },
    )

    builder.add_edge("clarify", END)
    builder.add_edge("branch", END) # Note: evaluation is performed by Engine C between branch and explain
    builder.add_edge("explain", END)

    return builder.compile()

# Global compiled graph
agent_graph = build_futurefork_graph()
