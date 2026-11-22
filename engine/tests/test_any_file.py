"""
Robustness: real-world export formats must compile into a sensible 12-month baseline.

Each case builds the same 3 months of a salaried person's transactions in a different
format (delimiters, preambles, Dr/Cr markers, European decimals, ...). Every format
must recover the same income and spending.
"""

from __future__ import annotations

import io
from datetime import date

import pytest

from data.ingestor import FinancialIngestor
from data.normalize import UnreadableFileError, detect_columns, load_table

# (date, description, category, signed amount) — 3 months, opening balance 50,000
TXNS = []
for m in (4, 5, 6):
    TXNS += [
        (date(2024, m, 1), "SALARY CREDIT ACME", "Salary", 90000.0),
        (date(2024, m, 3), "RENT TO LANDLORD", "Rent", -25000.0),
        (date(2024, m, 9), "UPI/SWIGGY ORDER", "Food", -4000.0),
        (date(2024, m, 15), "ELECTRICITY BILL", "Utilities", -2500.0),
    ]
INCOME = 3 * 90000.0
SPEND = 3 * (25000.0 + 4000.0 + 2500.0)
OPENING = 50000.0


def _rows(fmt):
    bal = OPENING
    for d, desc, cat, amt in TXNS:
        bal += amt
        yield fmt(d, desc, cat, amt, bal)


def _csv(header, rows, sep=","):
    return (sep.join(header) + "\n" + "\n".join(sep.join(map(str, r)) for r in rows) + "\n").encode()


def _inr(x: float) -> str:
    whole, dec = f"{abs(x):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        whole = ",".join(([head] if head else []) + parts + [tail])
    return f"{whole}.{dec}"


