"""Step-by-step guide for filing on the e-filing portal (incometax.gov.in), with the values to enter."""

from __future__ import annotations

from typing import Any, Dict, List

from engine.tax.profile import TaxInputs
from engine.tax.rules import TaxRules


def _f(label: str, value: float, where: str) -> Dict[str, Any]:
    return {"label": label, "value": round(value), "where": where}


def _fields(inputs: TaxInputs, b: Dict[str, Any], form: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    sal = "Gross Total Income → Salary" if form != "ITR-2" else "Schedule Salary"
    if inputs.gross_salary:
        out.append(_f("Gross salary", inputs.gross_salary, sal))
        if b["exemptions"]["hra"]:
            out.append(_f("HRA exempt u/s 10(13A)", b["exemptions"]["hra"], f"{sal} → Exempt allowances"))
        out.append(_f("Standard deduction u/s 16(ia)", b["exemptions"]["standard_deduction"], f"{sal} → Deductions u/s 16"))
        if b["exemptions"]["professional_tax"]:
            out.append(_f("Professional tax u/s 16(iii)", b["exemptions"]["professional_tax"], f"{sal} → Deductions u/s 16"))
    if inputs.let_out_rent or inputs.home_loan_interest:
        hp = "Schedule HP" if form == "ITR-2" else "Gross Total Income → House Property"
        if inputs.let_out_rent:
            out.append(_f("Rent received (let-out)", inputs.let_out_rent, hp))
        if inputs.home_loan_interest and b["regime"] == "old":
            out.append(_f("Interest on home loan (self-occupied)", min(inputs.home_loan_interest, 200_000), hp))
        out.append(_f("Income from house property", b["heads"]["house_property"], hp))
    p = b["presumptive"]
    if p["section"]:
        out.append(_f(f"Gross receipts u/s {p['section']}", inputs.gross_receipts, "Schedule BP → Presumptive income"))
        if p["section"] == "44AD":
            out.append(_f("Receipts by bank / UPI", inputs.digital_receipts, "Schedule BP → 44AD"))
        out.append(_f(f"Presumptive income u/s {p['section']}", p["income"], "Schedule BP"))
    os_where = "Schedule OS" if form == "ITR-2" else "Gross Total Income → Other Sources"
    for label, value in (
        ("Savings account interest", inputs.savings_interest),
        ("Deposit interest (FD/RD)", inputs.deposit_interest),
        ("Dividends", inputs.dividends),
        ("Any other income", inputs.other_income),
    ):
        if value:
            out.append(_f(label, value, os_where))
    if inputs.stcg_111a:
        out.append(_f("Short-term gains u/s 111A", inputs.stcg_111a, "Schedule CG → Short-term (111A)"))
    if inputs.ltcg_112a:
        where = "Schedule 112A" if form == "ITR-2" else "LTCG u/s 112A (in the income details)"
        out.append(_f("Long-term gains u/s 112A", inputs.ltcg_112a, where))
    for sec, amount in b["deductions"].items():
        out.append(_f(f"Deduction u/s {sec}", amount, "Deductions → Chapter VI-A"))
    if inputs.tds:
        out.append(_f("TDS (match Form 16 / 16A and 26AS)", inputs.tds, "Tax Paid → TDS"))
    if inputs.tcs:
        out.append(_f("TCS", inputs.tcs, "Tax Paid → TCS"))
    if inputs.advance_tax:
        out.append(_f("Advance tax paid", inputs.advance_tax, "Tax Paid → Advance / self-assessment tax"))
    out.append(_f("Total tax liability (portal should match)", b["total_tax"], "Tax Computation"))
    return out


def filing_checklist(
    inputs: TaxInputs,
    breakdown: Dict[str, Any],
    form: Dict[str, Any],
    window: Dict[str, Any],
    fee: float,
    rules: TaxRules,
) -> Dict[str, Any]:
    regime_label = "new regime (default)" if breakdown["regime"] == "new" else "old regime (opt out of the new regime)"
    steps: List[Dict[str, Any]] = []

    def step(title: str, detail: str, fields: List[Dict[str, Any]] | None = None) -> None:
        steps.append({"n": len(steps) + 1, "title": title, "detail": detail, "fields": fields or []})

    if window["status"] == "planning":
        step(
            "Plan for this year",
            f"FY {rules.fy} returns open after 1 April. Keep Form 16, interest certificates and investment proofs; "
            "the numbers below are what the return should show if nothing changes.",
            _fields(inputs, breakdown, form["form"]),
        )
        return {"form": form["form"], "regime": breakdown["regime"], "steps": steps, "documents": _documents(inputs)}

    step(
        "Log in to the e-filing portal",
        "Go to incometax.gov.in and log in with your PAN (your user ID) and password. "
        "Make sure your PAN is linked to Aadhaar and your bank account is pre-validated for refunds.",
    )
    step(
        "Check your AIS and Form 26AS",
        "Under Services → Annual Information Statement, download AIS and Form 26AS. Every TDS entry and the interest "
        "and dividends shown there should match what you entered here. If AIS shows income you forgot, add it before filing.",
        [f for f in _fields(inputs, breakdown, form["form"]) if f["where"].startswith("Tax Paid")],
    )
    step(
        "Start the return",
        f"e-File → Income Tax Returns → File Income Tax Return. Choose AY {rules.ay}, mode Online, status Individual, "
        f"then {form['name']}. Filing section: {window['section']}"
        + (" (belated return)." if window["status"] == "belated" else "."),
    )
    regime_detail = f"Choose the {regime_label}."
    if breakdown["regime"] == "old" and inputs.has_presumptive:
        regime_detail += " With business income you also need Form 10-IEA, filed before the due date."
    if window["status"] == "belated":
        regime_detail = "A belated return is taxed under the new regime; the old regime option isn't available."
    step("Pick your tax regime", regime_detail)
    step(
        "Enter or confirm these figures",
        "Most of these are pre-filled from your employer and bank. Check each one against this list and edit any that differ.",
        _fields(inputs, breakdown, form["form"]),
    )
    pay = breakdown["payable"] + fee
    if pay > 0:
        detail = (
            "Pay the balance before you submit: e-Pay Tax → New Payment → Income Tax → "
            f"AY {rules.ay} → Self-Assessment Tax (300). Then add the challan in the Tax Paid section."
        )
        if fee:
            detail += " Include the late fee u/s 234F as 'Fee' in the same challan, or a separate one."
        if breakdown["payable"] > rules.advance_tax_threshold:
            detail += " The portal also adds interest u/s 234B / 234C because advance tax wasn't fully paid; pay what it shows."
        fields = [_f("Self-assessment tax", breakdown["payable"], "Challan 280 → Tax")]
        if fee:
            fields.append(_f("Late fee u/s 234F", fee, "Challan 280 → Fee"))
        step("Pay the balance tax", detail, fields)
    elif breakdown["refund"]:
        step(
            "Check the refund",
            "The portal should show a refund. It goes to your pre-validated bank account after processing, usually within weeks.",
            [_f("Refund due", breakdown["refund"], "Tax Computation → Refund")],
        )
    step(
        "Submit and e-verify within 30 days",
        "Preview the return, submit it, then e-verify with Aadhaar OTP, net banking or a bank EVC. "
        "A return that isn't verified within 30 days is treated as not filed.",
    )
    return {"form": form["form"], "regime": breakdown["regime"], "steps": steps, "documents": _documents(inputs)}


def _documents(inputs: TaxInputs) -> List[str]:
    docs = ["PAN and Aadhaar (linked)", "Bank account details (pre-validated on the portal)", "AIS and Form 26AS"]
    if inputs.gross_salary:
        docs.append("Form 16 from your employer")
    if inputs.rent_paid:
        docs.append("Rent receipts (and landlord's PAN if rent is above ₹1 lakh a year)")
    if inputs.home_loan_interest or inputs.let_out_loan_interest:
        docs.append("Home-loan interest certificate")
    if inputs.has_presumptive:
        docs.append("Invoices / bank statements for your receipts (Form 16A for TDS)")
    if inputs.stcg_111a or inputs.ltcg_112a:
        docs.append("Capital-gains statement from your broker / mutual-fund registrar")
    if inputs.d_80c or inputs.d_80ccd1b or inputs.d_80d_self or inputs.d_80d_parents or inputs.d_80e:
        docs.append("Proofs for deductions (80C, 80D, NPS, education loan)")
    return docs
