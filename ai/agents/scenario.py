"""
FutureFork Scenario Fan-out Agent

Turns a parsed decision into competing policy forks. Which forks apply depends on the
kind of decision (see engine.changes.FORKS_BY_KIND):

  one_time           -> upfront, emi, phased, trim
  recurring_expense  -> absorb, delay, phase_in, trim
  income_change      -> absorb, trim

Uses a LangGraph StateGraph (parse -> feasibility -> fan-out) when langgraph is
installed and falls back to plain Python with the same result.

Public API:
  build_forks(prompt, baseline, dataset_type="personal") -> ForkSet        (parses first)
  build_forks_from_decision(decision, baseline) -> ForkSet                 (no re-parse)
"""

from __future__ import annotations

import copy
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("futurefork.ai.agents.scenario")


# ===========================================================================
# Public types
# ===========================================================================

@dataclass
class ForkSpec:
    """
    One policy fork.

    Attributes:
        fork_id:               Branch type, e.g. "upfront" or "absorb".
        title:                 Display title.
        policy_description:    One-sentence policy explanation.
        goal:                  PurchaseGoal ready for the engine.
        status:                "ready" | "infeasible" | "error"
        infeasibility_reason:  Set if status != "ready".
    """

    fork_id: str
    title: str
    policy_description: str
    goal: Any
    status: str = "ready"
    infeasibility_reason: Optional[str] = None


@dataclass
class ForkSet:
    """Result of build_forks(): the parsed decision, its base goal and its forks."""

    decision: Any        # ParsedDecision
    baseline_goal: Any   # PurchaseGoal
    forks: List[ForkSpec] = field(default_factory=list)


# ===========================================================================
# Fork metadata
# ===========================================================================

_FORK_METADATA: Dict[Tuple[str, str], Tuple[str, str]] = {
    ("one_time", "upfront"): (
        "Upfront Purchase",
        "Pay the full cost in one go with zero interest, in the safest month the solver can find.",
    ),
    ("one_time", "emi"): (
        "EMI / Installment Financing",
        "Spread the cost across monthly installments with an annual financing rate.",
    ),
    ("one_time", "phased"): (
        "Phased / Milestone Purchase",
        "Split the purchase into two equal tranches (50/50) to smooth the cash-flow impact.",
    ),
    ("one_time", "trim"): (
        "Trim & Buy",
        "Buy in the planned month and cut flexible spending just enough to protect the emergency floor.",
    ),
    ("recurring_expense", "absorb"): (
        "Commit As Planned",
        "Take on the recurring cost from the planned month with no other changes.",
    ),
    ("recurring_expense", "delay"): (
        "Delay the Start",
        "Start at the earliest month that keeps your balance above the emergency floor.",
    ),
    ("recurring_expense", "phase_in"): (
        "Phase It In",
        "Start at 50% for the first 3 months, then the full amount.",
    ),
    ("recurring_expense", "trim"): (
        "Trim to Fund It",
        "Cut flexible spending (up to 35%) to pay for the new commitment while protecting the floor.",
    ),
    ("income_change", "absorb"): (
        "Ride It Out",
        "Keep spending as it is and let your balance absorb the change.",
    ),
    ("income_change", "trim"): (
        "Trim Spending",
        "Cut flexible spending (up to 35%) during the affected months to protect the emergency floor.",
    ),
}


def fork_metadata(kind: str, fork_id: str) -> Tuple[str, str]:
    return _FORK_METADATA.get((kind, fork_id), (fork_id.replace("_", " ").title(), ""))


# ===========================================================================
# Helpers
# ===========================================================================

def _build_base_goal(decision: Any) -> Any:
    """ParsedDecision -> base PurchaseGoal."""
    from engine.model import PurchaseGoal

    kind = getattr(decision, "decision_kind", "one_time")
    pref = decision.financing_preference if decision.financing_preference != "auto" else "upfront"
    down_pct = float(getattr(decision, "downpayment_pct", 0.0) or 0.0)
    interest = getattr(decision, "interest_rate_annual", None)
    return PurchaseGoal(
        item_name=decision.item_label,
        total_cost=float(decision.total_cost or 0.0),
        emergency_floor=float(decision.emergency_floor or 0.0),
        target_month=int(decision.target_month or 0),
        financing_mode=pref,
        emi_months=int(decision.emi_months or 6),
        downpayment=round(float(decision.total_cost or 0.0) * down_pct, 2),
        interest_rate_annual=0.10 if interest is None else float(interest),
        phased_splits=[],
        max_trim_pct=0.35,
        flexible_categories=[],
        decision_kind=kind,
        monthly_amount=float(getattr(decision, "monthly_amount", 0.0) or 0.0),
        start_month=int(getattr(decision, "start_month", 0) or 0),
        duration_months=int(getattr(decision, "duration_months", 12) or 12),
        income_change_pct=float(getattr(decision, "income_change_pct", 0.0) or 0.0),
        income_change_monthly=float(getattr(decision, "income_change_monthly", 0.0) or 0.0),
    )


