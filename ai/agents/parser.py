"""
FutureFork Parser Agent
Translates plain-English decision prompts into validated DecisionSpec schemas.
Grounds domain references using the target dataset summary.
"""

import re
import json
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from contracts.schemas import DecisionSpec, Objective, Constraint, ChangeSpec
from ai.catalog import CATALOG, is_supported_change_type, get_catalog_summary_text
from ai.llm import call_structured_llm

PARSER_SYSTEM_PROMPT = f"""
You are the FutureFork Decision Parser Agent.
Your job is to translate human decision instructions into a structured DecisionSpec.

{get_catalog_summary_text()}

Rules:
1. Only emit change types supported in the catalog: 'shift_time_window', 'room_change', 'faculty_load_cap'.
2. If the user asks for unsupported domains (stocks, crypto, weather, firing staff, budget), output status='unsupported' with a polite explanation.
3. If the input is too vague (e.g. "make it better"), output status='needs_clarification'.
4. Ground references using the provided dataset summary (e.g. "big hall" -> AUD301, "Room 101" -> R101).
5. Output valid JSON matching the DecisionSpec schema.
"""

def parse_decision(text: str, dataset_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses decision text into a validated DecisionSpec dictionary.
    Exposed function for Backend (B).
    """
    cleaned_text = text.strip()
    lower = cleaned_text.lower()
    dataset_id = dataset_summary.get("id", "sample_univ_v1")
    dec_id = f"dec_{abs(hash(cleaned_text)) % 1000000}"

    # 1. Unsupported Domain Gate
    unsupported_keywords = [
        "crypto", "bitcoin", "ethereum", "weather", "forecast", "salary",
        "salaries", "bonus", "fire ", "terminate", "stock", "stocks", "diet", "recipe"
    ]
    if any(k in lower for k in unsupported_keywords):
        return {
            "id": dec_id,
            "text": cleaned_text,
            "dataset_id": dataset_id,
            "objectives": [],
            "constraints": [],
            "change": {"type": "shift_time_window", "params": {}},
            "status": "unsupported",
            "message": (
                "Unsupported decision domain. FutureFork MVP currently supports campus timetable and resource allocation "
                "policies: shift_time_window, room_change, and faculty_load_cap."
            ),
        }

    # 2. Vague / Clarification Gate
    if len(cleaned_text) < 15 or any(p in lower for p in ["make it better", "fix everything", "optimize all", "help me"]):
        return {
            "id": dec_id,
            "text": cleaned_text,
            "dataset_id": dataset_id,
            "objectives": [],
            "constraints": [],
            "change": {"type": "shift_time_window", "params": {}},
            "status": "needs_clarification",
            "message": (
                "Please specify which classes, rooms, or faculty limits to adjust "
                '(e.g., "Move all afternoon classes to the morning" or "Remove Room 101").'
            ),
        }

    # Fallback / Deterministic Rule Parser
    def rule_based_parser() -> Dict[str, Any]:
        # Policy A: Room Change (check room/auditorium/lab management first if room addition or closure is specified)
        if (
            ("room 101" in lower or "projector repair" in lower or "close auditorium" in lower or "add reserve" in lower)
            or (any(w in lower for w in ["add", "remove", "close", "delete", "repair", "maintenance"]) and any(w in lower for w in ["room", "auditorium", "lab 20", "venue"]))
            or (any(w in lower for w in ["room", "auditorium", "venue"]) and any(w in lower for w in ["remove", "close", "delete", "maintenance", "unavailable"]))
        ):
            action = "remove" if any(w in lower for w in ["remove", "close", "delete", "maintenance", "repair", "out of"]) else "add"
            room_ids = ["R101"] if "101" in lower else ["AUD301"] if "auditorium" in lower or "301" in lower else ["LAB204"] if "204" in lower else ["R102"]

            return {
                "id": dec_id,
                "text": cleaned_text,
                "dataset_id": dataset_id,
                "objectives": [
                    {"metric": "student_clashes", "direction": "minimize"},
                    {"metric": "room_utilization", "direction": "maximize"},
                ],
                "constraints": [],
                "change": {
                    "type": "room_change",
                    "params": {"action": action, "room_ids": room_ids, "capacity": 50 if action == "add" else None},
                },
                "status": "ok",
                "message": None,
            }

        # Policy B: Shift Time Window (if prompt instructs moving/shifting between time windows)
        if (
            any(w in lower for w in ["move", "shift", "compress", "reschedule", "bring"])
            and any(w in lower for w in ["morning", "afternoon", "slots", "slot", "early"])
        ) or ("to morning" in lower or "to afternoon" in lower):
            selection = "all"
            if "elective" in lower:
                selection = "electives"
            elif "lab" in lower:
                selection = "labs"
            elif "lowest" in lower or "small" in lower:
                selection = "lowest_enrollment_n"

            from_win = "afternoon" if "morning" in lower else "morning"
            to_win = "morning" if "morning" in lower else "afternoon"

            constraints = []
            cap_match = re.search(r"(\d+)\s*(?:hours|hrs|teaching hours)", lower)
            if cap_match:
                hours = int(cap_match.group(1))
                constraints.append({"kind": "faculty_load_cap", "params": {"max_hours_per_week": hours}})

            return {
                "id": dec_id,
                "text": cleaned_text,
                "dataset_id": dataset_id,
                "objectives": [
                    {"metric": "student_clashes", "direction": "minimize"},
                    {"metric": "faculty_clashes", "direction": "minimize"},
                    {"metric": "room_utilization", "direction": "maximize"},
                    {"metric": "avg_student_gaps", "direction": "minimize"},
                ],
                "constraints": constraints,
                "change": {
                    "type": "shift_time_window",
                    "params": {"from": from_win, "to": to_win, "selection": selection},
                },
                "status": "ok",
                "message": None,
            }

        # Policy C: Faculty Load Cap (professors / faculty contact hours)
        if any(w in lower for w in ["faculty", "professor", "professors", "instructor", "instructors", "teacher", "teachers"]) and (
            any(w in lower for w in ["cap", "limit", "restrict", "max", "contact hours", "teaching hours"])
            or re.search(r"\b\d+\s*(?:hours|hrs)\b", lower)
        ):
            hours = 15
            cap_match = re.search(r"(\d+)", lower)
            if cap_match:
                hours = int(cap_match.group(1))

            return {
                "id": dec_id,
                "text": cleaned_text,
                "dataset_id": dataset_id,
                "objectives": [
                    {"metric": "faculty_clashes", "direction": "minimize"},
                    {"metric": "avg_student_gaps", "direction": "minimize"},
                ],
                "constraints": [
                    {"kind": "faculty_load_cap", "params": {"max_hours_per_week": hours}}
                ],
                "change": {
                    "type": "faculty_load_cap",
                    "params": {"max_hours_per_week": hours},
                },
                "status": "ok",
                "message": None,
            }

        # Generic default
        return {
            "id": dec_id,
            "text": cleaned_text,
            "dataset_id": dataset_id,
            "objectives": [
                {"metric": "student_clashes", "direction": "minimize"},
                {"metric": "faculty_clashes", "direction": "minimize"},
                {"metric": "room_utilization", "direction": "maximize"},
            ],
            "constraints": [],
            "change": {
                "type": "shift_time_window",
                "params": {"from": "afternoon", "to": "morning", "selection": "all"},
            },
            "status": "ok",
            "message": None,
        }

    # Run through structured LLM wrapper
    prompt = f"Dataset: {json.dumps(dataset_summary)}\nUser Decision: {cleaned_text}"
    try:
        spec_model = call_structured_llm(
            prompt=prompt,
            system_prompt=PARSER_SYSTEM_PROMPT,
            response_model=DecisionSpec,
            fallback_generator=rule_based_parser,
        )
        return spec_model.model_dump()
    except Exception as ex:
        logger.warning(f"Falling back to rule-based parser: {ex}")
        return rule_based_parser()
