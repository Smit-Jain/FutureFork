import {
  DatasetSummary,
  DecisionSpec,
  Scenario,
  ScenarioResult,
  ComparisonResponse,
  TimetableAssignment,
  FinancialScenarioResult,
  InspectResponse,
  CashFlowTimetable,
} from '../contracts/types';

// ─── Existing Timetable Mocks (keep intact) ───────────────────────────────

export const MOCK_DATASET: DatasetSummary = {
  id: 'sample_univ_v1',
  name: 'Elite University Timetable (Spring 2026)',
  description: 'Undergraduate timetable with 68 events, 15 faculty members, 10 lecture/lab rooms across 8 student cohorts.',
  stats: {
    events_count: 68,
    faculty_count: 15,
    rooms_count: 10,
    groups_count: 8,
    students_count: 240,
    slots_per_day: 8,
    days_count: 5,
  },
  baseline_metrics: {
    student_clashes: 8,
    faculty_clashes: 3,
    room_utilization: 64.8,
    avg_student_gaps: 1.85,
    capacity_fit: 88.2,
  },
};

export const MOCK_EXAMPLE_PROMPTS = [
  'Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week.',
  'Remove Room 101 and reallocate all classes to remaining rooms with minimum clashes.',
  'Cap faculty load at 15 teaching hours per week across all departments.',
];

export const MOCK_DECISION_SPEC: DecisionSpec = {
  id: 'dec_2026_01',
  text: 'Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week.',
  dataset_id: 'sample_univ_v1',
  objectives: [
    { metric: 'student_clashes', direction: 'minimize' },
    { metric: 'faculty_clashes', direction: 'minimize' },
    { metric: 'room_utilization', direction: 'maximize' },
    { metric: 'avg_student_gaps', direction: 'minimize' },
  ],
  constraints: [
    { kind: 'faculty_load_cap', params: { max_hours_per_week: 18 } },
  ],
  change: {
    type: 'shift_time_window',
    params: {
      from: 'afternoon',
      to: 'morning',
      selection: 'all',
    },
  },
  status: 'ok',
  message: null,
};

export const MOCK_SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    decision_id: 'dec_2026_01',
    parent_id: null,
    name: 'Baseline (Current)',
    description: 'Current timetable as operating today. Includes 8 student clashes and 3 faculty double-bookings.',
    change: {
      type: 'shift_time_window',
      params: { from: 'morning', to: 'morning', selection: 'all' },
    },
    status: 'done',
  },
  {
    id: 'scenario_a',
    decision_id: 'dec_2026_01',
    parent_id: 'baseline',
    name: 'Scenario A: Full Shift',
    description: 'Forces all afternoon lectures & labs into slots 0-3 (09:00 - 13:00). Highest utilization.',
    change: {
      type: 'shift_time_window',
      params: { from: 'afternoon', to: 'morning', selection: 'all' },
    },
    status: 'done',
  },
  {
    id: 'scenario_b',
    decision_id: 'dec_2026_01',
    parent_id: 'baseline',
    name: 'Scenario B: Electives & Labs Only',
    description: 'Shifts only electives and lab sessions to morning, allowing core lectures solver freedom.',
    change: {
      type: 'shift_time_window',
      params: { from: 'afternoon', to: 'morning', selection: 'electives' },
    },
    status: 'done',
  },
  {
    id: 'scenario_c',
    decision_id: 'dec_2026_01',
    parent_id: 'scenario_a',
    name: 'Scenario C: Shift + Extra Lab Room',
    description: 'Afternoon classes shifted to morning, supplemented with reserve Lab 204 to relieve peak load.',
    change: {
      type: 'room_change',
      params: { action: 'add', capacity: 50, type: 'lab' },
    },
    status: 'done',
  },
];

