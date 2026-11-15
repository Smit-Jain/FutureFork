import {
  DatasetSummary,
  DecisionSpec,
  Scenario,
  ScenarioResult,
  ComparisonResponse,
  TimetableAssignment,
} from '../contracts/types';

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

  // Distribute across 5 days (0-4) and 8 slots (0-7)
  for (let day = 0; day < 5; day++) {
    for (let slot = 0; slot < 8; slot++) {
      // Determine how many classes in this slot based on scenario
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
        
        // Calculate clash status
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
    solver: {
      status: 'FEASIBLE',
      objective: 145.0,
      runtime_s: 0.1,
    },
    metrics: {
      student_clashes: 8,
      faculty_clashes: 3,
      room_utilization: 64.8,
      avg_student_gaps: 1.85,
      capacity_fit: 88.2,
    },
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
    solver: {
      status: 'OPTIMAL',
      objective: 198.0,
      runtime_s: 4.82,
    },
    metrics: {
      student_clashes: 14,
      faculty_clashes: 1,
      room_utilization: 84.5,
      avg_student_gaps: 0.72,
      capacity_fit: 91.0,
    },
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
    solver: {
      status: 'OPTIMAL',
      objective: 36.0,
      runtime_s: 3.65,
    },
    metrics: {
      student_clashes: 2,
      faculty_clashes: 0,
      room_utilization: 75.2,
      avg_student_gaps: 1.15,
      capacity_fit: 89.5,
    },
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
    solver: {
      status: 'OPTIMAL',
      objective: 48.0,
      runtime_s: 5.12,
    },
    metrics: {
      student_clashes: 4,
      faculty_clashes: 0,
      room_utilization: 71.8,
      avg_student_gaps: 0.95,
      capacity_fit: 87.8,
    },
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
