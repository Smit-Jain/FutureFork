"""
FutureFork Scenario Agent
Generates 2 to 3 distinct scenario branches from a parsed DecisionSpec by varying
intensity, selection, and resource capacity.
"""

from typing import Dict, Any, List
from ai.llm import call_structured_llm

def generate_scenarios(decision_spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Produces alternative scenario branches from a DecisionSpec.
    Exposed function for Backend (B).
    """
    dec_id = decision_spec.get("id", "dec_001")
    change = decision_spec.get("change", {})
    change_type = change.get("type", "shift_time_window")
    params = change.get("params", {})

    # Always include Baseline root
    baseline = {
        "id": "baseline",
        "decision_id": dec_id,
        "parent_id": None,
        "name": "Baseline (Current)",
        "description": "Current operating timetable with existing scheduling flaws and friction.",
        "change": {"type": "shift_time_window", "params": {"from": "morning", "to": "morning", "selection": "all"}},
        "status": "queued",
    }

    if change_type == "room_change":
        r_ids = params.get("room_ids", ["R101"])
        room_label = ", ".join(r_ids)
        scenario_a = {
            "id": "scenario_a",
            "decision_id": dec_id,
            "parent_id": "baseline",
            "name": f"Scenario A: Reallocate from {room_label}",
            "description": f"Removes {room_label} and packs displaced classes into Auditorium 301 and Room 107.",
            "change": {"type": "room_change", "params": {"action": "remove", "room_ids": r_ids}},
            "status": "queued",
        }
        scenario_b = {
            "id": "scenario_b",
            "decision_id": dec_id,
            "parent_id": "baseline",
            "name": "Scenario B: Spread to Off-Peak Slots",
            "description": f"Removes {room_label} but redistributes sessions into available afternoon lecture periods.",
            "change": {"type": "room_change", "params": {"action": "remove", "room_ids": r_ids, "strategy": "spread"}},
            "status": "queued",
        }
        return [baseline, scenario_a, scenario_b]

    elif change_type == "faculty_load_cap":
        cap = params.get("max_hours_per_week", 15)
        scenario_a = {
            "id": "scenario_a",
            "decision_id": dec_id,
            "parent_id": "baseline",
            "name": f"Scenario A: Strict {cap}h Cap",
            "description": f"Applies a rigid {cap}-hour weekly contact cap across all instructors.",
            "change": {"type": "faculty_load_cap", "params": {"max_hours_per_week": cap}},
            "status": "queued",
        }
        scenario_b = {
            "id": "scenario_b",
            "decision_id": dec_id,
            "parent_id": "baseline",
            "name": f"Scenario B: Tiered Cap ({cap + 2}h Senior / {cap}h Junior)",
            "description": f"Graduated cap allowing senior faculty up to {cap + 2} hours to protect lab sections.",
            "change": {"type": "faculty_load_cap", "params": {"max_hours_per_week": cap + 2}},
            "status": "queued",
        }
        return [baseline, scenario_a, scenario_b]

    # Default: shift_time_window
    scenario_a = {
        "id": "scenario_a",
        "decision_id": dec_id,
        "parent_id": "baseline",
        "name": "Scenario A: Full Shift",
        "description": "Forces all afternoon lectures & labs into slots 0-3 (09:00 - 13:00). Highest utilization.",
        "change": {"type": "shift_time_window", "params": {"from": "afternoon", "to": "morning", "selection": "all"}},
        "status": "queued",
    }
    scenario_b = {
        "id": "scenario_b",
        "decision_id": dec_id,
        "parent_id": "baseline",
        "name": "Scenario B: Electives & Labs Only",
        "description": "Shifts only electives and lab sessions to morning, allowing core lectures solver freedom.",
        "change": {"type": "shift_time_window", "params": {"from": "afternoon", "to": "morning", "selection": "electives"}},
        "status": "queued",
    }
    scenario_c = {
        "id": "scenario_c",
        "decision_id": dec_id,
        "parent_id": "scenario_a",
        "name": "Scenario C: Shift + Extra Lab Room",
        "description": "Afternoon classes shifted to morning, supplemented with reserve Lab 204 to relieve peak load.",
        "change": {"type": "room_change", "params": {"action": "add", "capacity": 50, "type": "lab"}},
        "status": "queued",
    }

    return [baseline, scenario_a, scenario_b, scenario_c]