// Helper to generate realistic timetable assignments
function generateTimetable(scenarioId: string): TimetableAssignment[] {
  const courses = [
    { code: 'CS101', name: 'Intro to CS', fac: 'Prof. Turing', grp: 'CS-Year1', room: 'Aud 301' },
    { code: 'CS201', name: 'Data Structures', fac: 'Dr. Hopper', grp: 'CS-Year2', room: 'Room 101' },
    { code: 'CS301', name: 'Algorithms', fac: 'Prof. Knuth', grp: 'CS-Year3', room: 'Room 102' },
    { code: 'AI401', name: 'Machine Learning', fac: 'Dr. Hinton', grp: 'AI-Masters', room: 'Lab 201' },
    { code: 'MATH101', name: 'Calculus I', fac: 'Prof. Gauss', grp: 'CS-Year1', room: 'Aud 301' },
    { code: 'MATH201', name: 'Linear Algebra', fac: 'Prof. Euler', grp: 'CS-Year2', room: 'Room 101' },
    { code: 'PHYS101', name: 'Physics Mechanics', fac: 'Dr. Feynman', grp: 'Eng-Year1', room: 'Room 102' },
    { code: 'PHYS201', name: 'Electromagnetism', fac: 'Dr. Maxwell', grp: 'Eng-Year1', room: 'Lab 202' },
    { code: 'BIO101', name: 'Cellular Biology', fac: 'Dr. Franklin', grp: 'Bio-Year2', room: 'Room 103' },
    { code: 'CHEM101', name: 'Organic Chemistry', fac: 'Dr. Curie', grp: 'Bio-Year2', room: 'Lab 202' },
    { code: 'STAT201', name: 'Probability & Stats', fac: 'Prof. Bayes', grp: 'Data-Year1', room: 'Room 103' },
    { code: 'ENG102', name: 'Tech Communication', fac: 'Prof. Shakespeare', grp: 'Data-Year1', room: 'Room 102' },
  ];

  const assignments: TimetableAssignment[] = [];
  let eventIdx = 1;

  for (let day = 0; day < 5; day++) {
    for (let slot = 0; slot < 8; slot++) {
      const isMorning = slot < 4;
      let count = 0;

      if (scenarioId === 'baseline') {
        count = isMorning ? 2 : 2;
      } else if (scenarioId === 'scenario_a') {
        count = isMorning ? 3 : 0;
      } else if (scenarioId === 'scenario_b') {
        count = isMorning ? 2 : 1;
      } else {
        count = isMorning ? 3 : 1;
      }

      for (let c = 0; c < count; c++) {
        const item = courses[(day * 8 + slot * 2 + c) % courses.length];

        let hasClash = false;
        const clashReasons: string[] = [];

        if (scenarioId === 'baseline') {
          if ((day === 1 && slot === 2 && item.grp === 'CS-Year2') || (day === 3 && slot === 5 && item.fac === 'Prof. Turing')) {
            hasClash = true;
            clashReasons.push('Overlap with simultaneous elective section');
          }
        } else if (scenarioId === 'scenario_a') {
          if (isMorning && (slot === 1 || slot === 2) && (item.grp === 'CS-Year1' || item.grp === 'CS-Year2')) {
            hasClash = true;
            clashReasons.push('Morning congestion: 2 events for group in slot');
          }
        } else if (scenarioId === 'scenario_b') {
          if (day === 4 && slot === 1 && item.grp === 'Bio-Year2') {
            hasClash = true;
            clashReasons.push('Minor elective overlap');
          }
        }

        assignments.push({
          event_id: `ev_${scenarioId}_${eventIdx++}`,
          course: `${item.code}: ${item.name}`,
          faculty: item.fac,
          group: item.grp,
          room: item.room,
          day,
          slot,
          clash: hasClash,
          clash_reasons: clashReasons.length > 0 ? clashReasons : undefined,
        });
      }
    }
  }

  return assignments;
}

