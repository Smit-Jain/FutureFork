# FutureFork System Architecture

```text
+------------------------------------------------------------+
|  FRONTEND (A)  React + Tailwind + React Flow + Recharts    |
|  Input page -> Scenario Tree -> Comparison Dashboard       |
+----------------------------+-------------------------------+
                             | REST / JSON (contracts)
+----------------------------v-------------------------------+
|  BACKEND (B)  FastAPI                                      |
|  routes, orchestration, job runner, cache                  |
|  Postgres / Supabase / SQLite: datasets, decisions,        |
|  scenarios, runs, results                                  |
+--------------+-----------------------------+---------------+
               |                             |
+--------------v-------------+   +-----------v----------------+
|  AI LAYER (D)              |   |  ENGINE (C)  pure Python   |
|  LangGraph agents          |   |  model.py   data model     |
|  - Parser                  |   |  metrics.py metric calc    |
|  - Scenario generator      |   |  changes.py change appliers|
|  - Explainer               |   |  solver.py  OR-Tools CP-SAT|
|  LLM provider              |   |  simulator.py NumPy MC     |
+----------------------------+   +----------------------------+
```

## System Boundaries
- **Engine (C)**: Pure Python functions. Never connects to HTTP, DBs, or LLMs. Given dataset and change parameters, returns mathematical metrics and simulated distributions.
- **AI Layer (D)**: Natural language parsing and explanation. Strictly forbidden from computing or modifying metrics.
- **Frontend (A)**: React app communicating exclusively via REST API contracts.
- **Backend (B)**: Central coordinator, state manager, asynchronous job orchestrator, and cache provider.
