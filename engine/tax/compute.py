"""
Deterministic income-tax computation for one regime (Golden Rule: every rupee comes from here).

compute_tax walks the same order the Income Tax Department uses:
  income by head → exemptions → standard deduction → Chapter VI-A deductions → total income
  → slab tax + special-rate tax (111A / 112A) → 87A rebate → surcharge → 4% cess
  → rounding (288B) → minus TDS / TCS / advance tax → refund or balance payable.

Each step is recorded as a line item so the UI and the explainer can show the trail.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from engine.tax.profile import TaxInputs
from engine.tax.rules import RegimeRules, Slabs, TaxRules, get_rules

Line = Dict[str, Any]


def _r(x: float) -> float:
    """Whole rupees (tax figures are reported in whole rupees)."""
    return float(math.floor(x + 0.5))


def round_to_10(x: float) -> float:
    """Section 288B: tax payable is rounded to the nearest multiple of ₹10."""
    return float(math.floor(x / 10 + 0.5) * 10)


def slab_tax(income: float, slabs: Slabs) -> float:
    tax, lower = 0.0, 0.0
    for upper, rate in slabs:
        if income <= lower:
            break
        tax += (min(income, upper) - lower) * rate
        lower = upper
    return tax


def basic_exemption(slabs: Slabs) -> float:
    upper, rate = slabs[0]
    return upper if rate == 0 else 0.0


def hra_exemption(basic_da: float, hra_received: float, rent_paid: float, metro: bool) -> float:
    """Section 10(13A): the least of HRA received, rent − 10% of salary, 50% (metro) / 40% of salary."""
    if hra_received <= 0 or rent_paid <= 0:
        return 0.0
    return max(0.0, min(hra_received, rent_paid - 0.10 * basic_da, (0.50 if metro else 0.40) * basic_da))


def presumptive_income(inputs: TaxInputs, rules: TaxRules) -> Tuple[float, Optional[str], bool, float]:
    """(income, section, within the turnover limit, the limit) for 44ADA / 44AD."""
    if not inputs.has_presumptive:
        return 0.0, None, True, 0.0
    gross = inputs.gross_receipts
    digital_share = inputs.digital_receipts / gross if gross else 0.0
    high_limit = digital_share >= rules.digital_threshold
    if inputs.taxpayer_type == "freelancer":
        limit = rules.limit_44ada_digital if high_limit else rules.limit_44ada
        deemed = gross * rules.rate_44ada
        section = "44ADA"
    else:
        limit = rules.limit_44ad_digital if high_limit else rules.limit_44ad
        cash = gross - inputs.digital_receipts
        deemed = inputs.digital_receipts * rules.rate_44ad_digital + cash * rules.rate_44ad_cash
        section = "44AD"
    # Declaring less than the presumptive rate needs books and an audit (ITR-3), so never go below it
    income = max(deemed, inputs.declared_profit)
    return income, section, gross <= limit, limit


def _surcharge_rate(total_income: float, rules: TaxRules, cap: float) -> Tuple[float, float, float]:
    """(rate, band start, previous rate) for the band the income falls in."""
    rate, start, prev = 0.0, 0.0, 0.0
    for above, band_rate in rules.surcharge_bands:
        if total_income > above:
            prev, rate, start = rate, min(band_rate, cap), above
    return rate, start, prev


def _line(lines: List[Line], key: str, label: str, amount: float, kind: str, section: str = "") -> None:
    lines.append({"key": key, "label": label, "amount": _r(amount), "kind": kind, "section": section})


def compute_tax(inputs: TaxInputs, regime: str, rules: Optional[TaxRules] = None) -> Dict[str, Any]:
    if regime not in ("new", "old"):
        raise ValueError("regime must be 'new' or 'old'")
    rules = rules or get_rules(inputs.fy)
    r: RegimeRules = rules.regime(regime)
    slabs = r.slabs if regime == "new" else rules.old_slabs(inputs.age_band)
    lines: List[Line] = []
    notes: List[str] = []

    # ── Salary ────────────────────────────────────────────────────────────
    gross_salary = inputs.gross_salary
    hra_exempt = (
        hra_exemption(inputs.basic_da, inputs.hra_received, inputs.rent_paid, inputs.metro_city)
        if r.hra_exemption else 0.0
    )
    after_hra = gross_salary - hra_exempt
    std = min(r.standard_deduction, after_hra) if gross_salary > 0 else 0.0
    ptax = min(inputs.professional_tax, rules.cap_professional_tax) if r.professional_tax else 0.0
    salary_income = max(0.0, after_hra - std - ptax)
    if gross_salary > 0:
        _line(lines, "gross_salary", "Gross salary", gross_salary, "income", "17(1)")
        if hra_exempt:
            _line(lines, "hra_exempt", "HRA exemption", -hra_exempt, "exemption", "10(13A)")
        _line(lines, "standard_deduction", "Standard deduction", -std, "deduction", "16(ia)")
        if ptax:
            _line(lines, "professional_tax", "Professional tax", -ptax, "deduction", "16(iii)")
        _line(lines, "salary_income", "Income from salary", salary_income, "subtotal")
    if regime == "new" and inputs.hra_received and inputs.rent_paid:
        notes.append("HRA exemption isn't available in the new regime.")

    # ── House property ────────────────────────────────────────────────────
    nav = max(0.0, inputs.let_out_rent - inputs.let_out_municipal_tax)
    let_out = nav - nav * rules.house_std_deduction_pct - inputs.let_out_loan_interest
    self_occ = min(inputs.home_loan_interest, rules.cap_24b) if r.self_occupied_interest else 0.0
    house = let_out - self_occ
    house_loss_lost = 0.0
    if house < 0:
        allowed = max(house, -r.house_loss_setoff)
        house_loss_lost = allowed - house
        house = allowed
    if inputs.let_out_rent or inputs.home_loan_interest:
        _line(lines, "house_income", "Income from house property", house, "income", "22-24")
        if house_loss_lost:
            notes.append(
                "Part of your house-property loss can't be set off this year "
                f"({'not allowed in the new regime' if regime == 'new' else 'capped at ₹2,00,000'})."
            )
    if regime == "new" and inputs.home_loan_interest:
        notes.append("Home-loan interest on a self-occupied home isn't deductible in the new regime.")

    # ── Business / profession (presumptive) ───────────────────────────────
    business, section, eligible, limit = presumptive_income(inputs, rules)
    if section:
        _line(lines, "gross_receipts", f"Gross receipts ({section})", inputs.gross_receipts, "info", section)
        _line(lines, "business_income", f"Presumptive income u/s {section}", business, "income", section)
        if not eligible:
            notes.append(
                f"Receipts are above the ₹{limit:,.0f} limit for {section}, so presumptive taxation "
                "doesn't apply: you need books of account and ITR-3."
            )

    # ── Other sources ─────────────────────────────────────────────────────
    interest = inputs.savings_interest + inputs.deposit_interest
    other = interest + inputs.dividends + inputs.other_income
    if other:
        _line(lines, "other_income", "Income from other sources", other, "income", "56")

    normal_gti = max(0.0, salary_income + house + business + other)
    stcg, ltcg = inputs.stcg_111a, inputs.ltcg_112a
    if stcg:
        _line(lines, "stcg_111a", "Short-term gains on equity (20%)", stcg, "income", "111A")
    if ltcg:
        _line(lines, "ltcg_112a", "Long-term gains on equity (12.5% above ₹1.25L)", ltcg, "income", "112A")
    gross_total = normal_gti + stcg + ltcg
    _line(lines, "gross_total_income", "Gross total income", gross_total, "subtotal")

    # ── Deductions (Chapter VI-A; can't reduce 111A / 112A gains) ─────────
    deductions: Dict[str, float] = {}
    nps_cap = r.employer_nps_pct * inputs.basic_da
    if inputs.employer_nps:
        deductions["80CCD(2)"] = min(inputs.employer_nps, nps_cap)
    if r.chapter_via:
        deductions["80C"] = min(inputs.d_80c, rules.cap_80c)
        deductions["80CCD(1B)"] = min(inputs.d_80ccd1b, rules.cap_80ccd1b)
        self_cap = rules.cap_80d_self_senior if inputs.senior else rules.cap_80d_self
        par_cap = rules.cap_80d_parents_senior if inputs.parents_senior else rules.cap_80d_parents
        deductions["80D"] = min(inputs.d_80d_self, self_cap) + min(inputs.d_80d_parents, par_cap)
        deductions["80E"] = inputs.d_80e
        if inputs.senior:
            deductions["80TTB"] = min(interest, rules.cap_80ttb)
        else:
            deductions["80TTA"] = min(inputs.savings_interest, rules.cap_80tta)
    elif any((inputs.d_80c, inputs.d_80ccd1b, inputs.d_80d_self, inputs.d_80d_parents, inputs.d_80e)):
        notes.append("80C, 80D, 80CCD(1B) and 80E deductions don't apply in the new regime.")
    deductions = {k: _r(v) for k, v in deductions.items() if v > 0}
    total_deductions = min(sum(deductions.values()), normal_gti)
    for sec, amount in deductions.items():
        _line(lines, f"ded_{sec}", f"Deduction u/s {sec}", -amount, "deduction", sec)

    normal_taxable = normal_gti - total_deductions
    total_income = normal_taxable + stcg + ltcg
    _line(lines, "total_income", "Total taxable income", total_income, "subtotal")

    # ── Tax ───────────────────────────────────────────────────────────────
    # Residents can use any unused basic exemption against 111A, then 112A gains
    shortfall = max(0.0, basic_exemption(slabs) - normal_taxable) if inputs.resident else 0.0
    stcg_taxable = max(0.0, stcg - shortfall)
    shortfall = max(0.0, shortfall - stcg)
    ltcg_taxable = max(0.0, ltcg - rules.ltcg_112a_exempt - shortfall)

    normal_tax = slab_tax(normal_taxable, slabs)
    stcg_tax = stcg_taxable * rules.stcg_111a_rate
    ltcg_tax = ltcg_taxable * rules.ltcg_112a_rate
    _line(lines, "slab_tax", "Tax at slab rates", normal_tax, "tax")
    if stcg_tax:
        _line(lines, "stcg_tax", "Tax on short-term equity gains", stcg_tax, "tax", "111A")
    if ltcg_tax:
        _line(lines, "ltcg_tax", "Tax on long-term equity gains", ltcg_tax, "tax", "112A")

    # 87A rebate: residents only, never on 112A gains (nor 111A gains in the new regime)
    rebate = 0.0
    marginal = False
    if inputs.resident:
        if total_income <= r.rebate_income_limit:
            eligible_tax = normal_tax + (stcg_tax if regime == "old" else 0.0)
            rebate = min(r.rebate_max, eligible_tax)
        elif r.rebate_marginal_relief:
            excess = total_income - r.rebate_income_limit
            if normal_tax > excess:
                rebate, marginal = normal_tax - excess, True
    normal_after = normal_tax - min(rebate, normal_tax)
    stcg_after = stcg_tax - max(0.0, rebate - normal_tax)
    if rebate:
        label = "Marginal relief on the 87A rebate" if marginal else "Rebate u/s 87A"
        _line(lines, "rebate_87a", label, -rebate, "relief", "87A")
    if (stcg_tax or ltcg_tax) and total_income <= r.rebate_income_limit and inputs.resident:
        notes.append("The 87A rebate doesn't cover tax on equity capital gains.")

    tax_after_rebate = normal_after + stcg_after + ltcg_tax

    # Surcharge (with marginal relief at each band)
    s_rate, band_start, prev_rate = _surcharge_rate(total_income, rules, r.surcharge_cap)
    sp_rate = min(s_rate, rules.special_surcharge_cap)
    surcharge = normal_after * s_rate + (stcg_after + ltcg_tax) * sp_rate
    if surcharge and total_income - band_start < normal_taxable:
        normal_at_start = normal_taxable - (total_income - band_start)
        prev_sp = min(prev_rate, rules.special_surcharge_cap)
        tax_at_start = slab_tax(normal_at_start, slabs) * (1 + prev_rate) + (stcg_after + ltcg_tax) * (1 + prev_sp)
        relief = (tax_after_rebate + surcharge) - (tax_at_start + (total_income - band_start))
        if relief > 0:
            surcharge = max(0.0, surcharge - relief)
            notes.append("Marginal relief on surcharge applied.")
    if surcharge:
        _line(lines, "surcharge", f"Surcharge ({s_rate * 100:.0f}%)", surcharge, "tax")

    cess = (tax_after_rebate + surcharge) * rules.cess_rate
    if cess:
        _line(lines, "cess", "Health & education cess (4%)", cess, "tax")
    total_tax = round_to_10(tax_after_rebate + surcharge + cess)
    _line(lines, "total_tax", "Total tax", total_tax, "total")

    taxes_paid = inputs.tds + inputs.tcs + inputs.advance_tax
    if taxes_paid:
        _line(lines, "taxes_paid", "Tax already paid (TDS, TCS, advance tax)", -taxes_paid, "paid")
    net = total_tax - taxes_paid
    payable, refund = _r(max(0.0, net)), _r(max(0.0, -net))
    if payable:
        _line(lines, "payable", "Balance tax to pay", payable, "result")
    elif refund:
        _line(lines, "refund", "Refund due", refund, "result")

    return {
        "regime": regime,
        "gross_total_income": _r(gross_total),
        "total_deductions": _r(total_deductions + hra_exempt + std + ptax),
        "taxable_income": _r(total_income),
        "slab_tax": _r(normal_tax),
        "special_rate_tax": _r(stcg_tax + ltcg_tax),
        "rebate": _r(rebate),
        "surcharge": _r(surcharge),
        "cess": _r(cess),
        "total_tax": total_tax,
        "taxes_paid": _r(taxes_paid),
        "payable": payable,
        "refund": refund,
        "effective_rate_pct": round(total_tax / gross_total * 100, 2) if gross_total else 0.0,
        "heads": {
            "salary": _r(salary_income),
            "house_property": _r(house),
            "business": _r(business),
            "other_sources": _r(other),
            "stcg_111a": _r(stcg),
            "ltcg_112a": _r(ltcg),
        },
        "exemptions": {"hra": _r(hra_exempt), "standard_deduction": _r(std), "professional_tax": _r(ptax)},
        "deductions": deductions,
        "presumptive": {
            "section": section,
            "income": _r(business),
            "within_limit": eligible,
            "limit": _r(limit),
        },
        "lines": lines,
        "notes": notes,
    }