export const MOCK_RESULTS: Record<string, ScenarioResult> = {
  baseline: {
    scenario_id: 'baseline',
    solver: { status: 'FEASIBLE', objective: 145.0, runtime_s: 0.1 },
    metrics: { student_clashes: 8, faculty_clashes: 3, room_utilization: 64.8, avg_student_gaps: 1.85, capacity_fit: 88.2 },
    simulation: {
      n_runs: 300,
      per_metric: {
        student_clashes: { mean: 9.2, std: 1.8, p10: 7.0, p90: 12.0 },
        faculty_clashes: { mean: 3.4, std: 0.8, p10: 2.0, p90: 4.0 },
        room_utilization: { mean: 64.5, std: 3.2, p10: 60.1, p90: 68.2 },
        avg_student_gaps: { mean: 1.88, std: 0.25, p10: 1.55, p90: 2.2 },
      },
      prob_zero_clashes: 0.02,
    },
    timetable: generateTimetable('baseline'),
    explanation: 'Baseline timetable demonstrates notable friction with 8 student clashes and 3 faculty conflicts.',
  },
  scenario_a: {
    scenario_id: 'scenario_a',
    solver: { status: 'OPTIMAL', objective: 198.0, runtime_s: 4.82 },
    metrics: { student_clashes: 14, faculty_clashes: 1, room_utilization: 84.5, avg_student_gaps: 0.72, capacity_fit: 91.0 },
    simulation: {
      n_runs: 300,
      per_metric: {
        student_clashes: { mean: 15.6, std: 2.4, p10: 12.0, p90: 19.0 },
        faculty_clashes: { mean: 1.2, std: 0.5, p10: 1.0, p90: 2.0 },
        room_utilization: { mean: 83.9, std: 2.1, p10: 81.2, p90: 86.8 },
        avg_student_gaps: { mean: 0.75, std: 0.12, p10: 0.60, p90: 0.90 },
      },
      prob_zero_clashes: 0.00,
    },
    timetable: generateTimetable('scenario_a'),
    explanation: 'Maximizes room utilization to 84.5% and cuts student gaps to 0.72 hrs, but intensifies student clashes to 14 due to morning room congestion.',
  },
  scenario_b: {
    scenario_id: 'scenario_b',
    solver: { status: 'OPTIMAL', objective: 36.0, runtime_s: 3.65 },
    metrics: { student_clashes: 2, faculty_clashes: 0, room_utilization: 75.2, avg_student_gaps: 1.15, capacity_fit: 89.5 },
    simulation: {
      n_runs: 300,
      per_metric: {
        student_clashes: { mean: 2.8, std: 1.1, p10: 1.0, p90: 4.0 },
        faculty_clashes: { mean: 0.2, std: 0.4, p10: 0.0, p90: 1.0 },
        room_utilization: { mean: 74.8, std: 2.5, p10: 71.5, p90: 78.1 },
        avg_student_gaps: { mean: 1.18, std: 0.18, p10: 0.95, p90: 1.40 },
      },
      prob_zero_clashes: 0.38,
    },
    timetable: generateTimetable('scenario_b'),
    explanation: 'Achieves the best conflict resolution with 0 faculty clashes and only 2 student clashes, while maintaining 75.2% room utilization.',
  },
  scenario_c: {
    scenario_id: 'scenario_c',
    solver: { status: 'OPTIMAL', objective: 48.0, runtime_s: 5.12 },
    metrics: { student_clashes: 4, faculty_clashes: 0, room_utilization: 71.8, avg_student_gaps: 0.95, capacity_fit: 87.8 },
    simulation: {
      n_runs: 300,
      per_metric: {
        student_clashes: { mean: 4.5, std: 1.3, p10: 3.0, p90: 6.0 },
        faculty_clashes: { mean: 0.1, std: 0.3, p10: 0.0, p90: 0.0 },
        room_utilization: { mean: 71.2, std: 2.8, p10: 67.5, p90: 74.9 },
        avg_student_gaps: { mean: 0.98, std: 0.15, p10: 0.80, p90: 1.18 },
      },
      prob_zero_clashes: 0.18,
    },
    timetable: generateTimetable('scenario_c'),
    explanation: 'Relieves morning crowding with an extra room, holding student clashes to 4 while keeping gaps under 1 hour.',
  },
};

