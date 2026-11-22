"""
FutureFork tabular normalisation: turn "any" financial export into a clean DataFrame
and a ColumnMapping.

Handles CSV (any common delimiter) and Excel files, bank preamble lines above the
header, messy headers, currency symbols, Indian/European number formats, Dr/Cr
markers, parentheses negatives and day-first vs month-first dates.

Used by both POST /datasets/inspect (to propose a mapping) and the ingestor (to
compile the 12-month baseline), so both always see the same table.
"""

from __future__ import annotations

import csv
import io
import re
import warnings
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from engine.model import ColumnMapping

MAX_HEADER_SCAN = 40
DELIMITERS = [",", ";", "\t", "|"]


class UnreadableFileError(ValueError):
    """Raised when a file can't be turned into a table at all."""


# ---------------------------------------------------------------------------
# 1. Loading: bytes -> raw grid -> DataFrame with the real header row
# ---------------------------------------------------------------------------

def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _grid_from_text(text: str) -> List[List[str]]:
    lines = [ln for ln in text.splitlines()]
    best_rows: List[List[str]] = []
    best_score = -1
    for delim in DELIMITERS:
        rows = list(csv.reader(lines, delimiter=delim))
        widths = [len(r) for r in rows if any(c.strip() for c in r)]
        if not widths:
            continue
        mode_width, mode_count = Counter(widths).most_common(1)[0]
        if mode_width < 2:
            continue
        score = mode_count * mode_width
        if score > best_score:
            best_score, best_rows = score, rows
    if not best_rows:
        raise UnreadableFileError("Could not find columns in the file. Is it a CSV or Excel export?")
    return best_rows


def _grid_from_excel(raw: bytes) -> List[List[str]]:
    try:
        frames = pd.read_excel(io.BytesIO(raw), sheet_name=None, header=None, dtype=object)
    except ImportError as exc:  # pragma: no cover - depends on optional engine
        raise UnreadableFileError("Excel support is not installed on the server.") from exc
    except Exception as exc:
        raise UnreadableFileError(f"Could not read the Excel file: {exc}") from exc
    # Use the sheet with the most filled cells
    sheet = max(frames.values(), key=lambda f: int(f.notna().sum().sum()))

    def cell(v: object) -> str:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return ""
        if isinstance(v, pd.Timestamp) or hasattr(v, "strftime"):
            return v.strftime("%Y-%m-%d")  # type: ignore[union-attr]
        return str(v)

    return [[cell(v) for v in row] for row in sheet.itertuples(index=False)]


_HEADER_HINTS = re.compile(
    r"date|amount|debit|credit|withdrawal|deposit|balance|narration|description|particular|"
    r"details|remark|memo|category|type|value|spent|month|txn|transaction|head|item|bedrag|datum",
    re.IGNORECASE,
)


def _looks_numeric(s: str) -> bool:
    return bool(re.fullmatch(r"[\s₹$€£()+\-.,\d]*\d[\s₹$€£()+\-.,\d]*(?:\s*(?:dr|cr))?", s.strip(), re.IGNORECASE))


def _find_header_row(grid: List[List[str]]) -> int:
    widths = [len([c for c in r if c.strip()]) for r in grid[: MAX_HEADER_SCAN * 4]]
    target = Counter(w for w in widths if w >= 2).most_common(1)[0][0] if any(w >= 2 for w in widths) else 2
    best_idx, best_score = 0, -1.0
    for i, row in enumerate(grid[:MAX_HEADER_SCAN]):
        cells = [c.strip() for c in row if c.strip()]
        if len(cells) < max(2, target - 1):
            continue
        hints = sum(1 for c in cells if _HEADER_HINTS.search(c))
        textual = sum(1 for c in cells if not _looks_numeric(c))
        score = hints * 3 + textual - (0 if textual >= len(cells) * 0.6 else 10)
        if score > best_score:
            best_idx, best_score = i, score
        if hints >= 2 and textual == len(cells):
            return i
    return best_idx


