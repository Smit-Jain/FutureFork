# FutureFork System Architecture

```text
+-------------------------------------------------------------+
|  FRONTEND  React 18 + Vite + Tailwind + Recharts            |
|  Upload & map CSV -> Decision prompt -> Fork tree ->        |
|  Cash-flow matrix -> Comparison dashboard -> Explanation    |
+-----------------------------+-------------------------------+
                              | REST / JSON (contracts/)
+-----------------------------v-------------------------------+
|  BACKEND  FastAPI + SQLAlchemy                              |
|  routes, background runner, result cache, sample seeding    |
|  SQLite / Postgres (Supabase): uploads, datasets,           |
|  decisions, scenarios, runs, results                        |
+---------------+-----------------------------+---------------+
                |                             |
+---------------v-------------+   +-----------v----------------+
|  AI LAYER                   |   |  ENGINE  pure Python       |
|  mapper    CSV columns      |   |  ingestor  CSV -> Node 0   |
|  parser    ₹ / lakh / crore |   |  changes   fork transforms |
|  scenario  4-fork fan-out   |   |  solver    OR-Tools CP-SAT |
|            (LangGraph)      |   |  metrics   risk metrics    |
|  explainer + Numeric Guard  |   |  simulator NumPy MC (300)  |
|  LLM optional (OpenAI/Groq) |   |                            |
+-----------------------------+   +----------------------------+
```

## Request flow

1. `POST /datasets/inspect` reads the file with `data/normalize.py` (CSV/TSV/Excel, preamble lines, Dr/Cr markers, Indian/European numbers, day- or month-first dates) and proposes a column mapping from headers and values (mapper agent; deterministic fallback).
2. `POST /datasets/commit` compiles the 12-month baseline (Node 0) and stores it with its Monte Carlo baseline metrics. Three sample datasets (`sample_personal`, `sample_institute`, `sample_startup`) are seeded on startup.
3. `POST /decisions` parses the prompt into one of three decision kinds (one-time cost, recurring cost, income change) with amount, floor, timing and loan terms, plus a plain-English "understood" summary. Off-topic prompts return `unsupported`; missing amounts return `needs_clarification` with a specific question.
4. `POST /decisions/{id}/scenarios` fans the stored decision out into the baseline plus the forks for its kind (`engine.changes.FORKS_BY_KIND`), without re-parsing the prompt. Scenario ids are `{decision_id}_{branch}`, so decisions never overwrite each other.
5. `POST /decisions/{id}/run` evaluates each fork in a background thread: CP-SAT, then Monte Carlo. Results are cached by dataset, change, seed and run count.
6. `GET /decisions/{id}/compare` returns every result in the `FinancialScenarioResult` contract plus an explanation that has passed the Numeric Guard.

## System boundaries

- **Engine** (`engine/`, `data/`): pure Python functions. Never touches HTTP, databases or LLMs. It raises on invalid input instead of returning placeholder numbers.
- **AI layer** (`ai/`): parses text and explains results. It is not allowed to compute or modify metrics. Every agent has a deterministic offline fallback (`FUTUREFORK_OFFLINE=1` or no API key).
- **Backend** (`backend/`): coordinator, state, background jobs and cache. If a fork fails, the scenario is marked `failed`; the backend never substitutes numbers.
- **Frontend** (`frontend/`): talks to the backend only through the REST contracts. `VITE_USE_MOCKS=true` runs it on labelled placeholder data for UI work.
- **Contracts** (`contracts/`): `schemas.py` is the source of truth and is enforced as FastAPI `response_model`s. `types.ts` mirrors it, and `openapi.json` is generated with `python scripts/export_openapi.py`.