def _feasibility_check(decision: Any, baseline: Any) -> Optional[str]:
    """Returns a reason the decision can't be evaluated, or None. Unaffordable is NOT infeasible."""
    kind = getattr(decision, "decision_kind", "one_time")
    if decision.emergency_floor < 0:
        return "The emergency floor can't be negative."
    if kind == "one_time" and decision.total_cost <= 0:
        return "The cost must be greater than zero."
    if kind == "recurring_expense" and getattr(decision, "monthly_amount", 0) <= 0:
        return "The monthly cost must be greater than zero."
    if kind == "income_change" and not (getattr(decision, "income_change_pct", 0) or getattr(decision, "income_change_monthly", 0)):
        return "The size of the income change is missing."
    return None


def _apply_fork(kind: str, fork_id: str, base_goal: Any, baseline: Any) -> ForkSpec:
    """Applies the fork's transformer (one-time decisions) and returns a ForkSpec."""
    from engine.changes import (
        apply_discretionary_trim,
        apply_emi_split,
        apply_phased_delay,
        apply_upfront,
    )

    title, description = fork_metadata(kind, fork_id)
    try:
        if kind == "one_time":
            applier = {"upfront": apply_upfront, "emi": apply_emi_split,
                       "phased": apply_phased_delay, "trim": apply_discretionary_trim}[fork_id]
            params = {}
            if fork_id == "emi" and base_goal.total_cost:
                params["downpayment_pct"] = round(base_goal.downpayment / base_goal.total_cost, 4)
            goal = applier(baseline, base_goal, params)
        else:
            goal = copy.deepcopy(base_goal)
            if fork_id == "trim" and baseline is not None:
                goal.flexible_categories = [c for c, t in baseline.category_types.items() if t == "flexible"]
        return ForkSpec(fork_id=fork_id, title=title, policy_description=description, goal=goal)
    except Exception as exc:
        logger.warning("Fork '%s' transformer raised: %s", fork_id, exc)
        return ForkSpec(fork_id=fork_id, title=title, policy_description=description, goal=base_goal,
                        status="error", infeasibility_reason=str(exc))


def _fan_out(decision: Any, baseline: Any) -> ForkSet:
    from engine.changes import FORKS_BY_KIND

    kind = getattr(decision, "decision_kind", "one_time")
    kind = kind if kind in FORKS_BY_KIND else "one_time"
    base_goal = _build_base_goal(decision)
    reason = _feasibility_check(decision, baseline)
    forks = []
    for fid in FORKS_BY_KIND[kind]:
        if reason:
            title, desc = fork_metadata(kind, fid)
            forks.append(ForkSpec(fid, title, desc, base_goal, "infeasible", reason))
        else:
            forks.append(_apply_fork(kind, fid, base_goal, baseline))
    return ForkSet(decision=decision, baseline_goal=base_goal, forks=forks)


# ===========================================================================
# LangGraph pipeline (parse -> feasibility -> fan-out)
# ===========================================================================

def _run_langgraph(prompt: Optional[str], decision: Any, baseline: Any, dataset_type: str) -> Optional[ForkSet]:
    try:
        from typing import TypedDict

        from langgraph.graph import END, StateGraph
    except ImportError:
        return None

    from ai.agents.parser import DecisionParseError, parse_financial_decision

    class _State(TypedDict, total=False):
        prompt: Optional[str]
        decision: Any
        error: Optional[str]
        fork_set: Any

    def node_parse(state: _State) -> _State:
        if state.get("decision") is not None:
            return state
        try:
            d = parse_financial_decision(state.get("prompt") or "", baseline=baseline, dataset_type=dataset_type)
            return {**state, "decision": d, "error": None}
        except DecisionParseError as exc:
            return {**state, "error": str(exc)}

    def node_fan_out(state: _State) -> _State:
        if state.get("decision") is None:
            return state
        return {**state, "fork_set": _fan_out(state["decision"], baseline)}

    try:
        graph = StateGraph(_State)
        graph.add_node("parse", node_parse)
        graph.add_node("fan_out", node_fan_out)
        graph.set_entry_point("parse")
        graph.add_edge("parse", "fan_out")
        graph.add_edge("fan_out", END)
        final = graph.compile().invoke({"prompt": prompt, "decision": decision})
        return final.get("fork_set")
    except Exception as exc:
        logger.warning("LangGraph fan-out failed: %s", exc)
        return None


def _offline() -> bool:
    return os.environ.get("FUTUREFORK_OFFLINE", "").strip() in ("1", "true", "yes")


# ===========================================================================
# Public API
# ===========================================================================

def build_forks_from_decision(decision: Any, baseline: Any) -> ForkSet:
    """Fan an already-parsed decision out into its forks (no second parse)."""
    if not _offline():
        result = _run_langgraph(None, decision, baseline, getattr(decision, "dataset_type", "personal"))
        if result is not None:
            logger.info("scenario: used LangGraph StateGraph")
            return result
    return _fan_out(decision, baseline)


def build_forks(prompt: str, baseline: Any, dataset_type: str = "personal") -> ForkSet:
    """
    Parse the prompt and fan out into competing forks.

    Raises DecisionParseError (or OffTopicPromptError) if the prompt can't be parsed.
    """
    if not _offline():
        result = _run_langgraph(prompt, None, baseline, dataset_type)
        if result is not None:
            logger.info("scenario: used LangGraph StateGraph")
            return result
    from ai.agents.parser import parse_financial_decision

    return _fan_out(parse_financial_decision(prompt, baseline=baseline, dataset_type=dataset_type), baseline)