FORMATS = {
    "signed_iso": lambda: _csv(
        ["Date", "Description", "Category", "Amount"],
        _rows(lambda d, de, c, a, b: (d.isoformat(), de, c, f"{a:.2f}"))),
    "hdfc_withdrawal_deposit_with_balance": lambda: _csv(
        ["Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
        _rows(lambda d, de, c, a, b: (d.strftime("%d/%m/%y"), de, "R123", f'"{_inr(-a)}"' if a < 0 else "",
                                       f'"{_inr(a)}"' if a > 0 else "", f'"{_inr(b)}"'))),
    "bank_preamble_debit_credit": lambda: b"Account Name : TEST USER\nAccount No : XXXX1234\n\n" + _csv(
        ["Txn Date", "Value Date", "Description", "Debit", "Credit", "Balance"],
        _rows(lambda d, de, c, a, b: (d.strftime("%d %b %Y"), d.strftime("%d %b %Y"), de,
                                       f"{-a:.2f}" if a < 0 else "", f"{a:.2f}" if a > 0 else "", f"{b:.2f}"))),
    "amount_with_drcr_flag": lambda: _csv(
        ["Transaction Date", "Particulars", "Amount", "Dr/Cr"],
        _rows(lambda d, de, c, a, b: (d.strftime("%d-%m-%Y"), de, f"{abs(a):.2f}", "DR" if a < 0 else "CR"))),
    "semicolon_european_decimals": lambda: _csv(
        ["Datum", "Omschrijving", "Bedrag"],
        _rows(lambda d, de, c, a, b: (d.strftime("%d.%m.%Y"), de,
                                       f"{a:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))), sep=";"),
    "tab_separated": lambda: _csv(
        ["txn_date", "details", "withdrawals", "deposits"],
        _rows(lambda d, de, c, a, b: (d.isoformat(), de, f"{-a:.2f}" if a < 0 else "0", f"{a:.2f}" if a > 0 else "0")),
        sep="\t"),
    "us_dates_parentheses": lambda: _csv(
        ["Posting Date", "Memo", "Category", "Amount"],
        _rows(lambda d, de, c, a, b: (d.strftime("%m/%d/%Y"), de, c, f"({-a:.2f})" if a < 0 else f"{a:.2f}"))),
    "suffix_dr_cr_messy_headers": lambda: _csv(
        [" DATE ", " Remarks ", " Amount (Rs.) "],
        _rows(lambda d, de, c, a, b: (d.strftime("%d/%m/%Y"), de, f"Rs. {abs(a):.2f} {'Dr' if a < 0 else 'Cr'}"))),
    "type_column_income_expense": lambda: _csv(
        ["Month", "Line Item", "Type", "Value (INR)"],
        _rows(lambda d, de, c, a, b: (d.strftime("%b-%Y"), c, "Income" if a > 0 else "Expense", f"{abs(a):.0f}"))),
    "totals_footer": lambda: _csv(
        ["Date", "Description", "Category", "Amount"],
        list(_rows(lambda d, de, c, a, b: (d.isoformat(), de, c, f"{a:.2f}"))) + [("Total", "", "", "999999")]),
}


def _excel_bytes() -> bytes:
    import pandas as pd

    df = pd.DataFrame(
        [(d, de, c, a) for d, de, c, a in TXNS], columns=["Date", "Description", "Category", "Amount"]
    )
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


@pytest.mark.parametrize("name", sorted(FORMATS))
def test_every_format_recovers_income_and_spending(name):
    inst = FinancialIngestor.compile(FORMATS[name](), dataset_id=name)
    observed = inst.raw_metadata["observed_months"]
    assert observed == 3, f"{name}: expected 3 observed months, got {observed}"
    assert sum(inst.inflows[:3]) == pytest.approx(INCOME), name
    assert sum(inst.total_outflows[:3]) == pytest.approx(SPEND), name
    # Short histories are projected from the observed average, not zero-filled
    assert inst.raw_metadata["projected_months"] == list(range(3, 12))
    assert inst.inflows[11] == pytest.approx(INCOME / 3)


@pytest.mark.parametrize("name", ["hdfc_withdrawal_deposit_with_balance", "bank_preamble_debit_credit"])
def test_opening_balance_inferred_from_balance_column(name):
    inst = FinancialIngestor.compile(FORMATS[name]())
    assert inst.starting_balance == pytest.approx(OPENING)


def test_explicit_opening_balance_wins():
    inst = FinancialIngestor.compile(FORMATS["hdfc_withdrawal_deposit_with_balance"](), starting_balance=1234.0)
    assert inst.starting_balance == pytest.approx(1234.0)


def test_unknown_opening_balance_is_warned_not_guessed():
    inst = FinancialIngestor.compile(FORMATS["signed_iso"]())
    assert inst.starting_balance == 0.0
    assert any("Opening balance unknown" in w for w in inst.raw_metadata["warnings"])


def test_excel_upload():
    inst = FinancialIngestor.compile(_excel_bytes())
    assert sum(inst.inflows[:3]) == pytest.approx(INCOME)
    assert sum(inst.total_outflows[:3]) == pytest.approx(SPEND)


def test_expenses_only_file_takes_monthly_income():
    expenses = _csv(["Date", "Expense Head", "Spent"],
                    [(d.isoformat(), c, f"{-a:.2f}") for d, _, c, a in TXNS if a < 0])
    inst = FinancialIngestor.compile(expenses)
    assert sum(inst.inflows) == 0
    assert any("No income found" in w for w in inst.raw_metadata["warnings"])
    inst = FinancialIngestor.compile(expenses, monthly_income=90000.0)
    assert inst.inflows == [90000.0] * 12


def test_long_history_uses_latest_twelve_months_and_carries_balance():
    rows = []
    for y, m in [(2023, mm) for mm in range(1, 13)] + [(2024, mm) for mm in range(1, 7)]:
        rows.append((date(y, m, 1).isoformat(), "Salary", "Salary", "1000.00"))
        rows.append((date(y, m, 2).isoformat(), "Rent", "Rent", "-400.00"))
    inst = FinancialIngestor.compile(_csv(["Date", "Description", "Category", "Amount"], rows), starting_balance=0.0)
    assert inst.months[0] == "2023-07" and inst.months[-1] == "2024-06"
    # 6 months before the window, each +600
    assert inst.starting_balance == pytest.approx(3600.0)


def test_header_only_detection():
    import pandas as pd

    det = detect_columns(pd.DataFrame(columns=["Date", "Narration", "Debit", "Credit", "Balance"]))
    m = det.mapping
    assert (m.date_col, m.debit_col, m.credit_col, m.balance_col) == ("Date", "Debit", "Credit", "Balance")


@pytest.mark.parametrize("raw, message", [
    (b"", "empty"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rest", ".xls"),
    (b"just one line of text without columns", "columns"),
])
def test_unreadable_files_raise_clear_errors(raw, message):
    with pytest.raises(UnreadableFileError, match=message):
        load_table(raw)


# ─── Units and currency ─────────────────────────────────────────────────────

def test_cell_units_are_expanded_and_dr_cr_still_works():
    import pandas as pd

    from data.normalize import parse_amount_series

    vals, drcr = parse_amount_series(pd.Series(["$1.2M", "USD 2.4mn", "₹2.4 lakh", "5 crore", "750k", "3.5bn", "1,500 Cr", "(0.8M)"]))
    assert vals.tolist() == [1_200_000, 2_400_000, 240_000, 50_000_000, 750_000, 3_500_000_000, 1_500, -800_000]
    assert drcr.tolist() == [0, 0, 0, 0, 0, 0, 1, 0]  # "Cr" is a credit marker, not crore


@pytest.mark.parametrize("header,mult", [
    ("Amount (USD, in millions)", 1e6), ("Revenue USD mn", 1e6), ("Amount ($m)", 1e6),
    ("Amount in lakhs", 1e5), ("Amount (₹ Cr)", 1e7), ("Balance (in Rs. crore)", 1e7),
    ("Value '000", 1e3), ("Amount (Cr)", 1.0), ("Credit", 1.0), ("Amount (INR)", 1.0),
])
def test_scale_from_header(header, mult):
    from data.normalize import detect_scale

    assert detect_scale(header)[0] == mult


USD_MN_PNL = """Date,Description,Amount (USD mn),Type
2024-04-05,Customer payments,0.30,inflow
2024-04-20,Payroll,0.12,outflow
2024-05-05,Customer payments,0.30,inflow
2024-05-20,Payroll,0.12,outflow
"""


def test_usd_millions_file_is_scaled_and_converted_to_rupees():
    inst = FinancialIngestor.compile(USD_MN_PNL.encode(), starting_balance=10_000_000, fx_rate=88.0)
    # 0.30 USD mn × 88 = ₹2,64,00,000 in; 0.12 USD mn × 88 = ₹1,05,60,000 out (observed months)
    assert inst.inflows[0] == pytest.approx(26_400_000)
    assert inst.outflow_matrix[0].sum() == pytest.approx(10_560_000)
    assert inst.starting_balance == 10_000_000  # entered in rupees, never converted
    summary = inst.raw_metadata
    assert summary["source_currency"] == "USD" and summary["currency"] == "INR" and summary["fx_rate"] == 88.0
    assert any("millions" in w for w in summary["warnings"])
    assert any("converted at ₹88.00 per USD" in w for w in summary["warnings"])


def test_foreign_currency_without_rate_is_used_as_is_with_a_warning():
    inst = FinancialIngestor.compile(USD_MN_PNL.encode(), starting_balance=0)
    assert inst.inflows[0] == pytest.approx(300_000)  # scaled, not converted
    assert inst.raw_metadata["currency"] == "USD"
    assert any("Re-upload with an exchange rate" in w for w in inst.raw_metadata["warnings"])
