"""
FutureFork: Financial Data Ingestion & Baseline Compiler
Member 1: Data Ingestion & Baseline Compiler

Fast, defensive Pandas-based compiler that converts raw financial CSV bytes +
a ColumnMapping into a validated FinancialProblemInstance:
- 12 months x 8 canonical expense categories outflow matrix
- 12-element monthly inflow vector
- Deterministic auto-tagging (fixed vs. flexible)
- Node 0 statistical parameters (mean mu, historical std sigma)
- Vectorized execution target: < 200ms per CSV
"""

from __future__ import annotations

import copy
import io
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

# Ensure repository root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.normalize import (
    UnreadableFileError,
    cell_suffix_share,
    detect_columns,
    detect_currency,
    detect_scale,
    flag_direction,
    load_table,
    parse_amount_series,
)
from data.normalize import parse_date_series as _normalize_parse_dates

# Check if engine.model provides schema definitions; otherwise fallback to internal classes
try:
    from engine.model import ColumnMapping as _EngineColumnMapping
    from engine.model import FinancialProblemInstance as _EngineFinancialProblemInstance
except (ImportError, AttributeError):
    _EngineColumnMapping = None
    _EngineFinancialProblemInstance = None


# Canonical 8 fallback categories if fewer than 8 categories exist
DEFAULT_CANONICAL_CATEGORIES = [
    "Salaries & Payroll",
    "Rent & Infrastructure",
    "Utilities & Bills",
    "Consumables & Supplies",
    "Travel & Transport",
    "Software & Subscriptions",
    "Marketing & Growth",
    "Miscellaneous & Other",
]

# Rule-based auto-tagging keyword sets
FIXED_KEYWORDS = {
    "rent", "lease", "salary", "salaries", "payroll", "stipend", "honorarium",
    "emi", "loan", "utilities", "utility", "electricity", "broadband", "internet",
    "water", "insurance", "tuition", "compliance", "legal", "audit", "cloud",
    "aws", "gcp", "azure", "server", "license", "licenses", "subscription",
    "subscriptions", "software", "maintenance", "fixed", "amc", "retainer",
}

FLEXIBLE_KEYWORDS = {
    "travel", "food", "dining", "restaurant", "swiggy", "zomato", "cab", "uber",
    "ola", "event", "events", "fest", "fests", "marketing", "ads", "advertising",
    "campaign", "shopping", "entertainment", "discretionary", "misc",
    "miscellaneous", "consumables", "other", "flexible", "freelance", "perks",
    "bonus", "conference", "hospitality", "supplies", "hardware", "refreshment",
}


