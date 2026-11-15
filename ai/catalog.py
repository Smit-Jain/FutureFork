"""
FutureFork Change Catalog
Machine-readable catalog of supported decision change types, parameters, and descriptions.
The Parser agent may strictly ONLY emit change types defined in this catalog.
"""

from typing import Dict, Any, List

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
            "ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Explicit event or course IDs when selection is 'explicit_ids'.",
                "required": False,
            },
            "n": {
                "type": "integer",
                "description": "Number of classes to shift when selection is 'lowest_enrollment_n'.",
                "required": False,
            },
        },
        "examples": [
            {"from": "afternoon", "to": "morning", "selection": "all"},
            {"from": "afternoon", "to": "morning", "selection": "electives"},
            {"from": "morning", "to": "afternoon", "selection": "labs"},
        ],
    },
    "room_change": {
        "name": "Room Inventory Change",
        "description": "Removes unavailable/closed rooms or adds reserve venue capacity to the timetable inventory.",
        "parameters": {
            "action": {
                "type": "string",
                "enum": ["remove", "add"],
                "description": "Whether rooms are removed from or added to the active room pool.",
                "required": True,
            },
            "room_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs or names of specific rooms to add or remove (e.g. ['R101', 'Room 101']).",
                "required": False,
            },
            "capacity": {
                "type": "integer",
                "description": "Seating capacity for added rooms.",
                "required": False,
            },
            "type": {
                "type": "string",
                "enum": ["lecture", "lab"],
                "description": "Venue type for added rooms.",
                "required": False,
            },
        },
        "examples": [
            {"action": "remove", "room_ids": ["R101"]},
            {"action": "add", "capacity": 50, "type": "lab"},
        ],
    },
    "faculty_load_cap": {
        "name": "Faculty Teaching Load Cap",
        "description": "Sets a maximum upper threshold on weekly teaching hours across faculty members.",
        "parameters": {
            "max_hours_per_week": {
                "type": "integer",
                "minimum": 1,
                "maximum": 40,
                "description": "Upper bound of contact teaching hours per instructor per week.",
                "required": True,
            },
        },
        "examples": [
            {"max_hours_per_week": 18},
            {"max_hours_per_week": 15},
            {"max_hours_per_week": 12},
        ],
    },
}

SUPPORTED_CHANGE_TYPES = list(CATALOG.keys())

def is_supported_change_type(change_type: str) -> bool:
    return change_type in CATALOG

def get_catalog_summary_text() -> str:
    lines = ["Supported Change Types in FutureFork MVP:"]
    for k, v in CATALOG.items():
        lines.append(f"- {k}: {v['description']}")
    return "\n".join(lines)
