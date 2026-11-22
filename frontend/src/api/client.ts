import {
  ChangeSpec,
  CommitRequest,
  CommitResponse,
  ComparisonResponse,
  AuthConfig,
  DatasetSummary,
  DecisionSpec,
  HistoryResponse,
  FinancialScenarioResult,
  InspectResponse,
  RunStatus,
  Scenario,
  StressRequest,
  StressResponse,
  TaxInputs,
  TaxProfile,
  TaxProfileList,
  TaxReport,
  TaxRulesResponse,
  User,
} from '../contracts/types';
import { buildMockComparison, MOCK_INSPECT_RESPONSE, SAMPLE_DATASETS } from '../mocks/fixtures';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const isMockMode = USE_MOCKS;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** Where the app sends people whose session has ended (set by the auth layer). */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

/**
 * Every call sends the session cookie (credentials: 'include') and the CSRF header the backend
 * requires on state-changing requests. Reads the backend's {error, message} body (or FastAPI's
 * {detail: {...}}) into an ApiError; a 401 also triggers the sign-in redirect.
 */
async function request<T>(path: string, init?: RequestInit, opts: { redirectOn401?: boolean } = {}): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-FutureFork', '1');
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && opts.redirectOn401 !== false) onUnauthorized?.();
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      const detail = body?.detail ?? body;
      message = detail?.message || (typeof detail === 'string' ? detail : message);
      code = detail?.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message || `Request failed (${res.status})`, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Mock-mode state
const mockDecisions: Record<string, { text: string; datasetId: string; startedAt: number }> = {};

const TAX_NEEDS_BACKEND = 'The ITR helper needs the backend (set VITE_USE_MOCKS=false): tax figures only come from the tax engine.';

const MOCK_USER: User = { id: 'mock', email: 'demo@futurefork.local', name: 'Mock User', picture: null };

