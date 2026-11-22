import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Database, FileText, Loader2, Upload } from 'lucide-react';
import { api } from '../api/client';
import { ColumnMapping, ColumnRole, DatasetType, InspectResponse } from '../contracts/types';
import { SAMPLE_DATASETS } from '../mocks/fixtures';
import { TiltCard } from './fx/TiltCard';

interface UploadIngestorProps {
  onDatasetReady: (datasetId: string, name: string, datasetType: DatasetType, warnings: string[]) => void;
}

const COLUMN_ROLES: ColumnRole[] = [
  'date_col', 'amount_col', 'debit_col', 'credit_col', 'type_col', 'balance_col', 'category_col', 'description_col',
];

const ROLE_LABELS: Record<ColumnRole | 'ignore', string> = {
  date_col: 'Date',
  amount_col: 'Signed / single amount',
  debit_col: 'Debit (money out)',
  credit_col: 'Credit (money in)',
  type_col: 'Type (inflow / outflow)',
  balance_col: 'Running balance',
  category_col: 'Category',
  description_col: 'Description',
  ignore: 'Ignore',
};

const DATASET_TYPE_LABELS: Record<DatasetType, string> = {
  personal: 'Personal',
  institute: 'Institute',
  startup: 'Startup',
};

export const UploadIngestor: React.FC<UploadIngestorProps> = ({ onDatasetReady }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType>('personal');
  const [openingBalance, setOpeningBalance] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setError(null);
    setIsInspecting(true);
    setInspectResult(null);
    try {
      const result = await api.inspectDataset(file);
      setInspectResult(result);
      setMapping(result.proposed_mapping);
      setDatasetType(result.dataset_type);
      setDatasetName(file.name.replace(/\.(csv|tsv|txt|xlsx)$/i, '').replace(/[_-]+/g, ' '));
      setOpeningBalance('');
      setMonthlyIncome('');
      setFxRate(result.units?.suggested_fx_rate ? String(result.units.suggested_fx_rate) : '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to inspect file');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOf = (col: string): ColumnRole | 'ignore' =>
    (mapping && COLUMN_ROLES.find((r) => mapping[r] === col)) || 'ignore';

  const setRole = (col: string, role: ColumnRole | 'ignore') => {
    if (!mapping) return;
    const next: ColumnMapping = { ...mapping };
    COLUMN_ROLES.forEach((r) => {
      if (next[r] === col) (next[r] as string | null) = r === 'date_col' ? '' : null;
    });
    if (role !== 'ignore') (next[role] as string | null) = col;
    setMapping(next);
  };

  const hasAmounts = !!mapping && (!!mapping.amount_col || !!mapping.debit_col || !!mapping.credit_col);

  const handleCommit = async () => {
    if (!inspectResult || !mapping) return;
    const toNumber = (v: string) => (v.trim() ? parseFloat(v.replace(/[,₹\s]/g, '')) : undefined);
    const balance = toNumber(openingBalance);
    const income = toNumber(monthlyIncome);
    if ((balance !== undefined && isNaN(balance)) || (income !== undefined && isNaN(income))) {
      setError('Opening balance and monthly income must be numbers, e.g. 285000.');
      return;
    }
    const foreign = !!inspectResult.units && inspectResult.units.currency !== 'INR';
    const fx = foreign ? toNumber(fxRate) : undefined;
    if (foreign && (fx === undefined || isNaN(fx) || fx <= 0)) {
      setError(`Enter how many rupees one ${inspectResult.units!.currency} is worth, e.g. 88.`);
      return;
    }
    setIsCommitting(true);
    setError(null);
    try {
      const result = await api.commitDataset({
        upload_id: inspectResult.upload_id,
        confirmed_mapping: mapping,
        dataset_name: datasetName || undefined,
        starting_balance: balance,
        monthly_income: income,
        dataset_type: datasetType,
        fx_rate: fx,
      });
      onDatasetReady(result.dataset_id, result.name, result.dataset_type, result.warnings ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to build the baseline');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Sample datasets */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink-line pb-3">
          <h2 className="text-2xl sm:text-3xl tracking-tight">Start with a sample</h2>
          <span className="label">01 · Quick start</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {SAMPLE_DATASETS.map((preset, i) => (
            <TiltCard key={preset.id}>
              <button
                onClick={() => onDatasetReady(preset.id, preset.name, preset.dataset_type, [])}
                className="group brackets w-full h-full text-left paper-card p-5 hover:bg-paper transition-colors duration-300 preserve-3d"
              >
                <div className="flex items-center justify-between" style={{ transform: 'translateZ(18px)' }}>
                  <span className="label">{String(i + 1).padStart(2, '0')} · {DATASET_TYPE_LABELS[preset.dataset_type]}</span>
                  <Database className="w-4 h-4 text-ink-dim group-hover:text-ink transition-colors" />
                </div>
                <div className="mt-6 text-xl tracking-tight" style={{ transform: 'translateZ(28px)' }}>{preset.label}</div>
                <div className="mt-2 text-sm text-ink-dim leading-snug">{preset.description}</div>
                <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.06em] inline-flex items-center gap-2 border-b border-ink pb-0.5 group-hover:text-brand-coral group-hover:border-brand-coral">
                  Use this data ↗
                </div>
              </button>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* Upload zone */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink-line pb-3">
          <h2 className="text-2xl sm:text-3xl tracking-tight">Or bring your own</h2>
          <span className="label">02 · CSV, TSV or Excel · up to 10 MB</span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Upload a CSV or Excel file"
          className={`relative brackets cursor-pointer border border-dashed px-6 py-14 flex flex-col items-center justify-center gap-4 transition-all duration-300
                      ${isDragging ? 'border-ink bg-paper-2 scale-[1.01]' : 'border-ink/30 hover:border-ink hover:bg-paper-2'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) await processFile(f); }}
          />
          {isInspecting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="label">Reading your file…</span>
            </div>
          ) : (
            <>
              <div className={`w-14 h-14 border border-ink flex items-center justify-center transition-transform duration-300 ${isDragging ? '-translate-y-1' : ''}`}>
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg tracking-tight">Drop a statement here</p>
                <p className="label">or click to browse · bank / UPI statements, ERP ledgers, P&amp;L exports</p>
              </div>
            </>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 border border-bad/40 bg-bad/5 text-bad text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {inspectResult && mapping && (
        <section className="space-y-6 animate-in">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-ink-line py-3 label">
            <span className="flex items-center gap-1.5 text-ink"><FileText className="w-3.5 h-3.5" />{inspectResult.filename}</span>
            <span>{inspectResult.row_count} rows · {inspectResult.headers.length} columns</span>
            <span>
              Mapped by {inspectResult.mapping_source === 'llm' ? 'AI' : 'rules'} · {Math.round(inspectResult.mapping_confidence * 100)}% confidence
            </span>
          </div>

          {inspectResult.warnings.length > 0 && (
            <div className="px-4 py-3 border border-warn/40 bg-warn/5 text-sm space-y-1">
              <div className="label text-warn">About your file</div>
              {inspectResult.warnings.map((w) => <div key={w}>{w}</div>)}
            </div>
          )}

          {inspectResult.units && (inspectResult.units.currency !== 'INR' || inspectResult.units.scale_label || inspectResult.units.cell_units) && (
            <div className="relative brackets border border-ink bg-paper-2 p-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
              <div className="space-y-1.5">
                <div className="label">Units we found</div>
                <p className="text-xl tracking-tight">
                  Amounts read as{' '}
                  <strong className="font-medium">
                    {inspectResult.units.currency}
                    {inspectResult.units.scale_label ? ` ${inspectResult.units.scale_label}s` : ''}
                  </strong>
                  {inspectResult.units.cell_units && <span className="text-ink-dim"> · units like 1.2M expanded</span>}
                </p>
                <p className="text-[13px] text-ink-dim">
                  {inspectResult.units.scale_label
                    ? `A value of 1.5 in the file becomes ${(1.5 * inspectResult.units.scale).toLocaleString(inspectResult.units.currency === 'INR' ? 'en-IN' : 'en-US')} ${inspectResult.units.currency}. `
                    : ''}
                  {inspectResult.units.currency !== 'INR'
                    ? 'Everything is converted to rupees with the rate on the right, so every result is in ₹.'
                    : 'Everything stays in rupees.'}
                </p>
              </div>
              {inspectResult.units.currency !== 'INR' && (
                <label className="space-y-1 block min-w-[220px]">
                  <span className="label block">₹ per 1 {inspectResult.units.currency}</span>
                  <span className="flex items-center border border-ink bg-paper focus-within:bg-white/60">
                    <span className="pl-3 font-mono text-sm text-ink-dim">₹</span>
                    <input
                      value={fxRate}
                      onChange={(e) => setFxRate(e.target.value)}
                      inputMode="decimal"
                      aria-label={`Rupees per ${inspectResult.units.currency}`}
                      className="flex-1 min-w-0 bg-transparent px-2 py-2 font-mono tabular-nums outline-none"
                    />
                  </span>
                  <span className="block text-[11.5px] text-ink-dim">Pre-filled with an approximate rate. Use today's rate.</span>
                </label>
              )}
            </div>
          )}

          {/* Column mapping */}
          <div className="paper-card p-5 space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xl tracking-tight">Map columns</h3>
              <span className="label hidden sm:inline">03 · Confirm</span>
            </div>
            <p className="text-sm text-ink-dim">
              Use one signed amount column (optionally with a type column), or separate debit and credit columns.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {inspectResult.headers.map((col) => (
                <label key={col} className="space-y-1 block">
                  <span className="block font-mono text-[11px] text-ink-dim truncate">{col}</span>
                  <span className="relative block">
                    <select
                      value={roleOf(col)}
                      onChange={(e) => setRole(col, e.target.value as ColumnRole | 'ignore')}
                      className="field w-full text-xs pr-7 appearance-none cursor-pointer"
                    >
                      {[...COLUMN_ROLES, 'ignore' as const].map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="paper-card p-5 space-y-3 overflow-x-auto">
            <h3 className="text-xl tracking-tight">Preview</h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-ink">
                  {inspectResult.headers.map((col) => (
                    <th key={col} className="pb-2 pr-4 label whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspectResult.preview_rows.map((row, i) => (
                  <tr key={i} className="border-b border-ink-line">
                    {inspectResult.headers.map((col) => (
                      <td key={col} className="py-2 pr-4 font-mono tabular-nums whitespace-nowrap">{row[col] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Parameters */}
          <div className="paper-card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="space-y-1 block">
              <span className="label block">Dataset name</span>
              <input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className="field w-full" />
            </label>
            <label className="space-y-1 block">
              <span className="label block">Opening balance (₹, optional)</span>
              <input value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="field w-full font-mono tabular-nums" placeholder="e.g. 285000" />
            </label>
            <label className="space-y-1 block">
              <span className="label block">Monthly income (₹, optional)</span>
              <input value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} className="field w-full font-mono tabular-nums" placeholder="if the file has no income rows" />
            </label>
            <label className="space-y-1 block">
              <span className="label block">Dataset type</span>
              <select value={datasetType} onChange={(e) => setDatasetType(e.target.value as DatasetType)} className="field w-full">
                {(Object.keys(DATASET_TYPE_LABELS) as DatasetType[]).map((t) => (
                  <option key={t} value={t}>{DATASET_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={handleCommit}
            disabled={isCommitting || !mapping.date_col || !hasAmounts}
            className="group relative w-full h-14 bg-ink text-paper font-mono text-xs uppercase tracking-[0.08em] flex items-center justify-center gap-2
                       hover:bg-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
          >
            <span className="absolute inset-x-0 top-0 h-[2px] bg-brand-linear" />
            {isCommitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Building baseline…</> : <><CheckCircle2 className="w-4 h-4" /> Build baseline (Node 0)</>}
          </button>
        </section>
      )}
    </div>
  );
};
