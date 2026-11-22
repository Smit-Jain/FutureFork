"""
Actionable answers from the baseline plan: how much can be spent safely, and when.

Spending X in month m lowers every closing balance from m onward by X, so the most that
can be spent in month m without going below the floor is min(balance[m:]) − floor.
Pure and deterministic, computed from the engine's own baseline balances.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def affordability(
    balances: List[float],
    months: List[str],
    floor: float,
    cost: Optional[float],
) -> Optional[Dict[str, Any]]:
    if not balances:
        return None
    n = len(balances)
    headroom = [min(balances[m:]) - floor for m in range(n)]
    best = max(range(n), key=lambda m: (headroom[m], -m))
    max_safe = max(0.0, headroom[best])
    # The earliest month in which the whole cost fits, if any
    fits_from = None
    if cost:
        fits_from = next((m for m in range(n) if headroom[m] >= cost), None)
    shortfall = max(0.0, (cost or 0.0) - max_safe)
    label = lambda m: months[m] if m < len(months) else f"month {m + 1}"  # noqa: E731
    return {
        "safe_now": round(max(0.0, headroom[0])),
        "max_safe_amount": round(max_safe),
        "best_month": label(best),
        "best_month_index": best + 1,
        "cost": round(cost or 0.0),
        "floor": round(floor),
        "fits": bool(cost) and fits_from is not None,
        "earliest_safe_month": label(fits_from) if fits_from is not None else None,
        "shortfall": round(shortfall),
        "monthly_cut_to_close_gap": round(shortfall / n) if shortfall else 0,
        "headroom_by_month": [round(h) for h in headroom],
    }