export const api = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  async authConfig(): Promise<AuthConfig> {
    if (USE_MOCKS) return { google_client_id: null, dev_login: true };
    return request('/auth/config', undefined, { redirectOn401: false });
  },

  /** The signed-in user, or null (never redirects). */
  async me(): Promise<User | null> {
    if (USE_MOCKS) return MOCK_USER;
    try {
      return await request<User>('/auth/me', undefined, { redirectOn401: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async signInWithGoogle(credential: string): Promise<User> {
    if (USE_MOCKS) return MOCK_USER;
    return request('/auth/google', json({ credential }), { redirectOn401: false });
  },

  async devLogin(email?: string): Promise<User> {
    if (USE_MOCKS) return MOCK_USER;
    return request('/auth/dev-login', json(email ? { email } : {}), { redirectOn401: false });
  },

  async logout(): Promise<void> {
    if (USE_MOCKS) return;
    await request('/auth/logout', { method: 'POST' }, { redirectOn401: false });
  },

  async getHistory(): Promise<HistoryResponse> {
    if (USE_MOCKS) return { items: [] };
    return request('/me/decisions');
  },

  async getHealth(): Promise<{ status: string }> {
    if (USE_MOCKS) return { status: 'ok' };
    return request('/health');
  },

  async getDatasets(): Promise<DatasetSummary[]> {
    if (USE_MOCKS) {
      return SAMPLE_DATASETS.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        stats: { months: 12, categories: 8, starting_balance: 0, total_inflow: 0, total_outflow: 0, category_types: {} },
        baseline_metrics: {},
      }));
    }
    return request('/datasets');
  },

  /** One dataset with its engine-compiled stats (opening balance, 12-month totals). */
  async getDataset(datasetId: string): Promise<DatasetSummary> {
    if (USE_MOCKS) {
      const d = SAMPLE_DATASETS.find((x) => x.id === datasetId);
      if (!d) throw new Error(`Unknown dataset ${datasetId}`);
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        stats: { months: 12, categories: 8, starting_balance: 0, total_inflow: 0, total_outflow: 0, category_types: {} },
        baseline_metrics: {},
      };
    }
    return request(`/datasets/${datasetId}`);
  },

  async inspectDataset(file: File): Promise<InspectResponse> {
    if (USE_MOCKS) {
      await delay(500);
      return { ...MOCK_INSPECT_RESPONSE, filename: file.name };
    }
    const formData = new FormData();
    formData.append('file', file);
    return request('/datasets/inspect', { method: 'POST', body: formData });
  },

  async commitDataset(payload: CommitRequest): Promise<CommitResponse> {
    if (USE_MOCKS) {
      await delay(400);
      return {
        dataset_id: `ds_mock_${Date.now()}`,
        name: payload.dataset_name || 'Mock Dataset',
        dataset_type: payload.dataset_type || 'personal',
        stats: { months: 12, categories: 8, starting_balance: payload.starting_balance || 0, total_inflow: 0, total_outflow: 0, category_types: {} },
        baseline_metrics: {},
        warnings: ['Mock mode: placeholder data, not computed from your file.'],
      };
    }
    return request('/datasets/commit', json(payload));
  },

  async createDecision(text: string, datasetId: string): Promise<DecisionSpec> {
    if (USE_MOCKS) {
      await delay(300);
      const id = `dec_mock${Date.now()}`;
      const hasAmount = /\d/.test(text);
      mockDecisions[id] = { text, datasetId, startedAt: Date.now() };
      return {
        id,
        text,
        dataset_id: datasetId,
        dataset_type: 'personal',
        decision_kind: hasAmount ? 'one_time' : null,
        understood: hasAmount ? 'Mock mode: a one-time cost of ₹1,20,000, with a ₹30,000 minimum balance.' : null,
        change: { type: 'emi', params: {} },
        status: hasAmount ? 'ok' : 'needs_clarification',
        message: hasAmount ? null : 'Please include an amount like ₹60L, ₹1.2 lakh, or ₹30,000.',
      };
    }
    return request('/decisions', json({ text, dataset_id: datasetId }));
  },

  async generateScenarios(decisionId: string): Promise<Scenario[]> {
    if (USE_MOCKS) {
      const d = mockDecisions[decisionId];
      return buildMockComparison(decisionId, d?.text ?? '', d?.datasetId ?? '').scenarios.map((s) => ({ ...s, status: 'queued' }));
    }
    return request(`/decisions/${decisionId}/scenarios`, { method: 'POST' });
  },

  async runDecision(decisionId: string): Promise<{ run_id: string }> {
    if (USE_MOCKS) {
      if (mockDecisions[decisionId]) mockDecisions[decisionId].startedAt = Date.now();
      return { run_id: `run_${decisionId}` };
    }
    return request(`/decisions/${decisionId}/run`, { method: 'POST' });
  },

  async getRunStatus(runId: string): Promise<RunStatus> {
    if (USE_MOCKS) {
      const decisionId = runId.replace(/^run_/, '');
      const started = mockDecisions[decisionId]?.startedAt ?? 0;
      const done = Date.now() - started > 1200;
      const ids = buildMockComparison(decisionId, '', '').scenarios.map((s) => s.id);
      return {
        run_id: runId,
        decision_id: decisionId,
        overall_status: done ? 'done' : 'running',
        scenarios: Object.fromEntries(ids.map((id) => [id, done ? 'done' : 'running'])),
        progress_percent: done ? 100 : 50,
      };
    }
    return request(`/runs/${runId}`);
  },

  async getScenarioResult(scenarioId: string): Promise<FinancialScenarioResult> {
    if (USE_MOCKS) {
      const decisionId = scenarioId.replace(/_(baseline|upfront|emi|phased|trim)$/, '');
      return buildMockComparison(decisionId, '', '').results[scenarioId];
    }
    return request(`/scenarios/${scenarioId}/result`);
  },

  async getComparison(decisionId: string): Promise<ComparisonResponse> {
    if (USE_MOCKS) {
      const d = mockDecisions[decisionId];
      return buildMockComparison(decisionId, d?.text ?? '', d?.datasetId ?? '');
    }
    return request(`/decisions/${decisionId}/compare`);
  },

  /** Crisis Playground: re-runs the Monte Carlo simulation for every fork with extra shocks. */
  async stressDecision(decisionId: string, stress: StressRequest, signal?: AbortSignal): Promise<StressResponse> {
    if (USE_MOCKS) {
      throw new Error('The Crisis Playground needs the backend (set VITE_USE_MOCKS=false).');
    }
    return request(`/decisions/${decisionId}/stress`, { ...json(stress), signal });
  },

  async branchScenario(parentScenarioId: string, name: string, change: ChangeSpec): Promise<Scenario> {
    if (USE_MOCKS) {
      throw new Error('Custom branches need the backend (set VITE_USE_MOCKS=false).');
    }
    return request(`/scenarios/${parentScenarioId}/branch`, json({ name, change }));
  },

  // ─── ITR helper (every amount from engine/tax; no mock numbers) ─────────
  async taxRules(): Promise<TaxRulesResponse> {
    if (USE_MOCKS) throw new Error(TAX_NEEDS_BACKEND);
    return request('/tax/rules');
  },

  async taxCompute(inputs: Partial<TaxInputs>, signal?: AbortSignal): Promise<TaxReport> {
    if (USE_MOCKS) throw new Error(TAX_NEEDS_BACKEND);
    return request('/tax/compute', { ...json(inputs), signal });
  },

  async taxProfiles(): Promise<TaxProfileList> {
    if (USE_MOCKS) return { items: [] };
    return request('/tax/profiles');
  },

  async taxProfile(id: string): Promise<TaxProfile> {
    if (USE_MOCKS) throw new Error(TAX_NEEDS_BACKEND);
    return request(`/tax/profiles/${id}`);
  },

  async saveTaxProfile(inputs: Partial<TaxInputs>, id?: string | null, label?: string): Promise<TaxProfile> {
    if (USE_MOCKS) throw new Error(TAX_NEEDS_BACKEND);
    const body = { inputs, label: label || null };
    return id ? request(`/tax/profiles/${id}`, { ...json(body), method: 'PUT' }) : request('/tax/profiles', json(body));
  },

  async deleteTaxProfile(id: string): Promise<void> {
    if (USE_MOCKS) return;
    return request(`/tax/profiles/${id}`, { method: 'DELETE' });
  },

  async exportTaxProfile(id: string): Promise<Blob> {
    if (USE_MOCKS) throw new Error(TAX_NEEDS_BACKEND);
    const res = await fetch(`${API_BASE_URL}/tax/profiles/${id}/export`, { credentials: 'include', headers: { 'X-FutureFork': '1' } });
    if (!res.ok) throw new ApiError('Export failed', res.status);
    return res.blob();
  },
};
