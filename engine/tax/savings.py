"""
Tax-saving moves: each is the same profile with one change, recomputed under both regimes.

The financial year being filed is already over (investments had to be made by 31 March), so
moves are evaluated for the planning year with the same income. That shows what the change saves
from now on, not a retroactive claim.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.tax.compute import compute_tax
from engine.tax.profile import TaxInputs
from engine.tax.rules import RULES, TaxRules


def planning_rules(rules: TaxRules) -> TaxRules:
    """The year moves are evaluated for: the next planning year after a filing year."""
    if rules.status == "planning":
        return rules
    for r in RULES.values():
        if r.status == "planning" and r.fy > rules.fy:
            return r
    return rules


def best_tax(inputs: TaxInputs, rules: TaxRules) -> Dict[str, Any]:
    new = compute_tax(inputs, "new", rules)
    old = compute_tax(inputs, "old", rules)
    best = old if old["total_tax"] < new["total_tax"] else new
    return {"regime": best["regime"], "total_tax": best["total_tax"], "new": new["total_tax"], "old": old["total_tax"]}


def _move(
    key: str,
    title: str,
    detail: str,
    changed: TaxInputs,
    outlay: float,
    base: Dict[str, Any],
    rules: TaxRules,
    locks_money: bool = False,
) -> Dict[str, Any]:
    after = best_tax(changed.with_changes(fy=rules.fy), rules)
    saving = max(0.0, base["total_tax"] - after["total_tax"])
    return {
        "key": key,
        "title": title,
        "detail": detail,
        "extra_outlay": round(outlay),
        "tax_before": base["total_tax"],
        "tax_after": after["total_tax"],
        "saving": round(saving),
        "regime_after": after["regime"],
        "benefit": saving > 0,
        "locks_money": locks_money,
    }


def tax_saving_moves(inputs: TaxInputs, filing_rules: TaxRules) -> Dict[str, Any]:
    rules = planning_rules(filing_rules)
    current = inputs.with_changes(fy=rules.fy)
    base = best_tax(current, rules)
    moves: List[Dict[str, Any]] = []

    def add(m: Optional[Dict[str, Any]]) -> None:
        if m:
            moves.append(m)

    if inputs.d_80c < rules.cap_80c:
        gap = rules.cap_80c - inputs.d_80c
        add(_move(
            "fill_80c", "Use your full 80C limit",
            "Put the rest of the ₹1.5 lakh limit into PPF, ELSS or EPF (VPF). Only helps in the old regime.",
            current.with_changes(d_80c=rules.cap_80c), gap, base, rules, locks_money=True,
        ))
    if inputs.d_80ccd1b < rules.cap_80ccd1b:
        gap = rules.cap_80ccd1b - inputs.d_80ccd1b
        add(_move(
            "nps_80ccd1b", "Add ₹50,000 to your own NPS",
            "80CCD(1B) is an extra deduction on top of 80C. Only helps in the old regime; money is locked till 60.",
            current.with_changes(d_80ccd1b=rules.cap_80ccd1b), gap, base, rules, locks_money=True,
        ))
    self_cap = rules.cap_80d_self_senior if inputs.senior else rules.cap_80d_self
    if inputs.d_80d_self < self_cap:
        gap = self_cap - inputs.d_80d_self
        add(_move(
            "health_self", "Buy health insurance for your family",
            "Premiums for you, your spouse and children are deductible u/s 80D in the old regime.",
            current.with_changes(d_80d_self=self_cap), gap, base, rules,
        ))
    par_cap = rules.cap_80d_parents_senior if inputs.parents_senior else rules.cap_80d_parents
    if inputs.d_80d_parents < par_cap:
        gap = par_cap - inputs.d_80d_parents
        add(_move(
            "health_parents", "Pay your parents' health insurance",
            "A separate 80D limit applies to parents' premiums (higher if they're 60+). Old regime only.",
            current.with_changes(d_80d_parents=par_cap), gap, base, rules,
        ))
    if inputs.taxpayer_type == "salaried" and inputs.basic_da > 0:
        target = round(rules.new.employer_nps_pct * inputs.basic_da)
        shift = target - inputs.employer_nps
        if shift > 0 and inputs.other_salary >= shift:
            add(_move(
                "employer_nps", "Ask your employer to route salary into NPS",
                "Employer NPS up to 14% of basic is deductible in both regimes. Your pay stays the same; "
                "part of it goes to NPS instead of your bank account.",
                current.with_changes(employer_nps=target, other_salary=inputs.other_salary - shift),
                0, base, rules, locks_money=True,
            ))
    if inputs.has_presumptive and inputs.declared_profit > 0:
        add(_move(
            "presumptive_rate", "Declare profit at the presumptive rate",
            "You declared more profit than the presumptive rate needs. Declaring at the rate is allowed and cuts tax.",
            current.with_changes(declared_profit=0), 0, base, rules,
        ))

    moves.sort(key=lambda m: (-m["saving"], m["extra_outlay"]))
    return {"fy": rules.fy, "baseline_tax": base["total_tax"], "baseline_regime": base["regime"], "moves": moves}