@dataclass
class ColumnMapping:
    """Specifies the column header mappings for parsing financial CSV files."""
    date_col: str = "Date"
    amount_col: Optional[str] = None
    debit_col: Optional[str] = None
    credit_col: Optional[str] = None
    category_col: Optional[str] = None
    description_col: Optional[str] = None
    type_col: Optional[str] = None
    date_format: Optional[str] = None
    starting_balance: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ColumnMapping":
        """Instantiate ColumnMapping from dictionary with flexible aliases."""
        if not data:
            return cls()

        date_col = (
            data.get("date_col") or data.get("date") or data.get("Date") or "Date"
        )
        amount_col = data.get("amount_col") or data.get("amount") or data.get("Amount")
        debit_col = (
            data.get("debit_col") or data.get("debit") or data.get("Debit") or
            data.get("withdrawal") or data.get("Withdrawal") or data.get("expense")
        )
        credit_col = (
            data.get("credit_col") or data.get("credit") or data.get("Credit") or
            data.get("deposit") or data.get("Deposit") or data.get("inflow")
        )
        category_col = (
            data.get("category_col") or data.get("category") or data.get("Category") or
            data.get("head") or data.get("Account_Head") or data.get("account_head")
        )
        description_col = (
            data.get("description_col") or data.get("description") or data.get("Description") or
            data.get("narration") or data.get("Narration") or data.get("particulars")
        )
        type_col = (
            data.get("type_col") or data.get("type") or data.get("Type") or
            data.get("transaction_type") or data.get("Txn Type")
        )
        date_format = data.get("date_format") or data.get("format")
        starting_balance = float(data.get("starting_balance") or 0.0)

        return cls(
            date_col=str(date_col).strip(),
            amount_col=str(amount_col).strip() if amount_col else None,
            debit_col=str(debit_col).strip() if debit_col else None,
            credit_col=str(credit_col).strip() if credit_col else None,
            category_col=str(category_col).strip() if category_col else None,
            description_col=str(description_col).strip() if description_col else None,
            type_col=str(type_col).strip() if type_col else None,
            date_format=str(date_format).strip() if date_format else None,
            starting_balance=starting_balance,
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FinancialProblemInstance:
    """
    Standardized Node 0 Baseline Financial Model consumed by optimization (Member 2),
    Monte Carlo simulation (Member 3), and AI explainer (Member 4).
    """
    dataset_id: str
    name: str
    months: List[str]                            # 12 monthly periods e.g. ["2024-04", ...]
    categories: List[str]                        # Exactly 8 canonical expense categories
    category_types: Dict[str, str]               # category_name -> "fixed" | "flexible"
    outflows: List[List[float]]                  # 12 x 8 matrix of monthly outflows (>= 0.0)
    inflows: List[float]                         # 12-element vector of monthly inflows (>= 0.0)
    starting_balance: float                      # Starting treasury / bank balance
    category_means: Dict[str, float]             # mean (mu) per category (len 8)
    category_stds: Dict[str, float]              # standard deviation (sigma) per category (len 8)
    total_outflows: List[float]                  # monthly sum of outflows across categories (len 12)
    net_cash_flows: List[float]                  # monthly inflow - total_outflow (len 12)
    cash_balances: List[float]                   # cumulative cash balance at end of each month (len 12)
    summary: Dict[str, Any]                      # High-level aggregate statistics
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def outflow_matrix(self) -> np.ndarray:
        """Returns the (12, 8) outflow matrix as a float64 numpy array."""
        return np.array(self.outflows, dtype=np.float64)

    @property
    def inflow_vector(self) -> np.ndarray:
        """Returns the (12,) inflow vector as a float64 numpy array."""
        return np.array(self.inflows, dtype=np.float64)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize instance to a pure Python dictionary (JSON serializable)."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FinancialProblemInstance":
        """Reconstruct instance from serialized dictionary."""
        return cls(
            dataset_id=str(data["dataset_id"]),
            name=str(data["name"]),
            months=list(data["months"]),
            categories=list(data["categories"]),
            category_types=dict(data["category_types"]),
            outflows=[[float(x) for x in row] for row in data["outflows"]],
            inflows=[float(x) for x in data["inflows"]],
            starting_balance=float(data["starting_balance"]),
            category_means={k: float(v) for k, v in data["category_means"].items()},
            category_stds={k: float(v) for k, v in data["category_stds"].items()},
            total_outflows=[float(x) for x in data["total_outflows"]],
            net_cash_flows=[float(x) for x in data["net_cash_flows"]],
            cash_balances=[float(x) for x in data["cash_balances"]],
            summary=dict(data["summary"]),
            raw_metadata=dict(data.get("raw_metadata", {})),
        )


# Alias to canonical engine.model definitions when available
if _EngineColumnMapping is not None:
    ColumnMapping = _EngineColumnMapping
if _EngineFinancialProblemInstance is not None:
    FinancialProblemInstance = _EngineFinancialProblemInstance


def clean_currency_series(series: pd.Series) -> pd.Series:
    """
    Vectorized currency cleaner.
    Strips '₹', 'INR', 'Rs.', '$', commas, handles accounting parentheses (e.g. '(1,250.00)' -> '-1250.00'),
    and converts to float64 with NaN filled to 0.0.
    """
    if series is None or series.empty:
        return pd.Series(dtype=np.float64)

    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0.0).astype(np.float64)

    s = series.astype(str).str.strip()
    # Replace blanks, 'nan', 'None', '-'
    s = s.replace(r"^(nan|NaN|None|-|\s*)$", "0", regex=True)
    # Accounting parentheses negative format: (1,234.50) -> -1234.50
    s = s.str.replace(r"^\s*\((.*)\)\s*$", r"-\1", regex=True)
    # Strip word currency prefixes: Rs., Rs, INR, inr
    s = s.str.replace(r"(?i)\b(inr|rs)\.?\s*", "", regex=True)
    # Strip currency symbols, commas, and remaining spaces: ₹, $, commas, spaces
    s = s.str.replace(r"[₹$,\s]", "", regex=True)
    # Convert to numeric, errors to NaN, fillna with 0.0
    return pd.to_numeric(s, errors="coerce").fillna(0.0).astype(np.float64)


