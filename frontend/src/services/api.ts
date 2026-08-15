/**
 * API Service for Tele-Twin backend communication.
 */
import axios from 'axios';
import {
  Tower, TowerCreate, Cell, Measurement, MeasurementCreate,
  RFSimulateRequest, RFPointResult, AIRecommendation,
  ImportResult, ModelComparisonResult, PropagationModel, Environment,
} from '../types';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API });

// ── Health ───────────────────────────────────────────────────────────────────

export const getHealth = () => api.get('/api/health');

// ── Towers ───────────────────────────────────────────────────────────────────

export const getTowers = (operator?: string, technology?: string, towerType?: string) => {
  const params: any = {};
  if (operator) params.operator = operator;
  if (technology) params.technology = technology;
  if (towerType) params.tower_type = towerType;
  return api.get<Tower[]>('/api/towers', { params });
};

export const addTower = (tower: TowerCreate) =>
  api.post('/api/towers', tower);

export const deleteTower = (id: number) =>
  api.delete(`/api/towers/${id}`);

// ── Cells ────────────────────────────────────────────────────────────────────

export const getCells = (towerId?: number) =>
  api.get<Cell[]>('/api/cells', { params: towerId ? { tower_id: towerId } : {} });

export const addCell = (cell: any) =>
  api.post('/api/cells', cell);

// ── Operators / Technologies / Bands ─────────────────────────────────────────

export const getOperators = () => api.get('/api/operators');
export const getTechnologies = () => api.get('/api/technologies');
export const getBands = (technology?: string) =>
  api.get('/api/bands', { params: technology ? { technology } : {} });

// ── Measurements ─────────────────────────────────────────────────────────────

export const getMeasurements = (limit = 500) =>
  api.get<Measurement[]>('/api/measurements', { params: { limit } });

export const addMeasurement = (m: MeasurementCreate) =>
  api.post('/api/measurements', m);

// ── RF Simulation ────────────────────────────────────────────────────────────

export const rfQuickEstimate = (band: string, environment: string, lat: number, lon: number) =>
  api.post('/api/rf/quick-estimate', null, { params: { band, environment, lat, lon } });

export const rfSimulate = (req: RFSimulateRequest) =>
  api.post<{ count: number; points: RFPointResult[]; model: string; environment: string; is_proposed: boolean }>('/api/rf/simulate', req);

export const rfPointEstimate = (req: any) =>
  api.post<RFPointResult>('/api/rf/point-estimate', req);

export const rfCompareModels = (req: any) =>
  api.post<ModelComparisonResult[]>('/api/rf/compare-models', req);

export const getCoverageAll = (model = 'Okumura-Hata', environment = 'urban') =>
  api.get<{ count: number; points: RFPointResult[] }>('/api/coverage/all', {
    params: { model, environment },
  });

// ── Import ───────────────────────────────────────────────────────────────────

export const importTowers = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportResult>('/api/import/towers', form);
};

export const importMeasurements = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportResult>('/api/import/measurements', form);
};

// ── AI ───────────────────────────────────────────────────────────────────────

export const getRecommendations = () =>
  api.get<AIRecommendation[]>('/api/ai/recommendations');

// ── Analysis ─────────────────────────────────────────────────────────────────

export const getPredictionVsMeasurement = () =>
  api.get('/api/analysis/prediction-vs-measurement');

export default api;