def _unique_headers(raw: List[str]) -> List[str]:
    out: List[str] = []
    seen: Dict[str, int] = {}
    for i, h in enumerate(raw):
        name = re.sub(r"\s+", " ", str(h)).strip() or f"Column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        out.append(name)
    return out


@dataclass
class LoadedTable:
    df: pd.DataFrame
    skipped_preamble_rows: int = 0
    source_format: str = "csv"


def load_table(raw: bytes, filename: str = "") -> LoadedTable:
    """Reads CSV/TSV/Excel bytes into a DataFrame of strings using the detected header row."""
    if not raw or not raw.strip():
        raise UnreadableFileError("The file is empty.")

    if raw[:4] == b"PK\x03\x04":
        grid, fmt = _grid_from_excel(raw), "xlsx"
    elif raw[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        raise UnreadableFileError("Old .xls files aren't supported. Save the sheet as .xlsx or .csv and upload again.")
    else:
        grid, fmt = _grid_from_text(_decode(raw)), "csv"

    h = _find_header_row(grid)
    headers = _unique_headers(grid[h])
    width = len(headers)
    body = []
    for row in grid[h + 1:]:
        row = (list(row) + [""] * width)[:width]
        if any(str(c).strip() for c in row):
            body.append([str(c).strip() for c in row])
    df = pd.DataFrame(body, columns=headers, dtype=object)
    # Drop columns that are completely empty
    keep = [c for c in df.columns if (df[c].astype(str).str.strip() != "").any()]
    df = df[keep] if keep else df
    if df.empty:
        raise UnreadableFileError("The file has a header row but no data rows.")
    return LoadedTable(df=df.reset_index(drop=True), skipped_preamble_rows=h, source_format=fmt)


# ---------------------------------------------------------------------------
# 2. Value parsing
# ---------------------------------------------------------------------------

_CURRENCY_RE = re.compile(r"(?i)(₹|rs\.?|inr|usd|us\$|\$|€|eur|£|gbp)")
_DRCR_RE = re.compile(r"(?i)\b(dr|cr)\.?\s*$|^\s*(dr|cr)\.?\b")
_EU_RE = re.compile(r"^-?\d{1,3}(\.\d{3})*,\d{1,2}$|^-?\d+,\d{1,2}$")
_US_RE = re.compile(r"^-?\d{1,3}(,\d{3})*\.\d{1,2}$|^-?\d+\.\d{1,2}$")


_CURRENCY_PATTERNS = [
    ("INR", re.compile(r"₹|\bRs\.?(?=\s*\d)|\bINR\b", re.IGNORECASE)),
    ("USD", re.compile(r"\$|\bUSD\b")),
    ("EUR", re.compile(r"€|\bEUR\b")),
    ("GBP", re.compile(r"£|\bGBP\b")),
]


def detect_currency(values: pd.Series, headers: Optional[List[str]] = None) -> Optional[str]:
    """Returns the currency code written in the amounts or headers, if any."""
    blob = " ".join(values.dropna().astype(str).head(300)) + " " + " ".join(headers or [])
    for code, pat in _CURRENCY_PATTERNS:
        if pat.search(blob):
            return code
    return None


# Scale written in a column header, e.g. "Revenue (USD mn)", "Amount in lakhs", "₹ Cr", "'000".
# Checked in this order; a bare "Cr" is not treated as crore because it usually means credit.
_SCALE_PATTERNS: List[Tuple[float, str, "re.Pattern[str]"]] = [
    (1e7, "crore", re.compile(r"(?i)\bcrores?\b|\bin\s+cr\.?\b|(?:₹|\brs\.?|\binr)\s*cr\.?\b")),
    (1e5, "lakh", re.compile(r"(?i)\blakhs?\b|\blacs?\b|\bin\s+l\b|(?:₹|\brs\.?|\binr)\s*l\b")),
    (1e9, "billion", re.compile(r"(?i)\bbillions?\b|\bbn\b|\bin\s+b\b|(?:\$|\busd)\s*b\b")),
    (1e6, "million", re.compile(r"(?i)\bmillions?\b|\bmn\b|\bmm\b|\bin\s+m\b|(?:\$|\busd|\beur|€|£|\bgbp)\s*m\b|\(\s*m\s*\)")),
    (1e3, "thousand", re.compile(r"(?i)\bthousands?\b|'000s?|\b000s\b|\(\s*000s?\s*\)|\bin\s+k\b|\(\s*k\s*\)|(?:\$|\busd)\s*k\b")),
]

# Unit written in a cell, e.g. "1.2M", "3.5bn", "2.4 lakh", "5 crore", "750k".
# A trailing "Cr"/"Dr" is a credit/debit marker and is handled separately.
_CELL_SUFFIX_RE = re.compile(
    r"(?i)^([\d.,]+)(thousands?|k|millions?|mn|mm|m|billions?|bn|b|lakhs?|lacs?|l|crores?)$"
)
_SUFFIX_MULT = {
    "k": 1e3, "thousand": 1e3, "thousands": 1e3,
    "m": 1e6, "mn": 1e6, "mm": 1e6, "million": 1e6, "millions": 1e6,
    "b": 1e9, "bn": 1e9, "billion": 1e9, "billions": 1e9,
    "l": 1e5, "lac": 1e5, "lacs": 1e5, "lakh": 1e5, "lakhs": 1e5,
    "crore": 1e7, "crores": 1e7,
}


def detect_scale(header: Optional[str]) -> Tuple[float, Optional[str]]:
    """(multiplier, unit name) written in a column header; (1.0, None) when there is none."""
    text = str(header or "")
    for mult, name, pat in _SCALE_PATTERNS:
        if pat.search(text):
            return mult, name
    return 1.0, None


def cell_suffix_share(series: pd.Series) -> float:
    """Share of non-empty cells that carry their own unit (1.2M, 3 lakh, ...)."""
    s = series.dropna().astype(str).str.replace(_CURRENCY_RE, "", regex=True).str.replace(r"\s+", "", regex=True)
    s = s.str.strip("()+-")
    s = s[s != ""]
    if s.empty:
        return 0.0
    return float(s.str.match(_CELL_SUFFIX_RE).mean())


def parse_amount_series(series: pd.Series, scale: float = 1.0) -> Tuple[pd.Series, pd.Series]:
    """
    Parses an amount column into floats.

    Returns (values, drcr_sign): values keep the sign written in the cell (parentheses,
    minus signs), and drcr_sign is -1 for a "Dr" marker, +1 for "Cr", 0 when absent.
    Units written in a cell (1.2M, 3 lakh, 5 crore, 750k) are applied, then the whole
    column is multiplied by `scale` (from its header, e.g. "USD mn"). Unparseable cells become NaN.
    """
    s = series.astype(str).str.strip()
    s = s.where(~s.str.fullmatch(r"(?i)(nan|none|null|-|—|–|)"), "")

    marker = s.str.extract(_DRCR_RE)
    m = marker[0].fillna(marker[1]).fillna("").str.lower()
    drcr_sign = pd.Series(np.where(m == "dr", -1, np.where(m == "cr", 1, 0)), index=series.index)
    s = s.str.replace(_DRCR_RE, "", regex=True)

    s = s.str.replace(_CURRENCY_RE, "", regex=True).str.replace(r"\s+", "", regex=True)
    neg = s.str.match(r"^\(.*\)$") | s.str.endswith("-") | s.str.startswith("-")
    s = s.str.strip("()+-")

    # Per-cell units: keep the number, remember its multiplier
    suffix = s.str.extract(_CELL_SUFFIX_RE)
    has_unit = suffix[0].notna()
    cell_mult = suffix[1].str.lower().map(_SUFFIX_MULT).where(has_unit, 1.0).astype(float)
    s = s.where(~has_unit, suffix[0])

    nonempty = s[s != ""]
    eu_votes = nonempty.str.match(_EU_RE).sum()
    us_votes = nonempty.str.match(_US_RE).sum()
    if eu_votes > us_votes:
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        s = s.str.replace(",", "", regex=False)

    values = pd.to_numeric(s, errors="coerce") * cell_mult * float(scale or 1.0)
    values = values.where(~neg, -values)
    return values.astype(float), drcr_sign


def numeric_ratio(series: pd.Series) -> float:
    s = series.astype(str).str.strip()
    nonempty = s[s != ""]
    if nonempty.empty:
        return 0.0
    vals, _ = parse_amount_series(nonempty)
    return float(vals.notna().mean())


_ISO_RE = re.compile(r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}")
_NUMERIC_DATE_RE = re.compile(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})")


