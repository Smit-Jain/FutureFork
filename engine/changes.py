"""
FutureFork Optimization Engine: Change Appliers & Branch Transformers
Member 2: OR-Tools CP-SAT Financial Solver & Branch Transformers

Provides:
- apply_upfront: Branch 1 - 100% upfront purchase in target/earliest feasible month.
- apply_emi_split: Branch 2 - Structured installment financing over 6/12 months with interest.
- apply_phased_delay: Branch 3 - Multi-milestone split (e.g. 50/50) avoiding debt/interest.
- apply_discretionary_trim: Branch 4 - Optimized cuts across flexible categories to protect reserve.
- apply_financial_change: Unified financial change dispatcher.
- Retains backward-compatible timetable change appliers (shift_time_window, room_change, faculty_load_cap).
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional, Set

from engine.model import (
    FinancialProblemInstance,
    ProblemInstance,
    PurchaseGoal,
    Room,
)

# ==============================================================================
# FINANCIAL BRANCH TRANSFORMERS (MEMBER 2)
# ==============================================================================

def apply_upfront(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 1: Upfront Purchase.
    Allocates 100% of purchase cost in target month (default Month 0) with 0% interest.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "upfront"
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    new_goal.interest_rate_annual = 0.0
    new_goal.emi_months = 1
    new_goal.downpayment = new_goal.total_cost
    new_goal.phased_splits = [{"month": new_goal.target_month, "pct": 1.0}]
    return new_goal


def apply_emi_split(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 2: EMI / Lease Financing.
    Spreads capital outlay across N months (default 6 or 12 months) with annual financing rate.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "emi"
    new_goal.emi_months = int(p.get("emi_months", p.get("months", new_goal.emi_months or 6)))
    if new_goal.emi_months < 2:
        new_goal.emi_months = 6

    # Downpayment percentage (e.g. 0.0 to 0.20)
    down_pct = float(p.get("downpayment_pct", 0.0))
    if down_pct > 0.0 and down_pct < 1.0:
        new_goal.downpayment = round(new_goal.total_cost * down_pct, 2)
    else:
        new_goal.downpayment = float(p.get("downpayment", 0.0))

    new_goal.interest_rate_annual = float(
        p.get("interest_rate_annual", p.get("interest_rate", new_goal.interest_rate_annual or 0.10))
    )
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    return new_goal


def apply_phased_delay(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 3: Phased Split / Milestone Delay.
    Splits acquisition into milestones (e.g. 50% in Month 0, 50% in Month 6) without interest debt.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "phased"
    new_goal.interest_rate_annual = 0.0

    splits = p.get("phased_splits") or p.get("splits")
    if not splits:
        # Default smart split: 50% at target_month (Month 0), 50% at Month 5 or 6 (mid-cycle revenue peak)
        m1 = int(p.get("month_1", new_goal.target_month))
        m2 = int(p.get("month_2", min(11, m1 + 5)))
        pct1 = float(p.get("pct_1", 0.5))
        pct2 = float(p.get("pct_2", 0.5))
        splits = [
            {"month": m1, "pct": pct1},
            {"month": m2, "pct": pct2},
        ]

    new_goal.phased_splits = splits
    return new_goal


def apply_discretionary_trim(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 4: Trim-and-Buy (Discretionary Expenditure Reduction).
    Enables minimum-pain cuts across flexible categories (e.g. up to 35% cut) while
    strictly safeguarding fixed categories (salaries, rent, utilities) and emergency reserves.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "trim"
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    new_goal.max_trim_pct = float(p.get("max_trim_pct", p.get("max_cut", 0.35)))

    # Identify flexible categories from instance if not explicitly provided
    flex_cats = p.get("flexible_categories")
    if not flex_cats:
        flex_cats = [
            cat for cat, ctype in instance.category_types.items()
            if ctype == "flexible"
        ]
    new_goal.flexible_categories = flex_cats
    return new_goal


def apply_financial_change(
    instance: FinancialProblemInstance,
    change: Dict[str, Any],
    goal: Optional[PurchaseGoal] = None,
) -> PurchaseGoal:
    """
    Unified dispatcher for financial branch transformations.
    Accepts change spec dictionary and base PurchaseGoal.
    """
    change_type = str(change.get("type", "")).lower()
    params = change.get("params", {})

    base_goal = goal or PurchaseGoal.from_dict(params)

    if any(k in change_type for k in ["upfront", "buy_now", "immediate"]):
        return apply_upfront(instance, base_goal, params)
    elif any(k in change_type for k in ["emi", "lease", "loan", "split_installment"]):
        return apply_emi_split(instance, base_goal, params)
    elif any(k in change_type for k in ["phase", "delay", "milestone", "two_stage"]):
        return apply_phased_delay(instance, base_goal, params)
    elif any(k in change_type for k in ["trim", "cut", "discretionary", "savings"]):
        return apply_discretionary_trim(instance, base_goal, params)
    else:
        # Default to upfront
        return apply_upfront(instance, base_goal, params)


# ==============================================================================
# TIMETABLE BACKWARD COMPATIBLE APPILERS
# ==============================================================================

class ChangeApplierRegistry:
    def __init__(self):
        self._handlers = {}

    def register(self, change_type: str):
        def decorator(fn):
            self._handlers[change_type] = fn
            return fn
        return decorator

    def apply(
        self,
        dataset: Any,
        change: Dict[str, Any],
    ) -> Any:
        change_type = change.get("type", "shift_time_window")
        params = change.get("params", {})

        # If financial problem instance, route to financial applier
        if isinstance(dataset, FinancialProblemInstance) or (
            isinstance(dataset, dict) and "outflows" in dataset and "inflows" in dataset
        ):
            inst = (
                dataset
                if isinstance(dataset, FinancialProblemInstance)
                else FinancialProblemInstance.from_dict(dataset)
            )
            return apply_financial_change(inst, change)

        handler = self._handlers.get(change_type)
        if not handler:
            raise ValueError(f"Unsupported change type in catalog: {change_type}")

        return handler(dataset, params)


registry = ChangeApplierRegistry()


@registry.register("shift_time_window")
def apply_shift_time_window(
    dataset: ProblemInstance,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    from_window = params.get("from", "afternoon")
    to_window = params.get("to", "morning")
    selection = params.get("selection", "all")
    explicit_ids = set(params.get("ids", []))
    n = params.get("n", 10)

    target_slots = list(range(0, 4)) if to_window == "morning" else list(range(4, 8))
    source_slots = list(range(4, 8)) if from_window == "afternoon" else list(range(0, 4))

    baseline_assignments_by_event = {a.event_id: a for a in dataset.baseline_assignments}
    events_in_source = []

    for ev in dataset.events:
        a = baseline_assignments_by_event.get(ev.event_id)
        if a and a.slot in source_slots:
            events_in_source.append(ev)

    target_events: Set[str] = set()
    if selection == "all":
        target_events = {ev.event_id for ev in events_in_source}
    elif selection == "electives":
        target_events = {ev.event_id for ev in events_in_source if ev.is_elective}
        if len(target_events) < 4:
            target_events.update(ev.event_id for ev in dataset.events if ev.is_elective)
    elif selection == "labs":
        target_events = {ev.event_id for ev in events_in_source if ev.is_lab}
    elif selection == "lowest_enrollment_n":
        sorted_events = sorted(events_in_source, key=lambda e: e.expected_enrollment)
        target_events = {ev.event_id for ev in sorted_events[:n]}
    elif selection == "explicit_ids":
        target_events = explicit_ids
    else:
        target_events = {ev.event_id for ev in events_in_source}

    allowed_slots_per_event: Dict[str, List[int]] = {}
    for ev in dataset.events:
        if ev.event_id in target_events:
            allowed_slots_per_event[ev.event_id] = target_slots
        else:
            allowed_slots_per_event[ev.event_id] = list(range(8))

    return {
        "dataset": dataset,
        "change_type": "shift_time_window",
        "target_events": target_events,
        "allowed_slots_per_event": allowed_slots_per_event,
        "rooms": dataset.rooms,
        "faculty": dataset.faculty,
        "events": dataset.events,
    }


@registry.register("room_change")
def apply_room_change(
    dataset: ProblemInstance,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    action = params.get("action", "remove")
    room_ids_to_act = set(params.get("room_ids", []))
    modified_rooms = [r for r in dataset.rooms]

    if action == "remove":
        modified_rooms = [r for r in modified_rooms if r.room_id not in room_ids_to_act]
    elif action == "add":
        new_capacity = params.get("capacity", 50)
        new_type = params.get("type", "lecture")
        rids = list(room_ids_to_act) if room_ids_to_act else [params.get("room_id", "LAB204")]
        for rid in rids:
            if not any(r.room_id == rid for r in modified_rooms):
                modified_rooms.append(
                    Room(room_id=rid, name=f"Added Room {rid}", capacity=new_capacity, type=new_type)
                )

    allowed_slots_per_event = {ev.event_id: list(range(8)) for ev in dataset.events}
    return {
        "dataset": dataset,
        "change_type": "room_change",
        "rooms": modified_rooms,
        "faculty": dataset.faculty,
        "events": dataset.events,
        "allowed_slots_per_event": allowed_slots_per_event,
        "target_events": set(),
    }


@registry.register("faculty_load_cap")
def apply_faculty_load_cap(
    dataset: ProblemInstance,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    max_hours = params.get("max_hours_per_week", 15)
    modified_faculty = [
        copy.deepcopy(f) for f in dataset.faculty
    ]
    for f in modified_faculty:
        f.max_hours = max_hours

    allowed_slots_per_event = {ev.event_id: list(range(8)) for ev in dataset.events}
    return {
        "dataset": dataset,
        "change_type": "faculty_load_cap",
        "rooms": dataset.rooms,
        "faculty": modified_faculty,
        "events": dataset.events,
        "allowed_slots_per_event": allowed_slots_per_event,
        "target_events": set(),
    }


def apply_change(dataset: Any, change: Dict[str, Any]) -> Any:
    return registry.apply(dataset, change)
