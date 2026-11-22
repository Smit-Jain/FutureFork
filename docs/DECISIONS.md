# FutureFork Architectural Decision Records (ADR)

## ADR 001: Golden Rule - Strict Separation of LLMs and Mathematical Engines
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: LLMs hallucinate numbers and cannot reliably verify constraints such as an emergency-floor breach or EMI interest.
- **Decision**: AI agents interpret text, produce structured decision specs, and explain computed results. The CP-SAT solver, the metric engine and the NumPy Monte Carlo simulator compute every number that reaches the screen.
- **Consequence**: Explanations pass through a regex Numeric Guard. As of ADR 006, the backend never substitutes placeholder numbers when the engine fails.

## ADR 002: Schema-First API Contracts
- **Date**: 2026-11-15
- **Status**: Accepted (amended 2026-11-21)
- **Context**: Four teammates worked in parallel on frontend, backend, engine and AI.
- **Decision**: Response schemas are defined in `contracts/schemas.py` and mirrored in `contracts/types.ts` / `frontend/src/contracts/types.ts`. Since 2026-11-21 the schemas are enforced as FastAPI `response_model`s, and `contracts/openapi.json` is generated from the running app.
- **Consequence**: The frontend can be built against mocks with the same shape (`VITE_USE_MOCKS=true`).

## ADR 003: Soft Constraints for CP-SAT
- **Date**: 2026-11-15
- **Status**: Accepted (re-scoped 2026-11-21)
- **Context**: Aggressive purchase decisions can make it impossible to stay above the emergency floor in every month.
- **Decision**: The emergency floor is a soft constraint. Each fork minimizes total floor deficit first, then a fork-specific secondary objective.
- **Consequence**: The solver always returns the least-bad plan. Breaches are reported through `months_below_floor` and the risk metrics instead of an `INFEASIBLE` error.

## ADR 004: JSON Payload Storage for DB Models
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: Rapid hackathon iteration kept changing scenario and result metadata.
- **Decision**: Core entities store flexible payload blobs (`jsonb` on Postgres / JSON text on SQLite). Results store the raw engine output, and the API projects it into the contract at read time.
- **Consequence**: No runtime schema migrations during the sprint. Changing a table's columns still requires recreating local SQLite databases.

## ADR 005: Financial Decisions Only; Timetabling Removed
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: FutureFork began as a university timetabling tool, then pivoted to financial cash-flow decisions. Both code paths coexisted, the timetable path was the default for evaluation, and the live pipeline returned timetable or placeholder output for financial datasets.
- **Decision**: Remove the timetable domain entirely: engine models, appliers, solver, simulator and metrics, sample data, AI stubs, the LangGraph timetable graph, UI mode, and contracts. Keep a single engine entry point, `evaluate_financial_branch`.
- **Consequence**: One product, one evaluation path, one contract.

## ADR 006: Fail Honestly Instead of Falling Back to Placeholder Numbers
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: The backend bridge returned hardcoded metrics (for example "28% cash-out risk") whenever the engine raised. That broke ADR 001 without anyone noticing, and lenient tests accepted it.
- **Decision**: Engine failures propagate. The runner marks that scenario `failed`, and the other forks still run. Tests assert that results come from the engine.
- **Consequence**: Bad inputs and engine bugs become visible in the UI and in CI instead of being hidden behind plausible-looking numbers.

## ADR 007: Any File, Any Prompt
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Real exports vary widely (delimiters, bank preambles, Dr/Cr markers, Indian and European number formats, short histories), and real decisions are not all one-time purchases.
- **Decision**: One shared reader (`data/normalize.py`) detects columns from headers and values for both inspect and commit. Decisions are classified as `one_time`, `recurring_expense` or `income_change`, each with its own forks (`engine.changes.FORKS_BY_KIND`); recurring costs and income changes are applied to a copy of the baseline and solved with the same engine. The parser always returns a plain-English "understood" summary, asks a specific question when an amount is missing, and declines off-topic prompts.
- **Consequence**: Assumptions (inferred opening balance, projected months, skipped rows, currency) are surfaced to the user as warnings instead of being hidden. Short histories are projected from averages rather than zero-filled.

## ADR 008: Google Sign-In Accounts, Per-User Data and Alembic Migrations
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Users need accounts so their decisions can be saved and reopened. The team moved to PostgreSQL, where `create_all` can't add columns to existing tables.
- **Decision**: Sign-in is required for `/app` and the API. The browser gets a Google ID token from Google Identity Services; the backend verifies it (`google-auth`, audience = `GOOGLE_CLIENT_ID`) and issues its own session as a signed HS256 JWT in an httpOnly, SameSite cookie. State-changing requests also need an `X-FutureFork: 1` header (CSRF). Datasets, uploads and decisions carry a `user_id`; the bundled samples are shared (`user_id` NULL); anything owned by someone else returns 404. The schema is managed by Alembic (`backend/db/migrations`), applied on startup; migrations are idempotent so pre-Alembic databases upgrade in place. Timestamps are written as UTC by the app.
- **Consequence**: Every API client needs a session (`AUTH_DEV_LOGIN=1` gives local tools and tests a Google-free login; it's ignored in production). Production needs `GOOGLE_CLIENT_ID`, `SESSION_SECRET` and, for split frontend/API domains, `COOKIE_SAMESITE=none` with `COOKIE_SECURE=1`. Schema changes are new Alembic revisions, not table rebuilds.

