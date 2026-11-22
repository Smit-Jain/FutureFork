# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this project is

FutureFork turns a plain-English money decision into competing strategies, evaluated against the user's own financial data. A user uploads a bank/UPI statement, institute ERP ledger or startup P&L (CSV or Excel), types a decision ("Buy a car for ₹8L without dropping below ₹1L", "Hire 2 engineers at 20L/yr each", "What if my salary drops 20%?"), and FutureFork forks it into strategies. Each strategy is solved with OR-Tools CP-SAT and stress-tested with a 300-run NumPy Monte Carlo simulation.

## The Golden Rule (do not break it)

**AI interprets and explains. The engine computes every number.**

- Never generate, estimate or hardcode a metric that reaches the user. Numbers come only from `engine/`.
- If the engine can't evaluate something, fail visibly: raise, and let the runner mark the scenario `failed`. Never fall back to placeholder numbers.
- Explanations must pass the Numeric Guard (`ai/agents/explainer.py`).
- The only placeholder data allowed is the frontend mock mode (`VITE_USE_MOCKS=true`), which is labelled in the UI.

## Commands

```bash
# Backend (Python 3.11+, venv at ./venv)
pip install -r backend/requirements.txt
python backend/main.py                      # http://localhost:8000 (docs at /docs); seeds sample datasets

# Tests (offline, throwaway SQLite DB via conftest.py)
python -m pytest                            # backend + engine tests
FUTUREFORK_OFFLINE=1 python scripts/e2e.py  # end-to-end pipeline check
FUTUREFORK_OFFLINE=1 python ai/evals/test_prompts.py
ruff check backend/ contracts/ data/ scripts/ engine/ ai/

# Frontend (pnpm)
cd frontend && pnpm install && pnpm dev     # http://localhost:5173
pnpm run build                              # tsc + vite build

# After changing API schemas
python scripts/export_openapi.py            # regenerates contracts/openapi.json
```

Run lint, `pytest`, the E2E script, the evals and the frontend build before considering a change done. CI runs all of them.

## Architecture

```
frontend/   React 18 + Vite + Tailwind + Recharts. Talks to the backend only via REST.
            pages/Landing.tsx (/) with a three.js robot in landing/robot/ (lazy chunk),
            pages/Workspace.tsx (/app). Light editorial theme: tokens in tailwind.config.js,
            fork colours/labels in src/theme/forks.ts. The decide step (src/decide/) previews the
            prompt client-side; chip/slider edits rewrite the prompt text, which is all the API receives.
backend/    FastAPI. routes.py (endpoints), orchestration/ (runner, cache, engine/AI bridge),
            db/ (SQLAlchemy models, repository, sample seeding), settings.py (env / .env)
ai/         agents/mapper.py (CSV column mapping), parser.py (decision parsing),
            scenario.py (fork fan-out, LangGraph), explainer.py (explanation + Numeric Guard)
engine/     Pure Python: model.py, changes.py (fork transformers, decision adjustments),
            solver.py (CP-SAT), simulator.py (Monte Carlo), metrics.py
data/       normalize.py (read any CSV/Excel, detect columns), ingestor.py (12-month baseline),
            samples/ (bundled sample CSVs)
engine/tax/ Indian income-tax engine for the ITR helper (rules per FY, compute, forms,
            saving moves, filing checklist). Pure; build_tax_report() is the entry point.
contracts/  schemas.py (source of truth, enforced as FastAPI response models),
            types.ts (TS mirror), openapi.json (generated)
```

**Boundaries:** `engine/` never touches HTTP, databases or LLMs. `ai/` never computes metrics. The backend is the only place that wires them together (`backend/orchestration/integrations.py`).