export const MOCK_COMPARISON_RESPONSE: ComparisonResponse = {
  decision_id: 'dec_2026_01',
  decision_spec: MOCK_DECISION_SPEC,
  scenarios: MOCK_SCENARIOS,
  results: MOCK_RESULTS,
  explanation: {
    summary:
      'Evaluation of 3 alternative branching strategies against the current Baseline timetable demonstrates a distinct trade-off between peak morning density and conflict incidence.',
    tradeoffs: {
      baseline: 'Contains 8 student clashes and 3 faculty double-bookings with moderate room utilization (64.8%).',
      scenario_a: 'Maximizes room utilization to 84.5% and cuts student gaps to 0.72 hrs, but intensifies student clashes to 14 due to morning room congestion.',
      scenario_b: 'Achieves the best conflict resolution with 0 faculty clashes and only 2 student clashes, while maintaining 75.2% room utilization.',
      scenario_c: 'Relieves morning crowding with an extra room, holding student clashes to 4 while keeping gaps under 1 hour.',
    },
    recommendation:
      'Scenario B (Selective Elective Shift) is the recommended path: it delivers a 75% reduction in student clashes (down to 2), completely eliminates faculty clashes (0), and increases room utilization to 75.2% without over-saturating the morning time band.',
    model_generated: true,
  },
};

// ─── Financial Mock Data ───────────────────────────────────────────────────

export interface FinancialDatasetPreset {
  id: string;
  name: string;
  label: string;
  description: string;
  opening_balance: number;
  emergency_floor: number;
}

export const MOCK_FINANCIAL_DATASETS: FinancialDatasetPreset[] = [
  {
    id: 'personal_upi',
    name: 'Personal UPI',
    label: 'Personal UPI',
    description: 'Personal bank account with UPI transactions — salary credits, rent, groceries, subscriptions, travel.',
    opening_balance: 285000,
    emergency_floor: 50000,
  },
  {
    id: 'institute_erp',
    name: 'Institute ₹1.8Cr ERP',
    label: 'Institute ₹1.8Cr ERP',
    description: 'Educational institution P&L with ₹1.8 Cr annual revenues — salaries, utilities, events, infrastructure spend.',
    opening_balance: 4200000,
    emergency_floor: 500000,
  },
  {
    id: 'startup_pl',
    name: 'Startup P&L',
    label: 'Startup P&L',
    description: 'Early-stage B2B SaaS startup — MRR growth, payroll burn, cloud infra, marketing sprints.',
    opening_balance: 8500000,
    emergency_floor: 1000000,
  },
];

export const MOCK_FINANCIAL_PROMPTS: string[] = [
  'What happens if we delay all vendor payments by 30 days and redirect ₹2L to emergency reserve?',
  'Model EMI-based procurement: split ₹18L capex over 24 months instead of upfront.',
  'Cut travel and event budget by 40% for next 6 months. Show survival probability.',
  'Phase the annual marketing spend across Q2–Q4 instead of a Q1 blitz.',
  'If inflows drop 20% next quarter, what is the probability we dip below the floor?',
  'Compare upfront vendor payment vs phased monthly settlement on 12-month runway.',
];