def parse_date_series(series: pd.Series, date_format: Optional[str] = None) -> pd.Series:
    """Parses dates, deciding day-first vs month-first from the column's own values."""
    s = series.astype(str).str.strip()
    if date_format:
        parsed = pd.to_datetime(s, format=date_format, errors="coerce")
        if parsed.notna().mean() > 0.5:
            return parsed

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if s.str.match(_ISO_RE).mean() > 0.8:
            return pd.to_datetime(s.str[:10].str.replace(r"[/.]", "-", regex=True), errors="coerce", format="%Y-%m-%d")

        parts = s.str.extract(_NUMERIC_DATE_RE)
        dayfirst = True
        if parts.notna().all(axis=1).mean() > 0.5:
            a = pd.to_numeric(parts[0], errors="coerce")
            b = pd.to_numeric(parts[1], errors="coerce")
            if (b > 12).sum() > (a > 12).sum():
                dayfirst = False
            s = s.str.replace(r"^(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})", r"\1/\2/\3", regex=True)
        return pd.to_datetime(s, format="mixed", dayfirst=dayfirst, errors="coerce")


_DATE_SHAPE_RE = re.compile(
    r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|"
    r"^\d{1,2}[\s-]?[A-Za-z]{3,9}[\s,-]*\d{2,4}|^[A-Za-z]{3,9}[\s,-]*(?:\d{1,2},?[\s-]*)?\d{4}|^\d{4}-\d{2}$"
)


