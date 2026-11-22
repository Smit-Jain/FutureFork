"""One call that produces everything the ITR helper shows: both regimes, the verdict, the form,
tax-saving moves and the filing guide."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from engine.tax.checklist import filing_checklist
from engine.tax.compute import basic_exemption, compute_tax
from engine.tax.forms import filing_window, late_fee, recommend_itr_form
from engine.tax.profile import TaxInputs
from engine.tax.rules import get_rules
from engine.tax.savings import tax_saving_moves


def fmt_inr(amount: float) -> str:
    """₹1,23,456 (Indian digit grouping, whole rupees)."""
    n = int(round(abs(amount)))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return ("-₹" if amount < 0 else "₹") + s


def _verdict(new: Dict[str, Any], old: Dict[str, Any], recommended: str, window: Dict[str, Any], fee: float) -> Dict[str, Any]:
    chosen = new if recommended == "new" else old
    other = old if recommended == "new" else new
    diff = other["total_tax"] - chosen["total_tax"]

    if recommended == "old" and diff > 0:
        headline = f"Your tax is {fmt_inr(old['total_tax'])} if you opt for the old regime."
        sub = f"Your deductions make the old regime {fmt_inr(diff)} cheaper; you must choose it when filing on time."
    else:
        headline = f"Your tax is {fmt_inr(new['total_tax'])} under the new regime."
        if not window["old_regime_allowed"]:
            sub = "The new regime is the default and the only option for a late (belated) return."
        else:
            sub = "The new regime is the default, and for your income it's the cheaper one."
    if chosen["refund"]:
        outcome, outcome_amount = "refund", chosen["refund"]
        result = f"You get back {fmt_inr(chosen['refund'])}."
    elif chosen["payable"] or fee:
        outcome, outcome_amount = "payable", chosen["payable"] + fee
        result = f"You still need to pay {fmt_inr(chosen['payable'] + fee)}" + (
            f", including a {fmt_inr(fee)} late fee." if fee else "."
        )
    else:
        outcome, outcome_amount = "settled", 0
        result = "Your TDS already covers it: nothing more to pay."
    return {
        "headline": headline,
        "subline": sub,
        "result": result,
        "outcome": outcome,
        "outcome_amount": round(outcome_amount),
        "regime": recommended,
        "saving_vs_other": round(max(0, diff)),
    }


def build_tax_report(data: Dict[str, Any], as_of: Optional[date] = None) -> Dict[str, Any]:
    inputs = TaxInputs.from_dict(data)
    rules = get_rules(inputs.fy)
    as_of = as_of or date.today()

    new = compute_tax(inputs, "new", rules)
    old = compute_tax(inputs, "old", rules)
    window = filing_window(inputs, rules, as_of)
    cheaper = "old" if old["total_tax"] < new["total_tax"] else "new"
    recommended = cheaper if window["old_regime_allowed"] else "new"
    chosen = new if recommended == "new" else old
    slabs = rules.new.slabs if recommended == "new" else rules.old_slabs(inputs.age_band)
    fee = late_fee(chosen["taxable_income"], window, rules, basic_exemption(slabs))
    form = recommend_itr_form(inputs, chosen, rules)
    moves = tax_saving_moves(inputs, rules)
    checklist = filing_checklist(inputs, chosen, form, window, fee, rules)

    return {
        "fy": rules.fy,
        "ay": rules.ay,
        "rules_status": rules.status,
        "as_of": as_of.isoformat(),
        "inputs": inputs.to_dict(),
        "new": new,
        "old": old,
        "cheaper": cheaper,
        "recommended": recommended,
        "regime_saving": round(abs(new["total_tax"] - old["total_tax"])),
        "window": window,
        "late_fee": round(fee),
        "form": form,
        "verdict": _verdict(new, old, recommended, window, fee),
        "savings": moves,
        "checklist": checklist,
    }