def parse_date_series(series: pd.Series, date_format: Optional[str] = None) -> pd.Series:
    """Backward-compatible wrapper around data.normalize.parse_date_series."""
    return _normalize_parse_dates(series, date_format)


def auto_detect_columns(df: pd.DataFrame) -> ColumnMapping:
    """Backward-compatible wrapper around data.normalize.detect_columns."""
    return detect_columns(df).mapping


def tag_category(category_name: str, monthly_values: Optional[np.ndarray] = None) -> str:
    """
    Deterministically tag an expense category as 'fixed' or 'flexible'.
    Uses rule-based keyword matching first, followed by variance heuristic (CV < 0.20 -> fixed).
    """
    cat_lower = str(category_name).lower().strip()
    words = re.findall(r"[a-z]+", cat_lower)

    # 1. Check fixed keywords
    if any(w in FIXED_KEYWORDS for w in words):
        return "fixed"

    # 2. Check flexible keywords
    if any(w in FLEXIBLE_KEYWORDS for w in words):
        return "flexible"

    # 3. Variance heuristic: if coefficient of variation (sigma / mu) < 0.20, classify as fixed
    if monthly_values is not None and len(monthly_values) > 0:
        mu = float(np.mean(monthly_values))
        sigma = float(np.std(monthly_values, ddof=1)) if len(monthly_values) > 1 else 0.0
        if mu > 0 and (sigma / mu) < 0.20:
            return "fixed"

    return "flexible"


_INCOME_HINT_RE = re.compile(
    r"\b(?:salary|sal\b|income|revenue|refund|interest|dividend|cashback|credited|deposit|received|receipt|"
    r"fees?\s+(?:received|collected)|grant|mrr|sales|payout|reimburse|bonus\s+credit)",
    re.IGNORECASE,
)

MAX_CATEGORIES = 8