def date_ratio(series: pd.Series) -> float:
    """Share of non-empty cells that look like AND parse as dates."""
    s = series.astype(str).str.strip()
    nonempty = s[s != ""]
    if nonempty.empty or nonempty.str.match(_DATE_SHAPE_RE).mean() < 0.5:
        return 0.0
    return float(parse_date_series(nonempty).notna().mean())


# ---------------------------------------------------------------------------
# 3. Column detection
# ---------------------------------------------------------------------------

def _tokens(header: str) -> List[str]:
    return re.findall(r"[a-z]+", header.lower())


def _compact(header: str) -> str:
    return re.sub(r"[^a-z]", "", header.lower())


DATE_WORDS = {"date", "dt", "posting", "posted", "month", "period", "datum", "day", "timestamp", "time"}
DEBIT_WORDS = {"debit", "debits", "withdrawal", "withdrawals", "dr", "spent", "spend", "expense", "expenses",
               "outflow", "outflows", "outgoing", "payment", "payments", "paid", "out"}
CREDIT_WORDS = {"credit", "credits", "deposit", "deposits", "cr", "received", "receipt", "receipts", "income",
                "inflow", "inflows", "incoming", "in"}
AMOUNT_WORDS = {"amount", "amt", "value", "sum", "net", "bedrag", "betrag", "montant", "importe", "inr", "rs",
                "total", "money"}
