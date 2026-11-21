# 🌟 FutureFork Good First Issues

Beginner-friendly and intermediate issues across the engine, AI layer, backend and frontend. Several come from known limits of the current prototype.

---

### 1. 💱 Currency awareness
- **Area**: `data/normalize.py`, `ai/agents/explainer.py`, `frontend/`
- **Difficulty**: Beginner
- **Problem**: Files in $, € or £ are detected (`raw_metadata["currency"]`) but every amount is still shown with ₹.
- **Definition of Done**: The detected currency symbol is used throughout the UI and explanations.

---

### 2. 🧩 Prompts with two decisions
- **Area**: `ai/agents/parser.py`, `engine/`
- **Difficulty**: Intermediate
- **Problem**: *"Sell my old car for 3L and buy a new one for 8L"* models only the sale.
- **Definition of Done**: Combined decisions are parsed into a list of changes and evaluated together.

---

### 3. 📅 Start the horizon from today
- **Area**: `data/ingestor.py`, `ai/agents/parser.py`
- **Difficulty**: Intermediate
- **Problem**: The 12-month view replays the calendar months of the uploaded data, so "next month" means the second month of the data, not next month from today.
- **Definition of Done**: The horizon starts at the current month, using the history's seasonality for each calendar month.

---

### 4. 🎛️ Make the Crisis Playground engine-backed
- **Area**: `frontend/src/components/ComparisonDashboard.tsx`, `backend/api/routes.py`, `engine/simulator.py`
- **Difficulty**: Intermediate
- **Problem**: The stress sliders estimate survival scores in the browser with a hand-written formula, which bends the Golden Rule.
- **Definition of Done**: Sliders call an endpoint that re-runs the Monte Carlo simulation with the chosen shock parameters (inflow delay, surprise outflow, drift).

---

### 5. 🌿 Custom branch UI
- **Area**: `frontend/`
- **Difficulty**: Beginner
- **Goal**: `POST /scenarios/{id}/branch` already evaluates a user-defined child fork (e.g. "EMI, but 6 months"). Add a "Branch from here" action on scenario cards.
- **Definition of Done**: A child card appears under its parent with engine results.

---

### 6. 📤 Export the winning plan
- **Area**: `frontend/src/components/ComparisonDashboard.tsx`
- **Difficulty**: Beginner
- **Goal**: Export the selected fork's 12-month schedule (inflows, category outflows, purchase cash-out, closing balance) as CSV.
- **Definition of Done**: The downloaded file matches `cash_flow` and `simulation.monthly_balances` exactly.

---

### 7. 🧾 New fork type: lease-to-own
- **Area**: `engine/changes.py`, `engine/solver.py`, `ai/agents/scenario.py`
- **Difficulty**: Intermediate
- **Goal**: Add a fifth strategy with monthly lease payments and an optional buy-out at month N. Follow "Adding a New Fork Type" in the README.
- **Definition of Done**: The fork appears in the UI with solver-verified metrics and tests.

---

### 8. 📈 Longer horizons
- **Area**: `data/ingestor.py`, `engine/`
- **Difficulty**: Advanced
- **Goal**: Support 24-month horizons (currently fixed at 12 months).
- **Definition of Done**: Horizon is configurable end to end; all tests pass for 12 and 24.

---

### 9. 🗄️ Database migrations
- **Area**: `backend/db/`
- **Difficulty**: Intermediate
- **Goal**: Add Alembic so schema changes don't require deleting the local SQLite database.
- **Definition of Done**: `alembic upgrade head` creates the current schema; CI runs it.

---

### 10. 🔔 Webhook on run completion
- **Area**: `backend/orchestration/runner.py`, `backend/settings.py`
- **Difficulty**: Beginner
- **Goal**: Optional `WEBHOOK_URL` receives a JSON summary when a decision run finishes.
- **Definition of Done**: Payload includes each fork's survival score, cash-out risk and lowest balance.