// Generate realistic 12-month cash flow timetable
function generateFinancialTimetable(scenarioId: string, openingBalance = 2500000): CashFlowTimetable {
  const months = ['Apr 25','May 25','Jun 25','Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Feb 26','Mar 26'];

  const baseValues: Record<string, number[]> = {
    Rent:       [120000,120000,120000,120000,120000,120000,120000,120000,120000,120000,120000,120000],
    Salaries:   [380000,380000,380000,380000,380000,380000,390000,390000,390000,395000,395000,400000],
    EMI:        [45000,45000,45000,45000,45000,45000,45000,45000,45000,45000,45000,45000],
    Utilities:  [28000,30000,32000,35000,34000,31000,29000,28000,27000,30000,31000,33000],
    Travel:     [55000,42000,38000,67000,89000,45000,52000,38000,72000,61000,44000,38000],
    Food:       [22000,24000,21000,25000,23000,20000,22000,24000,28000,25000,21000,20000],
    Events:     [0,80000,0,0,120000,0,0,65000,0,0,0,180000],
    Marketing:  [150000,80000,60000,45000,90000,120000,100000,75000,60000,80000,110000,95000],
  };

  // Adjust per scenario
  const multipliers: Record<string, Partial<Record<string, number>>> = {
    'fin_baseline': {},
    'fin_upfront':  { EMI: 0, Marketing: 0.6 },
    'fin_emi':      { EMI: 1.4, Travel: 0.8 },
    'fin_phased':   { Events: 0.6, Marketing: 0.7 },
    'fin_trim':     { Travel: 0.5, Food: 0.8, Events: 0.3, Marketing: 0.5 },
  };

  const mults = multipliers[scenarioId] || {};

  const categories: CashFlowTimetable['categories'] = [
    { name: 'Rent',      type: 'fixed',    values: baseValues.Rent },
    { name: 'Salaries',  type: 'fixed',    values: baseValues.Salaries },
    { name: 'EMI',       type: 'fixed',    values: baseValues.EMI.map(v => Math.round(v * (mults['EMI'] ?? 1))) },
    { name: 'Utilities', type: 'fixed',    values: baseValues.Utilities },
    { name: 'Travel',    type: 'flexible', values: baseValues.Travel.map(v => Math.round(v * (mults['Travel'] ?? 1))) },
    { name: 'Food',      type: 'flexible', values: baseValues.Food.map(v => Math.round(v * (mults['Food'] ?? 1))) },
    { name: 'Events',    type: 'flexible', values: baseValues.Events.map(v => Math.round(v * (mults['Events'] ?? 1))) },
    { name: 'Marketing', type: 'flexible', values: baseValues.Marketing.map(v => Math.round(v * (mults['Marketing'] ?? 1))) },
  ];

  void openingBalance; // used by caller

  return { months, categories };
}

function makeMonthlyBalances(scenarioId: string): number[] {
  const starts: Record<string, number> = {
    'fin_baseline': 2500000,
    'fin_upfront':  2500000,
    'fin_emi':      2500000,
    'fin_phased':   2500000,
    'fin_trim':     2500000,
  };
  const drifts: Record<string, number> = {
    'fin_baseline': -65000,
    'fin_upfront':  -120000,
    'fin_emi':      -45000,
    'fin_phased':   -40000,
    'fin_trim':     -20000,
  };
  let bal = starts[scenarioId] ?? 2500000;
  const drift = drifts[scenarioId] ?? -60000;
  return Array.from({ length: 12 }, (_, i) => {
    bal += drift + Math.round(Math.sin(i * 0.8) * 80000);
    return Math.max(bal, 0);
  });
}

export const MOCK_FINANCIAL_SCENARIOS: Array<{
  id: string;
  policy: string;
  name: string;
  description: string;
  parent_id: string | null;
}> = [
  { id: 'fin_baseline', policy: 'Baseline',  name: 'Baseline (Node 0)',       description: 'Current cash flow as uploaded. No interventions applied.',                                           parent_id: null },
  { id: 'fin_upfront',  policy: 'Upfront',   name: 'Fork 1: Upfront Payment', description: 'Pay all major vendors upfront for 10% discount. High initial outflow, lower monthly burn.',          parent_id: 'fin_baseline' },
  { id: 'fin_emi',      policy: 'EMI',       name: 'Fork 2: EMI Structure',   description: 'Convert ₹18L capex to 24-month EMIs. Preserves liquidity but increases monthly fixed cost.',         parent_id: 'fin_baseline' },
  { id: 'fin_phased',   policy: 'Phased',    name: 'Fork 3: Phased Spend',    description: 'Phase events & marketing across Q2–Q4. Smoothens cash out without reducing total spend.',             parent_id: 'fin_baseline' },
  { id: 'fin_trim',     policy: 'Trim',      name: 'Fork 4: Trim & Survive',  description: 'Cut travel 50%, events 70%, marketing 50%. Extends runway by ~4 months. Survival-first strategy.',    parent_id: 'fin_baseline' },
];