BALANCE_WORDS = {"balance", "bal", "closing", "running", "available"}
CATEGORY_WORDS = {"category", "categories", "head", "classification", "class", "group", "bucket", "tag", "label",
                  "item", "line"}
DESC_WORDS = {"description", "narration", "particulars", "details", "detail", "remarks", "remark", "memo",
              "note", "notes", "payee", "merchant", "omschrijving", "info", "beschreibung", "libelle"}
NOT_AMOUNT_WORDS = {"ref", "reference", "chq", "cheque", "check", "no", "number", "id", "utr", "account", "acc",
                    "sr", "serial", "sl", "code", "voucher", "qty", "quantity", "rate"}
FLAG_HEADERS = {"type", "txntype", "transactiontype", "drcr", "crdr", "debitcredit", "creditdebit", "dc", "cd",
                "flag", "nature", "direction", "inout", "entrytype", "kind"}
FLAG_VALUES_IN = {"cr", "credit", "deposit", "income", "inflow", "in", "receipt", "received", "c", "revenue", "+"}
FLAG_VALUES_OUT = {"dr", "debit", "withdrawal", "expense", "outflow", "out", "payment", "paid", "d", "expenditure",
                   "spend", "-"}


def flag_direction(value: str) -> int:
    v = re.sub(r"[^a-z+\-]", "", str(value).lower())
    if v in FLAG_VALUES_IN:
        return 1
    if v in FLAG_VALUES_OUT:
        return -1
    return 0


def _is_flag_column(series: pd.Series) -> bool:
    vals = series.astype(str).str.strip()
    vals = vals[vals != ""]
    if vals.empty:
        return False
    dirs = vals.map(flag_direction)
    return bool((dirs != 0).mean() > 0.9 and (dirs == 1).any() and (dirs == -1).any())


@dataclass
class Detection:
    mapping: ColumnMapping
    confidence: float
    notes: List[str] = field(default_factory=list)


