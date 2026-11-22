"""Which ITR form fits, and when the return is due."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

from engine.tax.profile import TaxInputs
from engine.tax.rules import TaxRules

FORM_NAMES = {
    "ITR-1": "ITR-1 (Sahaj)",
    "ITR-2": "ITR-2",
    "ITR-3": "ITR-3",
    "ITR-4": "ITR-4 (Sugam)",
}


def recommend_itr_form(inputs: TaxInputs, breakdown: Dict[str, Any], rules: TaxRules) -> Dict[str, Any]:
    """Pick ITR-1, ITR-2 or ITR-4 (ITR-3 is flagged as unsupported), with the reasons."""
    reasons: List[str] = []
    blockers: List[str] = []
    income = breakdown["taxable_income"]
    over_limit = income > rules.itr1_income_limit
    if over_limit:
        blockers.append(f"total income is above ₹{rules.itr1_income_limit:,.0f}")
    if not inputs.resident:
        blockers.append("you're not a resident")
    if inputs.stcg_111a > 0:
        blockers.append("you have short-term capital gains")
    if inputs.ltcg_112a > rules.itr1_ltcg_limit:
        blockers.append(f"long-term equity gains are above ₹{rules.itr1_ltcg_limit:,.0f}")
    if inputs.house_count > rules.itr1_max_houses:
        blockers.append("you have more than two house properties")

    presumptive = breakdown["presumptive"]
    if inputs.has_presumptive:
        if not presumptive["within_limit"]:
            return {
                "form": "ITR-3",
                "name": FORM_NAMES["ITR-3"],
                "supported": False,
                "reasons": [
                    f"Receipts are above the {presumptive['section']} limit, so you need regular books "
                    "and ITR-3. FutureFork doesn't prepare ITR-3 yet; use a CA or the portal's ITR-3 utility."
                ],
            }
        if blockers:
            return {
                "form": "ITR-3",
                "name": FORM_NAMES["ITR-3"],
                "supported": False,
                "reasons": [
                    f"You have {presumptive['section']} income, and ITR-4 can't be used because "
                    + "; ".join(blockers)
                    + ". That needs ITR-3, which FutureFork doesn't prepare yet."
                ],
            }
        reasons.append(f"You have presumptive income under section {presumptive['section']}.")
        reasons.append("Your total income is within ₹50 lakh and you have no short-term gains.")
        return {"form": "ITR-4", "name": FORM_NAMES["ITR-4"], "supported": True, "reasons": reasons}

    if blockers:
        reasons.append("ITR-1 can't be used because " + "; ".join(blockers) + ".")
        reasons.append("ITR-2 covers salary, house property, capital gains and other income.")
        return {"form": "ITR-2", "name": FORM_NAMES["ITR-2"], "supported": True, "reasons": reasons}

    reasons.append("Your income is from salary, house property and other sources, within ₹50 lakh.")
    if inputs.ltcg_112a:
        reasons.append("Long-term equity gains up to ₹1.25 lakh can be reported in ITR-1.")
    reasons.append("ITR-1 isn't allowed if you're a company director or hold unlisted shares; use ITR-2 then.")
    return {"form": "ITR-1", "name": FORM_NAMES["ITR-1"], "supported": True, "reasons": reasons}


def filing_window(inputs: TaxInputs, rules: TaxRules, as_of: date) -> Dict[str, Any]:
    """Where the filer stands on the calendar, and whether the old regime is still open."""
    due = rules.due_date_business if inputs.has_presumptive else rules.due_date_salaried
    if rules.status == "planning":
        return {
            "status": "planning",
            "section": None,
            "due_date": due.isoformat(),
            "belated_until": rules.belated_until.isoformat(),
            "old_regime_allowed": True,
            "message": (
                f"FY {rules.fy} is still running. Use this to plan: the return opens after 1 April "
                f"and is due {due.strftime('%d %b %Y')}."
            ),
        }
    if as_of <= due:
        return {
            "status": "on_time",
            "section": "139(1)",
            "due_date": due.isoformat(),
            "belated_until": rules.belated_until.isoformat(),
            "old_regime_allowed": True,
            "message": f"File by {due.strftime('%d %b %Y')} to stay on time.",
        }
    if as_of <= rules.belated_until:
        return {
            "status": "belated",
            "section": "139(4)",
            "due_date": due.isoformat(),
            "belated_until": rules.belated_until.isoformat(),
            "old_regime_allowed": False,
            "message": (
                f"The due date ({due.strftime('%d %b %Y')}) has passed. You can still file a belated "
                f"return until {rules.belated_until.strftime('%d %b %Y')}, under the new regime only, "
                "with a late fee."
            ),
        }
    return {
        "status": "closed",
        "section": "139(8A)",
        "due_date": due.isoformat(),
        "belated_until": rules.belated_until.isoformat(),
        "old_regime_allowed": False,
        "message": (
            "The belated-return window has closed. You can only file an updated return (ITR-U), "
            "which adds extra tax on top of what you owe. Talk to a CA."
        ),
    }


def late_fee(taxable_income: float, window: Dict[str, Any], rules: TaxRules, exemption_limit: float) -> float:
    """Section 234F fee for a belated return (none if income is within the basic exemption)."""
    if window["status"] not in ("belated", "closed") or taxable_income <= exemption_limit:
        return 0.0
    if taxable_income <= rules.late_fee_small_income:
        return rules.late_fee_small
    return rules.late_fee