export const MOCK_FINANCIAL_RESULTS: FinancialScenarioResult[] = [
  {
    scenario_id: 'fin_baseline',
    solver: { status: 'FEASIBLE', objective: 0, runtime_s: 0.2 },
    metrics: { cash_out_risk_pct: 42, p10_worst_balance: 180000, lowest_balance_month: 'Jan 26', runway_months: 7, survival_score_pct: 61 },
    simulation: {
      per_metric: {
        cash_out_risk_pct:   { p10: 32, p90: 58, mean: 42, std: 8 },
        survival_score_pct:  { p10: 51, p90: 72, mean: 61, std: 7 },
        runway_months:       { p10: 5, p90: 9, mean: 7, std: 1.2 },
        p10_worst_balance:   { p10: 80000, p90: 310000, mean: 180000, std: 60000 },
      },
      prob_cash_out: 0.42,
      monthly_balances: makeMonthlyBalances('fin_baseline'),
      balance_p10: makeMonthlyBalances('fin_baseline').map(v => Math.round(v * 0.72)),
      balance_p90: makeMonthlyBalances('fin_baseline').map(v => Math.round(v * 1.28)),
    },
    timetable: generateFinancialTimetable('fin_baseline'),
    explanation: 'At current burn rate, there is a 42% probability of breaching the ₹50,000 emergency floor by January 2026. The P10 worst balance of ₹1.8L leaves limited margin for surprise outflows. Runway extends to approximately 7 months.',
  },
  {
    scenario_id: 'fin_upfront',
    solver: { status: 'FEASIBLE', objective: 0, runtime_s: 1.1 },
    metrics: { cash_out_risk_pct: 61, p10_worst_balance: -45000, lowest_balance_month: 'May 25', runway_months: 5, survival_score_pct: 38 },
    simulation: {
      per_metric: {
        cash_out_risk_pct:   { p10: 50, p90: 78, mean: 61, std: 10 },
        survival_score_pct:  { p10: 28, p90: 48, mean: 38, std: 7 },
        runway_months:       { p10: 3, p90: 7, mean: 5, std: 1.1 },
        p10_worst_balance:   { p10: -120000, p90: 60000, mean: -45000, std: 50000 },
      },
      prob_cash_out: 0.61,
      monthly_balances: makeMonthlyBalances('fin_upfront'),
      balance_p10: makeMonthlyBalances('fin_upfront').map(v => Math.round(v * 0.65)),
      balance_p90: makeMonthlyBalances('fin_upfront').map(v => Math.round(v * 1.35)),
    },
    timetable: generateFinancialTimetable('fin_upfront'),
    explanation: 'The upfront payment strategy creates a critical liquidity crunch in May 2025, dropping the P10 worst balance to –₹45,000. While the 10% vendor discount saves ₹1.8L over the year, the 61% cash-out risk makes this strategy high-risk without an additional credit line.',
  },
  {
    scenario_id: 'fin_emi',
    solver: { status: 'OPTIMAL', objective: 0, runtime_s: 2.3 },
    metrics: { cash_out_risk_pct: 28, p10_worst_balance: 320000, lowest_balance_month: 'Feb 26', runway_months: 10, survival_score_pct: 74 },
    simulation: {
      per_metric: {
        cash_out_risk_pct:   { p10: 18, p90: 42, mean: 28, std: 7 },
        survival_score_pct:  { p10: 64, p90: 84, mean: 74, std: 7 },
        runway_months:       { p10: 8, p90: 12, mean: 10, std: 1.4 },
        p10_worst_balance:   { p10: 185000, p90: 480000, mean: 320000, std: 85000 },
      },
      prob_cash_out: 0.28,
      monthly_balances: makeMonthlyBalances('fin_emi'),
      balance_p10: makeMonthlyBalances('fin_emi').map(v => Math.round(v * 0.78)),
      balance_p90: makeMonthlyBalances('fin_emi').map(v => Math.round(v * 1.22)),
    },
    timetable: generateFinancialTimetable('fin_emi'),
    explanation: 'Converting the ₹18L capex to EMIs reduces upfront cash pressure and brings cash-out risk down to 28%. The P10 worst balance improves to ₹3.2L, extending runway to 10 months. The monthly EMI addition of ₹20,250 is manageable within projected inflows.',
  },
  {
    scenario_id: 'fin_phased',
    solver: { status: 'OPTIMAL', objective: 0, runtime_s: 1.8 },
    metrics: { cash_out_risk_pct: 22, p10_worst_balance: 420000, lowest_balance_month: 'Mar 26', runway_months: 11, survival_score_pct: 82 },
    simulation: {
      per_metric: {
        cash_out_risk_pct:   { p10: 14, p90: 34, mean: 22, std: 6 },
        survival_score_pct:  { p10: 72, p90: 91, mean: 82, std: 6 },
        runway_months:       { p10: 9, p90: 13, mean: 11, std: 1.2 },
        p10_worst_balance:   { p10: 260000, p90: 590000, mean: 420000, std: 95000 },
      },
      prob_cash_out: 0.22,
      monthly_balances: makeMonthlyBalances('fin_phased'),
      balance_p10: makeMonthlyBalances('fin_phased').map(v => Math.round(v * 0.80)),
      balance_p90: makeMonthlyBalances('fin_phased').map(v => Math.round(v * 1.20)),
    },
    timetable: generateFinancialTimetable('fin_phased'),
    explanation: 'Phasing events and marketing across Q2–Q4 smoothens the cash curve without cutting total spend. Survival score reaches 82%, cash-out risk drops to 22%, and the worst P10 balance improves to ₹4.2L. This fork sacrifices Q1 visibility but preserves financial health.',
  },
  {
    scenario_id: 'fin_trim',
    solver: { status: 'OPTIMAL', objective: 0, runtime_s: 1.4 },
    metrics: { cash_out_risk_pct: 8, p10_worst_balance: 780000, lowest_balance_month: 'Mar 26', runway_months: 14, survival_score_pct: 94 },
    simulation: {
      per_metric: {
        cash_out_risk_pct:   { p10: 4, p90: 14, mean: 8, std: 3 },
        survival_score_pct:  { p10: 88, p90: 98, mean: 94, std: 3 },
        runway_months:       { p10: 12, p90: 16, mean: 14, std: 1.2 },
        p10_worst_balance:   { p10: 580000, p90: 980000, mean: 780000, std: 115000 },
      },
      prob_cash_out: 0.08,
      monthly_balances: makeMonthlyBalances('fin_trim'),
      balance_p10: makeMonthlyBalances('fin_trim').map(v => Math.round(v * 0.85)),
      balance_p90: makeMonthlyBalances('fin_trim').map(v => Math.round(v * 1.15)),
    },
    timetable: generateFinancialTimetable('fin_trim'),
    explanation: 'The Trim strategy achieves a 94% survival score by cutting discretionary spend aggressively. Cash-out risk falls to just 8%, P10 worst balance rises to ₹7.8L, and runway extends to 14 months. This is the safest fork, recommended if inflows are uncertain over the next 2 quarters.',
  },
];