def detect_columns(df: pd.DataFrame) -> Detection:
    """Proposes a ColumnMapping from headers AND values."""
    cols = list(df.columns)
    toks = {c: set(_tokens(c)) for c in cols}
    has_rows = len(df) > 0
    # With no sample rows, judge by header names alone (values are "unknown", not "absent")
    num = {c: numeric_ratio(df[c]) if has_rows else 1.0 for c in cols}
    used: set = set()

    def best(cands: List[str], key) -> Optional[str]:
        cands = [c for c in cands if c not in used]
        return max(cands, key=key) if cands else None

    # Date: header word + parses as dates; otherwise the column that parses best
    dr = {c: date_ratio(df[c]) if has_rows else (1.0 if toks[c] & DATE_WORDS else 0.0) for c in cols}
    date_col = best([c for c in cols if toks[c] & DATE_WORDS and dr[c] >= 0.5],
                    key=lambda c: (dr[c], "value" not in toks[c]))
    if not date_col:
        date_col = best([c for c in cols if dr[c] >= 0.6], key=lambda c: dr[c])
    if date_col:
        used.add(date_col)

    # Flag / type column (Dr/Cr, Income/Expense, ...)
    if has_rows:
        type_col = best([c for c in cols if _is_flag_column(df[c]) and (_compact(c) in FLAG_HEADERS or num[c] < 0.2)],
                        key=lambda c: _compact(c) in FLAG_HEADERS)
    else:
        type_col = best([c for c in cols if _compact(c) in FLAG_HEADERS], key=lambda c: 0)
    if type_col:
        used.add(type_col)

    balance_col = best([c for c in cols if toks[c] & BALANCE_WORDS and num[c] >= 0.5], key=lambda c: num[c])
    if balance_col:
        used.add(balance_col)

    def amountish(c: str) -> bool:
        return num[c] >= 0.3 and not (toks[c] & NOT_AMOUNT_WORDS) and c not in used

    both = {c for c in cols if toks[c] & DEBIT_WORDS and toks[c] & CREDIT_WORDS}
    debit_cands = [c for c in cols if toks[c] & DEBIT_WORDS and c not in both and amountish(c)]
    credit_cands = [c for c in cols if toks[c] & CREDIT_WORDS and c not in both and amountish(c)]
    debit_col = debit_cands[0] if debit_cands else None
    credit_col = credit_cands[0] if credit_cands else None

    amount_col = None
    if not (debit_col and credit_col):
        cands = [c for c in cols if toks[c] & AMOUNT_WORDS and amountish(c)]
        cands += [c for c in [debit_col, credit_col] if c]  # a lone "Spent" column acts as the amount
        amount_col = cands[0] if cands else None
        if not amount_col:
            amount_col = best([c for c in cols if amountish(c) and num[c] >= 0.8], key=lambda c: num[c])
        debit_col = credit_col = None
    for c in (debit_col, credit_col, amount_col):
        if c:
            used.add(c)

    textual = {c: (num[c] < 0.5) if has_rows else not (toks[c] & (AMOUNT_WORDS | DEBIT_WORDS | CREDIT_WORDS | BALANCE_WORDS))
               for c in cols}
    category_col = best([c for c in cols if toks[c] & CATEGORY_WORDS and textual[c]],
                        key=lambda c: -df[c].nunique())
    if category_col:
        used.add(category_col)
    description_col = best([c for c in cols if toks[c] & DESC_WORDS and textual[c]], key=lambda c: df[c].nunique())
    if not description_col and has_rows:
        description_col = best([c for c in cols if num[c] < 0.3 and dr[c] < 0.3], key=lambda c: df[c].nunique())

    notes: List[str] = []
    if not date_col:
        notes.append("No date column found.")
    if not (amount_col or debit_col or credit_col):
        notes.append("No amount, debit or credit column found.")

    confidence = 0.4
    if date_col:
        confidence += 0.25
    if amount_col or (debit_col and credit_col):
        confidence += 0.25
    if category_col or description_col:
        confidence += 0.1

    mapping = ColumnMapping(
        date_col=date_col or (cols[0] if cols else "Date"),
        amount_col=amount_col,
        debit_col=debit_col,
        credit_col=credit_col,
        category_col=category_col,
        description_col=description_col,
        type_col=type_col,
        balance_col=balance_col,
        date_format=None,
        starting_balance=0.0,
    )
    return Detection(mapping=mapping, confidence=round(min(confidence, 0.99), 2), notes=notes)


# ---------------------------------------------------------------------------
# 4. Dataset type
# ---------------------------------------------------------------------------

_TYPE_KEYWORDS = {
    "personal": r"salary|upi|swiggy|zomato|grocer|bigbasket|zepto|blinkit|netflix|spotify|sip\b|atm|flipkart|"
                r"amazon pay|rent to|landlord|ola|uber|petrol|emi\b|credit card",
    "institute": r"tuition|\bfees?\b|grant|department|faculty|hostel|campus|ugc|aicte|voucher|account head|"
                 r"student|library|laborator|convocation",
    "startup": r"revenue|\bmrr\b|\barr\b|payroll|investor|funding|saas|aws|cloud|customer|invoice|vendor|"
               r"burn|marketing|stripe|razorpay|gst",
}


def detect_dataset_type(df: pd.DataFrame, mapping: ColumnMapping) -> str:
    text_cols = [c for c in (mapping.category_col, mapping.description_col, mapping.type_col) if c and c in df]
    blob = " ".join(df[c].astype(str).str.lower().head(500).str.cat(sep=" ") for c in text_cols)
    blob += " " + " ".join(str(c).lower() for c in df.columns)
    scores = {k: len(re.findall(p, blob)) for k, p in _TYPE_KEYWORDS.items()}
    best_type = max(scores, key=scores.get)
    return best_type if scores[best_type] > 0 else "personal"