class FinancialIngestor:
    """
    Compiles any supported financial export (CSV/TSV/Excel) into a validated
    12-month FinancialProblemInstance (Node 0 baseline).

    - Uses the most recent 12 months when more history is available.
    - Projects shorter histories forward from the observed monthly averages.
    - Infers the opening balance from a running-balance column when one exists.
    - Records human-readable warnings in raw_metadata["warnings"].
    """

    @staticmethod
    def _to_bytes(src: Union[bytes, str, Path, io.BytesIO, io.StringIO]) -> bytes:
        if isinstance(src, (str, Path)) and len(str(src)) < 1024 and Path(str(src)).is_file():
            return Path(str(src)).read_bytes()
        if isinstance(src, bytes):
            return src
        if isinstance(src, (io.BytesIO, io.BufferedReader)):
            return src.read()
        if isinstance(src, io.StringIO):
            return src.getvalue().encode("utf-8")
        if isinstance(src, str):
            return src.encode("utf-8")
        raise ValueError(f"Unsupported source type: {type(src)}")

    @classmethod
    def read_csv(cls, csv_source: Union[bytes, str, Path, io.BytesIO, io.StringIO]) -> pd.DataFrame:
        """Backward-compatible: returns the normalised table (empty DataFrame if unreadable)."""
        try:
            return load_table(cls._to_bytes(csv_source)).df
        except UnreadableFileError:
            return pd.DataFrame()

    @staticmethod
    def _signed_flows(df: pd.DataFrame, m: ColumnMapping) -> Tuple[pd.Series, pd.Series, List[str]]:
        """Returns (inflow, outflow, notes) as non-negative floats per row."""
        notes: List[str] = []
        zeros = pd.Series(0.0, index=df.index)

        if m.debit_col in df and m.credit_col in df:
            out, _ = parse_amount_series(df[m.debit_col], detect_scale(m.debit_col)[0])
            inn, _ = parse_amount_series(df[m.credit_col], detect_scale(m.credit_col)[0])
            return inn.abs().fillna(0.0), out.abs().fillna(0.0), notes

        amount_col = m.amount_col if m.amount_col in df else (m.debit_col if m.debit_col in df else m.credit_col)
        if amount_col not in df:
            raise ValueError("No amount, debit or credit column could be found in the file.")
        vals, drcr = parse_amount_series(df[amount_col], detect_scale(amount_col)[0])
        vals = vals.fillna(0.0)

        if m.debit_col in df and amount_col == m.debit_col:
            return zeros, vals.abs(), notes
        if m.credit_col in df and amount_col == m.credit_col:
            return vals.abs(), zeros, notes

        if m.type_col and m.type_col in df:
            dirs = df[m.type_col].map(flag_direction)
            signed = np.where(dirs == 1, vals.abs(), np.where(dirs == -1, -vals.abs(), vals))
            signed = pd.Series(signed, index=df.index)
        elif (drcr != 0).any():
            signed = pd.Series(np.where(drcr != 0, drcr * vals.abs(), vals), index=df.index)
        elif (vals < 0).any():
            signed = vals
        else:
            text_cols = [c for c in (m.category_col, m.description_col) if c and c in df]
            if text_cols:
                text = df[text_cols].astype(str).agg(" ".join, axis=1)
                is_income = text.str.contains(_INCOME_HINT_RE)
            else:
                is_income = pd.Series(False, index=df.index)
            signed = pd.Series(np.where(is_income, vals.abs(), -vals.abs()), index=df.index)
            if is_income.any():
                notes.append(
                    "All amounts were positive, so rows mentioning salary, income, revenue, refunds or "
                    "interest were treated as income and the rest as spending."
                )
            else:
                notes.append("All amounts were positive and none looked like income, so every row was treated as spending.")
        return signed.clip(lower=0.0), (-signed).clip(lower=0.0), notes

    @classmethod
    def compile(
        cls,
        csv_source: Union[bytes, str, Path, io.BytesIO, io.StringIO],
        mapping: Optional[Union[ColumnMapping, Dict[str, Any]]] = None,
        dataset_id: str = "dataset_node0",
        name: str = "Financial Dataset",
        starting_balance: Optional[float] = None,
        monthly_income: Optional[float] = None,
        fx_rate: Optional[float] = None,
    ) -> FinancialProblemInstance:
        """Compile a financial export into a 12-month FinancialProblemInstance.

        Amounts are scaled by any unit in their header or cells (USD mn, lakhs, 1.2M, ...).
        If they are in a foreign currency, `fx_rate` (rupees per unit) converts them to ₹;
        `starting_balance` and `monthly_income` are always rupees.
        """
        try:
            table = load_table(cls._to_bytes(csv_source))
        except UnreadableFileError as exc:
            raise ValueError(str(exc)) from exc
        df = table.df.copy()
        warnings_: List[str] = []
        if table.skipped_preamble_rows:
            warnings_.append(f"Skipped {table.skipped_preamble_rows} line(s) above the header row.")

        # --- Column mapping (fill any missing role from detection) -----------
        detected = detect_columns(df)
        if mapping is None:
            col_map = copy.deepcopy(detected.mapping)
        elif isinstance(mapping, dict):
            col_map = ColumnMapping.from_dict(mapping)
        else:
            col_map = copy.deepcopy(mapping)
        if col_map.date_col not in df:
            col_map.date_col = detected.mapping.date_col
        if not any(c and c in df for c in (col_map.amount_col, col_map.debit_col, col_map.credit_col)):
            for attr in ("amount_col", "debit_col", "credit_col", "type_col"):
                setattr(col_map, attr, getattr(detected.mapping, attr))
        if starting_balance is not None:
            col_map.starting_balance = float(starting_balance)
        if col_map.date_col not in df:
            raise ValueError("No date column could be found in the file.")

        # --- Dates -----------------------------------------------------------
        dates = parse_date_series(df[col_map.date_col], col_map.date_format)
        valid = dates.notna()
        if not valid.any():
            raise ValueError(f"None of the values in column '{col_map.date_col}' could be read as dates.")
        if (~valid).sum():
            warnings_.append(f"Ignored {int((~valid).sum())} row(s) without a readable date (for example totals or notes).")
        df = df[valid].copy()
        df["_date"] = dates[valid]

        # --- Money in / out --------------------------------------------------
        inflow, outflow, notes = cls._signed_flows(df, col_map)
        warnings_ += notes

        money_cols = [c for c in (col_map.amount_col, col_map.debit_col, col_map.credit_col) if c and c in df]
        for c in dict.fromkeys(money_cols):
            mult, unit = detect_scale(c)
            if unit:
                warnings_.append(f"Column '{c}' is in {unit}s, so its amounts were multiplied by {mult:,.0f}.")
        if money_cols and cell_suffix_share(df[money_cols].stack()) > 0:
            warnings_.append("Amounts written with units (like 1.2M or 3 lakh) were expanded to full numbers.")

        currency = detect_currency(df[money_cols].stack() if money_cols else pd.Series(dtype=str), list(table.df.columns))
        fx = float(fx_rate) if fx_rate else None
        if currency and currency != "INR":
            if fx and fx > 0:
                inflow, outflow = inflow * fx, outflow * fx
                warnings_.append(f"Amounts were in {currency} and were converted at ₹{fx:,.2f} per {currency}.")
            else:
                fx = None
                warnings_.append(
                    f"Amounts look like {currency}; they are shown with ₹ but the numbers are used as-is. "
                    "Re-upload with an exchange rate to convert them."
                )
        else:
            fx = None
        df["_in"], df["_out"] = inflow.values, outflow.values

        # Chronological order (bank exports are often newest-first)
        if df["_date"].iloc[0] > df["_date"].iloc[-1]:
            df = df.iloc[::-1]
        df = df.sort_values("_date", kind="mergesort").reset_index(drop=True)

        # --- Opening balance -------------------------------------------------
        opening: Optional[float] = None
        if starting_balance is not None:
            opening = float(starting_balance)
        elif col_map.balance_col and col_map.balance_col in df:
            bal, _ = parse_amount_series(df[col_map.balance_col], detect_scale(col_map.balance_col)[0])
            if fx:
                bal = bal * fx
            idx = bal.first_valid_index()
            if idx is not None:
                opening = float(bal[idx] - (df.at[idx, "_in"] - df.at[idx, "_out"]))
                # Rows before the first readable balance happened before it
                opening -= float((df.loc[: idx - 1, "_in"] - df.loc[: idx - 1, "_out"]).sum()) if idx > 0 else 0.0
                warnings_.append(f"Opening balance of {opening:,.0f} inferred from the '{col_map.balance_col}' column.")
        elif col_map.starting_balance:
            opening = float(col_map.starting_balance)
        if opening is None:
            opening = 0.0
            warnings_.append(
                "Opening balance unknown, so it was assumed to be 0. Enter your current balance for accurate results."
            )

        # --- 12-month window -------------------------------------------------
        periods = df["_date"].dt.to_period("M")
        first_p, last_p = periods.min(), periods.max()
        span = (last_p - first_p).n + 1
        if span >= 12:
            window_start = last_p - 11
            observed = 12
            before = periods < window_start
            opening += float((df.loc[before, "_in"] - df.loc[before, "_out"]).sum())
            df, periods = df[~before], periods[~before]
        else:
            window_start = first_p
            observed = span
        window = pd.period_range(start=window_start, periods=12, freq="M")
        months = [str(p) for p in window]
        df = df.copy()
        df["_m"] = [(p - window_start).n for p in periods]
        projected = list(range(observed, 12))
        if projected:
            warnings_.append(
                f"Only {observed} month(s) of data found; months {months[observed]} to {months[-1]} are "
                f"projected from your average monthly income and spending."
            )

        # --- Categories ------------------------------------------------------
        if col_map.category_col and col_map.category_col in df:
            cats = df[col_map.category_col].astype(str).str.strip()
        elif col_map.description_col and col_map.description_col in df:
            cats = df[col_map.description_col].astype(str).map(cls._infer_category_from_desc)
        else:
            cats = pd.Series("General Spending", index=df.index)
        df["_cat"] = cats.replace(r"^(nan|None|null|)$", "Uncategorized", regex=True).values

        spend = df[df["_out"] > 0]
        totals = spend.groupby("_cat")["_out"].sum().sort_values(ascending=False)
        if len(totals) > MAX_CATEGORIES:
            keep = list(totals.index[: MAX_CATEGORIES - 1])
            df["_cat"] = df["_cat"].where(df["_cat"].isin(keep), "Other / Discretionary")
            categories = keep + ["Other / Discretionary"]
        else:
            categories = list(totals.index) or ["General Spending"]

        # --- Matrices (observed months, then projection) ---------------------
        out_obs = (
            df[df["_out"] > 0].pivot_table(index="_m", columns="_cat", values="_out", aggfunc="sum", fill_value=0.0)
            .reindex(index=range(observed), columns=categories, fill_value=0.0)
            .to_numpy(dtype=np.float64)
        )
        in_obs = df.groupby("_m")["_in"].sum().reindex(range(observed), fill_value=0.0).to_numpy(dtype=np.float64)

        if monthly_income is not None and monthly_income > 0:
            in_obs = np.full(observed, float(monthly_income))
            warnings_.append(f"Using the monthly income you entered ({monthly_income:,.0f}) instead of the file's income rows.")

        outflow_matrix = np.zeros((12, len(categories)))
        outflow_matrix[:observed] = out_obs
        inflow_vector = np.zeros(12)
        inflow_vector[:observed] = in_obs
        if projected:
            outflow_matrix[observed:] = out_obs.mean(axis=0)
            inflow_vector[observed:] = in_obs.mean()
        outflow_matrix = np.maximum(0.0, np.round(outflow_matrix, 2))
        inflow_vector = np.maximum(0.0, np.round(inflow_vector, 2))

        if inflow_vector.sum() <= 0:
            warnings_.append("No income found in the file. Add your monthly income to see a realistic forecast.")
        if outflow_matrix.sum() <= 0:
            warnings_.append("No spending found in the file.")


        # --- Tags and statistics from observed months only -------------------
        category_types: Dict[str, str] = {}
        category_means: Dict[str, float] = {}
        category_stds: Dict[str, float] = {}
        for j, cat in enumerate(categories):
            vals = out_obs[:, j]
            category_types[cat] = tag_category(cat, vals)
            mu = float(np.mean(vals)) if len(vals) else 0.0
            sigma = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0
            category_means[cat] = round(mu if np.isfinite(mu) else 0.0, 2)
            category_stds[cat] = round(sigma if np.isfinite(sigma) else 0.0, 2)

        total_outflows = [round(float(x), 2) for x in outflow_matrix.sum(axis=1)]
        net_cash_flows = [round(float(inflow_vector[i] - total_outflows[i]), 2) for i in range(12)]
        bal = opening
        cash_balances: List[float] = []
        for net in net_cash_flows:
            bal += net
            cash_balances.append(round(bal, 2))

        total_inflow = round(float(inflow_vector.sum()), 2)
        total_outflow = round(float(outflow_matrix.sum()), 2)
        monthly_out = float(np.mean(total_outflows))
        monthly_in = float(np.mean(inflow_vector))
        fixed = [c for c, t in category_types.items() if t == "fixed"]
        summary = {
            "total_inflow": total_inflow,
            "total_outflow": total_outflow,
            "net_cash_flow": round(total_inflow - total_outflow, 2),
            "starting_balance": round(opening, 2),
            "ending_balance": cash_balances[-1],
            "monthly_outflow_mean": round(monthly_out, 2),
            "monthly_outflow_std": round(float(np.std(total_outflows, ddof=1)), 2),
            "monthly_inflow_mean": round(monthly_in, 2),
            "monthly_inflow_std": round(float(np.std(inflow_vector, ddof=1)), 2),
            "burn_rate": round(monthly_out, 2),
            "runway_months": (
                round(cash_balances[-1] / (monthly_out - monthly_in), 1)
                if cash_balances[-1] > 0 and monthly_out > monthly_in else None
            ),
            "fixed_expense_ratio": round(sum(category_means[c] * 12 for c in fixed) / total_outflow, 4) if total_outflow else 0.0,
            "num_fixed_categories": len(fixed),
            "num_flexible_categories": len(categories) - len(fixed),
        }
        col_map.starting_balance = round(opening, 2)
        raw_metadata = {
            "dataset_id": dataset_id,
            "name": name,
            "source_rows": int(len(df)),
            "source_format": table.source_format,
            "date_range": [months[0], months[-1]],
            "observed_months": observed,
            "projected_months": projected,
            "currency": "INR" if fx else (currency or "INR"),
            "source_currency": currency or "INR",
            "fx_rate": fx,
            "detected_mapping": col_map.to_dict(),
            "warnings": warnings_,
        }

        return FinancialProblemInstance(
            dataset_id=dataset_id,
            name=name,
            months=months,
            categories=categories,
            category_types=category_types,
            outflows=outflow_matrix.tolist(),
            inflows=inflow_vector.tolist(),
            starting_balance=round(opening, 2),
            category_means=category_means,
            category_stds=category_stds,
            total_outflows=total_outflows,
            net_cash_flows=net_cash_flows,
            cash_balances=cash_balances,
            summary=summary,
            raw_metadata=raw_metadata,
        )

    @staticmethod
    def _infer_category_from_desc(desc: str) -> str:
        """Heuristic category inferrer from transaction narration string."""
        d = str(desc).lower()
        if any(k in d for k in ["salary", "payroll", "stipend"]):
            return "Salaries & Payroll"
        if any(k in d for k in ["rent", "lease", "wework", "office"]):
            return "Rent & Infrastructure"
        if any(k in d for k in ["bescom", "power", "electric", "broadband", "act", "airtel", "water", "utility"]):
            return "Utilities & Bills"
        if any(k in d for k in ["emi", "loan", "hdfc", "icici", "sbi"]):
            return "Loan & EMI"
        if any(k in d for k in ["swiggy", "zomato", "blinkit", "zepto", "food", "grocery", "groceries", "restaurant"]):
            return "Food & Consumables"
        if any(k in d for k in ["uber", "ola", "travel", "flight", "indigo", "irctc", "fuel", "petrol"]):
            return "Travel & Transport"
        if any(k in d for k in ["aws", "amazon web", "cloud", "openai", "github", "slack", "notion", "google"]):
            return "Cloud & Software"
        if any(k in d for k in ["fest", "event", "techfest", "conference", "symposium"]):
            return "Events & Fests"
        if any(k in d for k in ["ads", "google ads", "meta", "marketing", "campaign"]):
            return "Marketing & Growth"
        if any(k in d for k in ["legal", "audit", "tax", "gst", "compliance"]):
            return "Legal & Compliance"
        if any(k in d for k in ["lab", "equipment", "consumables", "chemicals"]):
            return "Lab Consumables"
        return "Miscellaneous"


