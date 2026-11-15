"""
FutureFork Optimization Engine: Change Appliers
Implements the shared Change Catalog registry:
- shift_time_window (selection: all | electives | labs | lowest_enrollment_n | explicit_ids)
- room_change (action: remove | add)
- faculty_load_cap (params: max_hours_per_week)
"""

import copy
from typing import Dict, Any, List, Set, Optional
from engine.model import ProblemInstance, Room, Event

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
        dataset: ProblemInstance,
        change: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Applies a change spec to the problem instance, returning modified problem definition."""
        change_type = change.get("type", "shift_time_window")
        params = change.get("params", {})

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
    """
    Shifts events between morning (slots 0-3) and afternoon (slots 4-7)
    based on selection criteria: all, electives, labs, lowest_enrollment_n, explicit_ids.
    """
    from_window = params.get("from", "afternoon")  # morning | afternoon
    to_window = params.get("to", "morning")        # morning | afternoon
    selection = params.get("selection", "all")
    explicit_ids = set(params.get("ids", []))
    n = params.get("n", 10)

    # Allowed slots for target window
    target_slots = list(range(0, 4)) if to_window == "morning" else list(range(4, 8))
    source_slots = list(range(4, 8)) if from_window == "afternoon" else list(range(0, 4))

    # Identify which events are currently placed in the source window in baseline
    baseline_assignments_by_event = {a.event_id: a for a in dataset.baseline_assignments}
    events_in_source = []

    for ev in dataset.events:
        a = baseline_assignments_by_event.get(ev.event_id)
        if a and a.slot in source_slots:
            events_in_source.append(ev)

    # Filter by selection rule
    target_events: Set[str] = set()

    if selection == "all":
        target_events = {ev.event_id for ev in events_in_source}
    elif selection == "electives":
        target_events = {ev.event_id for ev in events_in_source if ev.is_elective}
        # If few electives in source window, include any elective in events
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

    # Build slot restriction map: event_id -> allowed list of slots (0..7)
    allowed_slots_per_event: Dict[str, List[int]] = {}
    for ev in dataset.events:
        if ev.event_id in target_events:
            allowed_slots_per_event[ev.event_id] = target_slots
        else:
            # Free across all slots or preserved in baseline
            allowed_slots_per_event[ev.event_id] = list(range(8))

    return {
        "dataset": dataset,
        "change_type": "shift_time_window",
        "target_events": target_events,
        "allowed_slots_per_event": allowed_slots_per_event,
        "rooms": dataset.rooms,
        "faculty": dataset.faculty,
        "events": dataset.events,
        "params": params,
    }


@registry.register("room_change")
def apply_room_change(
    dataset: ProblemInstance,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Adds or removes rooms from the available room inventory."""
    action = params.get("action", "remove")  # remove | add
    room_ids_to_remove = set(params.get("room_ids", []))
    # Also support room names (e.g. "Room 101" -> "R101")
    for r in dataset.rooms:
        if r.name in room_ids_to_remove:
            room_ids_to_remove.add(r.room_id)

    modified_rooms = [copy.deepcopy(r) for r in dataset.rooms]

    if action == "remove":
        # Remove designated rooms
        modified_rooms = [r for r in modified_rooms if r.room_id not in room_ids_to_remove and r.name not in room_ids_to_remove]
    elif action == "add":
        new_id = params.get("room_id", f"R_ADD_{len(modified_rooms) + 1}")
        new_name = params.get("name", f"Lab 204 (Reserve)" if params.get("type") == "lab" else "Room 108")
        capacity = params.get("capacity", 50)
        room_type = params.get("type", "lecture")
        modified_rooms.append(Room(room_id=new_id, name=new_name, capacity=capacity, type=room_type))

    # All slots free by default
    allowed_slots_per_event = {ev.event_id: list(range(8)) for ev in dataset.events}

    return {
        "dataset": dataset,
        "change_type": "room_change",
        "rooms": modified_rooms,
        "faculty": dataset.faculty,
        "events": dataset.events,
        "allowed_slots_per_event": allowed_slots_per_event,
        "params": params,
    }


@registry.register("faculty_load_cap")
def apply_faculty_load_cap(
    dataset: ProblemInstance,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Updates max teaching hours per week across faculty members."""
    max_hours = params.get("max_hours_per_week", 15)
    modified_faculty = [copy.deepcopy(f) for f in dataset.faculty]
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
        "params": params,
    }

def apply_change(dataset: ProblemInstance, change: Dict[str, Any]) -> Dict[str, Any]:
    return registry.apply(dataset, change)
