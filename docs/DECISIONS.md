# FutureFork Architectural Decision Records (ADR)

## ADR 001: Golden Rule - Strict Separation of LLMs and Mathematical Engines
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: LLMs hallucinate numbers and cannot reliably verify constraints like schedule clashes or capacity math.
- **Decision**: AI agents interpret text, formulate structured `DecisionSpec` queries, and explain computed results. Mathematical solvers (Google OR-Tools CP-SAT) and Monte Carlo simulators (NumPy) compute every single number that ever reaches the screen.
- **Consequence**: The frontend never receives hallucinated statistics. Explainer agents pass through a strict regex numeric guard.

## ADR 002: Schema-First API Contracts
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: Four teammates working in parallel (A on React, B on FastAPI, C on CP-SAT, D on LangGraph).
- **Decision**: All payload schemas are defined in `contracts/schemas.py` and synced with `contracts/types.ts`. Any change requires explicit consensus before being merged.
- **Consequence**: Member A built the entire frontend on day 0 using contract-compliant mocks, unblocking immediate UI development.

## ADR 003: Soft Constraints for CP-SAT
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: Radical user policies (e.g. compressing 100% of classes into morning slots or removing major rooms) can make a timetable mathematically infeasible if all constraints are hard.
- **Decision**: Room overlaps and faculty double-bookings are modeled as soft constraints with high penalties. The solver always produces the best feasible trade-off rather than crashing with INFEASIBLE.

## ADR 004: JSONB Payload Storage for DB Models
- **Date**: 2026-11-15
- **Status**: Accepted
- **Context**: Rapid hackathon iterations may introduce secondary metadata to scenarios and results.
- **Decision**: Core entities (datasets, decisions, scenarios, runs, results) store flexible payload blobs (`jsonb` on Postgres / JSON text on SQLite).
- **Consequence**: Eliminates runtime schema migrations during sprint while preserving fast indexed querying on primary keys.