def compile_financial_instance(
    csv_source: Union[bytes, str, Path, io.BytesIO, io.StringIO],
    mapping: Optional[Union[ColumnMapping, Dict[str, Any]]] = None,
    dataset_id: str = "dataset_node0",
    name: str = "Financial Dataset",
    starting_balance: Optional[float] = None,
) -> FinancialProblemInstance:
    """Convenience functional wrapper around FinancialIngestor.compile."""
    return FinancialIngestor.compile(
        csv_source=csv_source,
        mapping=mapping,
        dataset_id=dataset_id,
        name=name,
        starting_balance=starting_balance,
    )


if __name__ == "__main__":
    import time

    print("=" * 70)
    print("FutureFork Financial Ingestor & Compiler Benchmark (Member 1)")
    print("=" * 70)

    data_dir = Path(__file__).resolve().parent
    samples_dir = data_dir / "samples"

    # CSV sample test targets
    test_csvs = [
        ("personal_upi.csv", "Personal UPI Statement (12M)", None),
        ("institute_erp_1.8cr.csv", "Institute ERP Ledger (~1.8 Cr)", {
            "date_col": "Date", "debit_col": "Debit", "credit_col": "Credit",
            "category_col": "Account_Head", "description_col": "Narration", "date_format": "%d/%m/%Y"
        }),
        ("startup_pnl.csv", "Startup Company P&L / Burn (12M)", {
            "date_col": "Date", "amount_col": "Amount", "category_col": "Category",
            "type_col": "Type", "date_format": "%Y-%m-%d"
        }),
    ]

    all_passed = True

    for filename, display_name, explicit_map in test_csvs:
        p = samples_dir / filename

        if not p.exists():
            print(f"[WARN] {filename} not found, generating sample datasets first...")
            from data.make_finance_samples import main as gen_samples
            gen_samples()
            p = samples_dir / filename

        csv_bytes = p.read_bytes()

        # Benchmark execution
        t0 = time.perf_counter()
        instance = compile_financial_instance(
            csv_source=csv_bytes,
            mapping=explicit_map,
            dataset_id=p.stem,
            name=display_name,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        # Assertions
        matrix = instance.outflow_matrix
        inflows = instance.inflow_vector

        # 1. Shape asserts
        assert matrix.shape == (12, 8), f"Expected matrix shape (12, 8), got {matrix.shape}"
        assert len(inflows) == 12, f"Expected 12 inflows, got {len(inflows)}"
        assert len(instance.categories) == 8, f"Expected 8 categories, got {len(instance.categories)}"

        # 2. Tag assertions: each category must be 'fixed' or 'flexible'
        for cat, tag in instance.category_types.items():
            assert tag in ("fixed", "flexible"), f"Invalid tag '{tag}' for category '{cat}'"

        # 3. No NaN or Inf assertions
        assert not np.isnan(matrix).any(), "NaN found in outflow matrix"
        assert not np.isinf(matrix).any(), "Inf found in outflow matrix"
        assert not np.isnan(inflows).any(), "NaN found in inflow vector"
        assert not np.isinf(inflows).any(), "Inf found in inflow vector"

        for cat, mu in instance.category_means.items():
            assert not np.isnan(mu) and not np.isinf(mu), f"NaN/Inf in mu for {cat}"
        for cat, sigma in instance.category_stds.items():
            assert not np.isnan(sigma) and not np.isinf(sigma), f"NaN/Inf in sigma for {cat}"

        # 4. Latency SLA assertion (< 200ms)
        assert elapsed_ms < 200.0, f"Latency violation: {elapsed_ms:.2f}ms >= 200ms"

        fixed_count = sum(1 for t in instance.category_types.values() if t == "fixed")
        flex_count = 8 - fixed_count

        print(f" [PASS] {filename:<26} | Shape: {matrix.shape} | Tags: {fixed_count} fixed / {flex_count} flex | Latency: {elapsed_ms:6.2f} ms (< 200ms)")

    print("=" * 70)
    print("All 3 datasets compiled with 100% assertions satisfied!")
    print("=" * 70)