**Auth:** Google Sign-In is required for `/app` and every API route except `/health`, `/ping`, `/auth/*` (`backend/auth/`). Routes take `user = Depends(require_user)` and must check ownership (`_get_dataset_or_404` / `_get_decision_or_404` return 404 for other users' rows). POSTs need the `X-FutureFork: 1` header. Use `AUTH_DEV_LOGIN=1` locally; tests call route functions with `user=`.

**Database:** schema changes go in a new Alembic revision (`backend/db/migrations/versions`), never by editing old ones; `init_db()` runs `upgrade head`. Write timestamps with `models.utcnow`.

**Request flow:** `POST /datasets/inspect` → `POST /datasets/commit` (12-month Node 0 baseline) → `POST /decisions` (parse) → `POST /decisions/{id}/scenarios` (fan-out) → `POST /decisions/{id}/run` (background solve + Monte Carlo) → `GET /runs/{id}` → `GET /decisions/{id}/compare`. The Crisis Playground calls `POST /decisions/{id}/stress`, which re-runs the Monte Carlo simulation with user shocks (engine numbers, not a browser estimate).

**ITR helper:** `/app/tax` (`pages/TaxWorkspace.tsx`) → `backend/api/tax_routes.py` (`/tax/*`) → `call_tax_report` → `engine.tax.build_tax_report` + `ai/agents/tax_explainer.py` (guarded). Tax rules live in `engine/tax/rules.py`: add a new FY entry each Budget, never edit an old year, and cite the source. Tests in `engine/tests/test_tax.py` hold hand-worked figures; keep them exact.

## Decision kinds and forks

Defined in `engine/changes.py` (`FORKS_BY_KIND`):

| Kind | Example | Forks (plus baseline) |
|---|---|---|
| `one_time` | purchase, trip, debt payoff, savings goal | upfront, emi, phased, trim |
| `recurring_expense` | hiring, subscription, rent, SIP | absorb, delay, phase_in, trim |
| `income_change` | pay cut, job loss, raise, one-off inflow | absorb, trim |

The single engine entry point is `engine.solver.evaluate_financial_branch(instance, branch_type, goal)`.

## Conventions

- **Contracts first:** when an API response changes, update `contracts/schemas.py`, both `types.ts` copies (`contracts/` and `frontend/src/contracts/`, kept identical) and regenerate `openapi.json`.
- **Scenario ids** are `{decision_id}_{branch}` so decisions never overwrite each other.
- **Money** is in rupees as floats. Indian formatting (₹1,20,000 / ₹1.2L / ₹1.8Cr) is a display concern only.
- **New fork type:** see "Adding a New Fork Type" in `README.md` (transformer, solver, `FORKS_BY_KIND`, scenario metadata, contracts, UI labels, tests).
- **Tests** must assert engine-computed results, not just "something came back". Don't write tests that accept `failed` as success.
- **Cache:** bump `CACHE_VERSION` in `backend/orchestration/caching.py` when the stored result format changes.
- **Database:** Alembic migrations (`alembic revision -m "..."`, then `alembic upgrade head`); keep them idempotent like 0001/0002.
- **Style:** ruff with line length 100. Keep modules pure where they are pure.

## Git and pull requests

- Work on a branch; never commit to `main` directly.
- `origin` is a contributor's fork. Team PRs go to **upstream `Smit-Jain/FutureFork` `main`**.
- **Do not add AI attribution.** No `Co-Authored-By: Claude` trailers in commits and no "Generated with Claude Code" lines in PR descriptions. Commits are authored by the human contributor.
- Never commit `.env`, `frontend/.env`, `*.db` or `*.bak` files.

## Gotchas

- Without `OPENAI_API_KEY`/`GROQ_API_KEY` (or with `FUTUREFORK_OFFLINE=1`), every AI agent uses its deterministic fallback. Both paths must work.
- The 12-month horizon replays the calendar months of the uploaded data; months beyond the data are projected from averages (`raw_metadata["projected_months"]`).
- Amounts in other currencies are used as-is and shown with ₹ (a warning is raised).
- `ruff` isn't bundled as a binary in the venv on every machine; install it separately if `python -m ruff` fails.
