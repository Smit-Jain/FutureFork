import React, { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { InspectResponse, ColumnMapping, CommitRequest } from '../contracts/types';
import { MOCK_FINANCIAL_DATASETS, MOCK_INSPECT_RESPONSE } from '../mocks/fixtures';
import { Upload, FileText, ChevronDown, Lock, AlertTriangle, CheckCircle2, Loader2, Database } from 'lucide-react';

interface UploadIngestorProps {
  onCommit: (datasetId: string, name: string) => void;
  onPresetLoad: (presetId: string) => void;
}

const COLUMN_ROLE_OPTIONS = [
  'date_col', 'amount_col', 'description_col', 'category_col', 'balance_col', 'ignore',
];

const COLUMN_ROLE_LABELS: Record<string, string> = {
  date_col: '📅 Date',
  amount_col: '₹ Amount',
  description_col: '📝 Description',
  category_col: '🏷 Category',
  balance_col: '💰 Balance',
  ignore: '✕ Ignore',
};

export const UploadIngestor: React.FC<UploadIngestorProps> = ({ onCommit, onPresetLoad }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [emergencyFloor, setEmergencyFloor] = useState('');
  const [datasetName, setDatasetName] = useState('My Financial Data');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processFile = async (file: File) => {
    setError(null);
    setIsInspecting(true);
    setInspectResult(null);
    setCommitted(false);
    try {
      const result = await api.inspectDataset(file);
      setInspectResult(result);
      setColumnMapping(result.column_mapping);
      setOpeningBalance('');
      setEmergencyFloor('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to inspect file');
    } finally {
      setIsInspecting(false);
    }
  };

  const handlePreset = (preset: typeof MOCK_FINANCIAL_DATASETS[0]) => {
    setInspectResult(MOCK_INSPECT_RESPONSE);
    setColumnMapping(MOCK_INSPECT_RESPONSE.column_mapping);
    setOpeningBalance(preset.opening_balance.toString());
    setEmergencyFloor(preset.emergency_floor.toString());
    setDatasetName(preset.name);
    setCommitted(false);
    onPresetLoad(preset.id);
  };

  const handleColumnRoleChange = (colName: string, role: string) => {
    if (!columnMapping) return;
    const updated: ColumnMapping = { ...columnMapping };
    // Reset any existing assignment of this role
    const roleKeys: (keyof ColumnMapping)[] = ['date_col', 'amount_col', 'description_col', 'category_col', 'balance_col'];
    roleKeys.forEach((k) => {
      if (updated[k] === colName && k !== role) {
        (updated[k] as string) = '';
      }
    });
    if (role !== 'ignore') {
      (updated[role as keyof ColumnMapping] as string) = colName;
    }
    setColumnMapping(updated);
  };

  const getColumnRole = (colName: string): string => {
    if (!columnMapping) return 'ignore';
    if (columnMapping.date_col === colName) return 'date_col';
    if (columnMapping.amount_col === colName) return 'amount_col';
    if (columnMapping.description_col === colName) return 'description_col';
    if (columnMapping.category_col === colName) return 'category_col';
    if (columnMapping.balance_col === colName) return 'balance_col';
    return 'ignore';
  };

  const handleCommit = async () => {
    if (!inspectResult || !columnMapping) return;
    const ob = parseFloat(openingBalance.replace(/,/g, ''));
    const ef = parseFloat(emergencyFloor.replace(/,/g, ''));
    if (isNaN(ob) || isNaN(ef)) {
      setError('Please enter valid opening balance and emergency floor amounts.');
      return;
    }
    setIsCommitting(true);
    setError(null);
    try {
      const payload: CommitRequest = {
        dataset_id: inspectResult.dataset_id,
        name: datasetName,
        column_mapping: columnMapping,
        opening_balance: ob,
        emergency_floor: ef,
      };
      const result = await api.commitDataset(payload);
      setCommitted(true);
      onCommit(result.dataset_id, result.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to commit dataset');
    } finally {
      setIsCommitting(false);
    }
  };

  const fmtRs = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      {/* Preset Buttons */}
      <div className="glass-card p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
          <Database className="w-3.5 h-3.5" />
          Quick Start — Load Sample Dataset
        </div>
        <div className="flex flex-wrap gap-2">
          {MOCK_FINANCIAL_DATASETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePreset(preset)}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/10 bg-white/5
                         text-slate-300 hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-emerald-300
                         transition-all duration-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-card p-10 flex flex-col items-center justify-center gap-4 cursor-pointer
                    border-2 border-dashed transition-all duration-200 rounded-2xl
                    ${isDragging
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-glow'
                      : 'border-white/15 hover:border-emerald-500/40 hover:bg-white/8'
                    }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
        {isInspecting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <span className="text-sm text-slate-400">Inspecting file…</span>
          </div>
        ) : (
          <>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
                            ${isDragging ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <Upload className={`w-8 h-8 ${isDragging ? 'text-emerald-400' : 'text-slate-500'}`} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-300">
                Drop your CSV / Excel here
              </p>
              <p className="text-xs text-slate-500">
                or click to browse • Bank statements, P&L, UPI exports
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-600 border border-white/8 rounded-lg px-3 py-1 bg-white/3">
              .csv · .xlsx · .xls
            </span>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Inspect Result */}
      {inspectResult && columnMapping && (
        <div className="space-y-5 animate-in fade-in">
          {/* File summary */}
          <div className="glass-card p-4 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">{inspectResult.filename}</span>
            </div>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{inspectResult.row_count} rows</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">{inspectResult.date_range.start} → {inspectResult.date_range.end}</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-mono tabular-nums">In: {fmtRs(inspectResult.total_inflow)}</span>
            <span className="text-rose-400 font-mono tabular-nums">Out: {fmtRs(inspectResult.total_outflow)}</span>
            <span className="text-cyan-400 font-mono tabular-nums">Net: {fmtRs(inspectResult.net_balance)}</span>
          </div>

          {/* Column Mapping */}
          <div className="glass-card p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              Map Columns
              <span className="text-[10px] font-normal text-slate-500 font-mono">
                Assign roles to each column
              </span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {columnMapping.raw_columns.map((col) => (
                <div key={col} className="space-y-1">
                  <div className="text-[11px] text-slate-500 truncate font-mono">{col}</div>
                  <div className="relative">
                    <select
                      value={getColumnRole(col)}
                      onChange={(e) => handleColumnRoleChange(col, e.target.value)}
                      className="w-full dark-input text-xs py-2 pr-7 appearance-none cursor-pointer"
                    >
                      {COLUMN_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role} className="bg-[#0F1623]">
                          {COLUMN_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Table */}
          <div className="glass-card p-5 space-y-3 overflow-x-auto">
            <h4 className="text-sm font-bold text-slate-200">5-Row Preview</h4>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  {columnMapping.raw_columns.map((col) => (
                    <th key={col} className="pb-2 pr-4 text-slate-500 font-medium whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columnMapping.preview_rows.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/3">
                    {columnMapping.raw_columns.map((col) => (
                      <td key={col} className="py-2 pr-4 text-slate-300 font-mono tabular-nums whitespace-nowrap">
                        {row[col] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Opening Balance & Floor */}
          <div className="glass-card p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-200">Financial Parameters</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 space-y-1">
                <label className="text-xs text-slate-400 font-medium">Dataset Name</label>
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="dark-input w-full"
                  placeholder="My Financial Data"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Opening Balance (₹)</label>
                <input
                  type="text"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="dark-input w-full font-mono tabular-nums"
                  placeholder="e.g. 285000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Emergency Floor (₹)
                </label>
                <input
                  type="text"
                  value={emergencyFloor}
                  onChange={(e) => setEmergencyFloor(e.target.value)}
                  className="dark-input w-full font-mono tabular-nums"
                  placeholder="e.g. 50000"
                />
              </div>
            </div>
          </div>

          {/* Commit Button */}
          {committed ? (
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">Baseline (Node 0) built!</div>
                <div className="text-xs text-emerald-500/80">Switch to "Fork & Compare" tab to explore scenarios.</div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleCommit}
              disabled={isCommitting || !openingBalance || !emergencyFloor}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2
                         bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400
                         text-white shadow-glow transition-all duration-200
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isCommitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Building Baseline…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Build Baseline (Node 0)</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
