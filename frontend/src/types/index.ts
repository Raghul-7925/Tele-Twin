// ── Tower Types ──────────────────────────────────────────────────────────────

export type TowerType = 'ground' | 'rooftop' | 'wall_mount';

export interface Tower {
  id: number;
  external_id?: string;
  latitude: number;
  longitude: number;
  elevation_m?: number;
  tower_type: TowerType;
  height_m: number;
  operator_name: string;
  operator_color: string;
  site_id?: string;
  source: string;
  cell_count: number;
}

export interface TowerCreate {
  latitude: number;
  longitude: number;
  elevation_m?: number;
  tower_type: TowerType;
  height_m: number;
  operator_name: string;
  source?: string;
}

// ── Cell Types ───────────────────────────────────────────────────────────────

export interface Cell {
  id: number;
  tower_id: number;
  cell_id?: string;
  pci?: number;
  technology_name: string;
  band_name: string;
  frequency_mhz: number;
  earfcn?: number;
  nrarfcn?: number;
  azimuth: number;
  mechanical_tilt: number;
  electrical_tilt: number;
  gain_dbi: number;
  horizontal_beamwidth: number;
  vertical_beamwidth: number;
  max_power_dbm: number;
  eirp_dbm?: number;
}

export interface CellCreate {
  tower_id: number;
  technology_name: string;
  band_name: string;
  frequency_mhz: number;
  azimuth?: number;
  gain_dbi?: number;
  max_power_dbm?: number;
}

// ── Measurement Types ────────────────────────────────────────────────────────

export interface Measurement {
  id: number;
  latitude: number;
  longitude: number;
  operator_name: string;
  technology_name: string;
  band_name?: string;
  rsrp?: number;
  rsrq?: number;
  sinr?: number;
  rssi?: number;
  cell_id?: string;
  pci?: number;
  timestamp?: string;
  quality: string;
  color: string;
}

export interface MeasurementCreate {
  latitude: number;
  longitude: number;
  operator_name: string;
  technology_name: string;
  rsrp?: number;
  rsrq?: number;
  sinr?: number;
  rssi?: number;
}

// ── RF Types ─────────────────────────────────────────────────────────────────

export type PropagationModel = 'FSPL' | 'Okumura-Hata' | 'COST-231';
export type Environment = 'urban' | 'suburban' | 'rural';

export interface RFSimulateRequest {
  latitude: number;
  longitude: number;
  height_m: number;
  frequency_mhz: number;
  power_dbm: number;
  gain_dbi: number;
  azimuth: number;
  horizontal_beamwidth: number;
  vertical_beamwidth: number;
  electrical_tilt: number;
  mechanical_tilt: number;
  propagation_model: PropagationModel;
  environment: Environment;
  grid_steps: number;
  is_proposed: boolean;
}

export interface RFPointResult {
  latitude: number;
  longitude: number;
  distance_km: number;
  path_loss_db: number;
  predicted_rsrp: number;
  predicted_rssi: number;
  predicted_rsrq?: number;
  predicted_sinr?: number;
  estimated_ta_us?: number;
  coverage_class: string;
  coverage_color: string;
  serving_tower?: string;
  neighbor_towers: object[];
  data_source: string;
  propagation_model: string;
  environment: string;
  antenna_gain_applied: number;
  obstruction_loss_db: number;
}

// ── AI Types ─────────────────────────────────────────────────────────────────

export interface AIRecommendation {
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggested_action: string;
  location?: { lat: number; lon: number };
}

// ── Import Types ─────────────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

// ── Model Comparison ─────────────────────────────────────────────────────────

export interface ModelComparisonResult {
  model: string;
  coverage_area_km2: number;
  points_count: number;
  avg_path_loss_db: number;
  avg_rsrp: number;
  min_rsrp: number;
  max_rsrp: number;
}

// ── Operator / Color Maps ────────────────────────────────────────────────────

export const OPERATOR_COLORS: Record<string, string> = {
  BSNL: '#f97316',
  Jio: '#3b82f6',
  Airtel: '#ef4444',
  Vi: '#a855f7',
  Other: '#6b7280',
  Unknown: '#6b7280',
};

export const TOWER_TYPE_COLORS: Record<string, string> = {
  ground: '#22c55e',
  rooftop: '#3b82f6',
  wall_mount: '#ec4899',
};

export const OPERATORS = ['BSNL', 'Jio', 'Airtel', 'Vi', 'Other'];
export const TECHNOLOGIES = ['2G', '3G', '4G', '5G'];
export const BANDS = ['B1', 'B3', 'B5', 'B8', 'B40', 'B41', 'n28', 'n78'];
export const FREQUENCIES = [700, 850, 900, 1800, 2100, 2300, 2500, 3500];
export const MODELS: PropagationModel[] = ['FSPL', 'Okumura-Hata', 'COST-231'];
export const ENVIRONMENTS: Environment[] = ['urban', 'suburban', 'rural'];