export const MOCK_INSPECT_RESPONSE: InspectResponse = {
  dataset_id: 'inspect_tmp_001',
  filename: 'transactions.csv',
  row_count: 342,
  column_mapping: {
    date_col: 'Date',
    amount_col: 'Amount',
    description_col: 'Description',
    category_col: 'Category',
    balance_col: 'Balance',
    raw_columns: ['Date','Description','Amount','Category','Balance','Reference'],
    preview_rows: [
      { Date: '01-Apr-2025', Description: 'Salary Credit', Amount: '85000', Category: 'Inflow', Balance: '285000' },
      { Date: '02-Apr-2025', Description: 'Rent Payment',  Amount: '-120000', Category: 'Fixed', Balance: '165000' },
      { Date: '03-Apr-2025', Description: 'Groceries UPI', Amount: '-4200', Category: 'Food', Balance: '160800' },
      { Date: '04-Apr-2025', Description: 'Electricity Bill', Amount: '-3800', Category: 'Utilities', Balance: '157000' },
      { Date: '05-Apr-2025', Description: 'SIP Investment', Amount: '-25000', Category: 'Investment', Balance: '132000' },
    ],
  },
  date_range: { start: '2025-04-01', end: '2026-03-31' },
  total_inflow: 1250000,
  total_outflow: 985000,
  net_balance: 265000,
};
