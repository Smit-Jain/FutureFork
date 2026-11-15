import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Scenario, ScenarioResult, TimetableAssignment } from '../contracts/types';
import { AlertCircle, Calendar, Filter, Clock, MapPin, User, Users } from 'lucide-react';

interface TimetableGridProps {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  selectedScenarioId: string;
  onSelectScenario: (id: string) => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SLOTS = [
  { index: 0, time: '09:00 - 10:00', period: 'Morning' },
  { index: 1, time: '10:00 - 11:00', period: 'Morning' },
  { index: 2, time: '11:00 - 12:00', period: 'Morning' },
  { index: 3, time: '12:00 - 13:00', period: 'Morning' },
  { index: 4, time: '13:00 - 14:00', period: 'Afternoon' },
  { index: 5, time: '14:00 - 15:00', period: 'Afternoon' },
  { index: 6, time: '15:00 - 16:00', period: 'Afternoon' },
  { index: 7, time: '16:00 - 17:00', period: 'Afternoon' },
];

export const TimetableGrid: React.FC<TimetableGridProps> = ({
  scenarios,
  results,
  selectedScenarioId,
  onSelectScenario,
}) => {
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [activeCellEvent, setActiveCellEvent] = useState<TimetableAssignment | null>(null);

  const currentResult = results[selectedScenarioId];
  const assignments = currentResult?.timetable || [];

  // Extract unique cohorts/groups
  const allGroups = Array.from(new Set(assignments.map((a) => a.group))).sort();

  // Filter assignments
  const filteredAssignments =
    selectedGroupFilter === 'all'
      ? assignments
      : assignments.filter((a) => a.group === selectedGroupFilter);

  // Group assignments by day and slot: map[day_slot] = array of assignments
  const slotMap = new Map<string, TimetableAssignment[]>();
  filteredAssignments.forEach((a) => {
    const key = `${a.day}_${a.slot}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key)!.push(a);
  });

  const clashCount = filteredAssignments.filter((a) => a.clash).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Selector & Legend Bar */}
      <Card className="p-4 sm:p-5 bg-white border border-slate-200 shadow-soft">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scenario Tab Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
              Scenario:
            </span>
            {scenarios.map((sc) => {
              const isSelected = sc.id === selectedScenarioId;
              return (
                <button
                  key={sc.id}
                  onClick={() => onSelectScenario(sc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    isSelected
                      ? sc.id === 'baseline'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : sc.id === 'scenario_a'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : sc.id === 'scenario_b'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {sc.name}
                </button>
              );
            })}
          </div>

          {/* Group Filter & Clash Counter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filter Cohort:</span>
              <select
                value={selectedGroupFilter}
                onChange={(e) => setSelectedGroupFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Student Cohorts</option>
                {allGroups.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`px-2.5 py-1 rounded-full font-mono font-bold text-xs flex items-center gap-1 border ${
                  clashCount > 0
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {clashCount > 0 ? (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                )}
                {clashCount} Clashes Visible
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Weekly Grid */}
      <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-soft overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Day Headers */}
          <div className="grid grid-cols-[140px_repeat(5,1fr)] gap-2 mb-2 pb-2 border-b border-slate-200">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 p-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Time Slot</span>
            </div>
            {DAYS.map((day, idx) => (
              <div
                key={day}
                className="p-2 text-center text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-50/80 rounded-lg border border-slate-100"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Slots & Events Grid */}
          <div className="space-y-2">
            {SLOTS.map((slot) => {
              const isMorning = slot.index < 4;

              return (
                <div
                  key={slot.index}
                  className={`grid grid-cols-[140px_repeat(5,1fr)] gap-2 items-stretch ${
                    slot.index === 3 ? 'pb-3 border-b-2 border-slate-200' : ''
                  }`}
                >
                  {/* Slot Label Column */}
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col justify-center">
                    <span className="text-[11px] font-mono font-bold text-slate-700">
                      Slot {slot.index}: {slot.time}
                    </span>
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wider mt-0.5 ${
                        isMorning ? 'text-amber-600' : 'text-indigo-600'
                      }`}
                    >
                      {slot.period}
                    </span>
                  </div>

                  {/* 5 Day Cells for this slot */}
                  {DAYS.map((_, dayIdx) => {
                    const key = `${dayIdx}_${slot.index}`;
                    const items = slotMap.get(key) || [];

                    return (
                      <div
                        key={dayIdx}
                        className={`min-h-[74px] p-1.5 rounded-lg border transition-all ${
                          items.length === 0
                            ? 'bg-slate-50/40 border-slate-100/80'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {items.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-[10px] text-slate-300 italic">
                            Free
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {items.map((item) => (
                              <div
                                key={item.event_id}
                                onClick={() => setActiveCellEvent(item)}
                                className={`p-1.5 rounded-md border text-[11px] transition-all cursor-pointer ${
                                  item.clash
                                    ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-[0_0_8px_rgba(239,68,68,0.15)] ring-1 ring-rose-400/50'
                                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="font-bold truncate flex items-center justify-between">
                                  <span className="truncate">{item.course.split(':')[0]}</span>
                                  {item.clash && (
                                    <AlertCircle className="w-3 h-3 text-rose-600 shrink-0 ml-1" />
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                  <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{item.faculty}</span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mt-0.5 pt-0.5 border-t border-slate-100">
                                  <span className="truncate">{item.room}</span>
                                  <span className="text-slate-500 font-semibold">{item.group}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Interactive Event Detail Modal / Floating Card */}
      {activeCellEvent && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setActiveCellEvent(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <Badge
                  size="sm"
                  variant={activeCellEvent.clash ? 'danger' : 'success'}
                  dot
                >
                  {activeCellEvent.clash ? 'Schedule Conflict' : 'Valid Allocation'}
                </Badge>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {activeCellEvent.course}
                </h3>
              </div>
              <button
                onClick={() => setActiveCellEvent(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                  <User className="w-3 h-3" /> Faculty
                </span>
                <span className="font-semibold text-slate-800">{activeCellEvent.faculty}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                  <Users className="w-3 h-3" /> Student Cohort
                </span>
                <span className="font-semibold text-slate-800">{activeCellEvent.group}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Room Location
                </span>
                <span className="font-semibold text-slate-800">{activeCellEvent.room}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Day &amp; Slot
                </span>
                <span className="font-semibold text-slate-800">
                  {DAYS[activeCellEvent.day]}, Slot {activeCellEvent.slot}
                </span>
              </div>
            </div>

            {activeCellEvent.clash && activeCellEvent.clash_reasons && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Clash Diagnosis:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                  {activeCellEvent.clash_reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
