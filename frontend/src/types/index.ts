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
  operator_name?: string;
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
  operator_name: string;
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
export type Technology = '2G' | '3G' | '4G' | '5G';

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

// ── Technology-Band-Frequency Mapping (Indian Telecom) ───────────────────────

export interface BandInfo {
  band: string;
  frequency_mhz: number;
  earfcn?: number;
  label: string;
}

export const TECHNOLOGY_BANDS: Record<string, BandInfo[]> = {
  '2G': [
    { band: 'B8', frequency_mhz: 900, label: '900 MHz (GSM)' },
    { band: 'B3', frequency_mhz: 1800, label: '1800 MHz (DCS)' },
  ],
  '3G': [
    { band: 'B1', frequency_mhz: 2100, label: '2100 MHz (UMTS)' },
    { band: 'B8', frequency_mhz: 900, label: '900 MHz (UMTS900)' },
    { band: 'B5', frequency_mhz: 850, label: '850 MHz (UMTS850)' },
  ],
  '4G': [
    { band: 'B1', frequency_mhz: 2100, label: '2100 MHz (LTE-FDD)' },
    { band: 'B3', frequency_mhz: 1800, label: '1800 MHz (LTE-FDD)' },
    { band: 'B5', frequency_mhz: 850, label: '850 MHz (LTE-FDD)' },
    { band: 'B8', frequency_mhz: 900, label: '900 MHz (LTE-FDD)' },
    { band: 'B40', frequency_mhz: 2300, label: '2300 MHz (LTE-TDD)' },
    { band: 'B41', frequency_mhz: 2500, label: '2500 MHz (LTE-TDD)' },
    { band: 'n28', frequency_mhz: 700, label: '700 MHz (LTE-FDD)' },
  ],
  '5G': [
    { band: 'n78', frequency_mhz: 3500, label: '3500 MHz (5G NR)' },
    { band: 'n28', frequency_mhz: 700, label: '700 MHz (5G NR)' },
    { band: 'n258', frequency_mhz: 26000, label: '26 GHz (5G mmWave)' },
  ],
};

export const TECHNOLOGIES = Object.keys(TECHNOLOGY_BANDS) as Technology[];

/** Get bands available for a given technology */
export function getBandsForTechnology(tech: string): BandInfo[] {
  return TECHNOLOGY_BANDS[tech] || [];
}

/** Get the default band for a technology */
export function getDefaultBand(tech: string): BandInfo {
  const bands = TECHNOLOGY_BANDS[tech];
  return bands ? bands[0] : { band: 'B8', frequency_mhz: 900, label: '900 MHz' };
}

// ── Quick Estimate Band Defaults (Indian Macro Cell) ─────────────────────────

export interface QuickEstimateDefaults {
  freq: number;
  height: number;
  power: number;
  gain: number;
  label: string;
  maxRangeKm: number;  // Practical max range for Indian conditions
}

export const QUICK_ESTIMATE_DEFAULTS: Record<string, QuickEstimateDefaults> = {
  // 2G
  'B8-2G':  { freq: 900,  height: 35, power: 43, gain: 15, label: '900 MHz GSM',  maxRangeKm: 3.0 },
  'B3-2G':  { freq: 1800, height: 30, power: 43, gain: 15, label: '1800 MHz DCS', maxRangeKm: 2.0 },
  // 3G
  'B1-3G':  { freq: 2100, height: 30, power: 40, gain: 15, label: '2100 MHz UMTS', maxRangeKm: 2.0 },
  'B8-3G':  { freq: 900,  height: 35, power: 40, gain: 15, label: '900 MHz UMTS',  maxRangeKm: 3.0 },
  'B5-3G':  { freq: 850,  height: 35, power: 40, gain: 15, label: '850 MHz UMTS',  maxRangeKm: 3.0 },
  // 4G
  'n28-4G': { freq: 700,  height: 35, power: 43, gain: 17, label: '700 MHz LTE',  maxRangeKm: 2.5 },
  'B8-4G':  { freq: 900,  height: 35, power: 43, gain: 15, label: '900 MHz LTE',  maxRangeKm: 2.5 },
  'B5-4G':  { freq: 850,  height: 35, power: 43, gain: 15, label: '850 MHz LTE',  maxRangeKm: 2.5 },
  'B1-4G':  { freq: 2100, height: 30, power: 40, gain: 15, label: '2100 MHz LTE', maxRangeKm: 1.8 },
  'B3-4G':  { freq: 1800, height: 30, power: 43, gain: 15, label: '1800 MHz LTE', maxRangeKm: 2.0 },
  'B40-4G': { freq: 2300, height: 25, power: 40, gain: 12, label: '2300 MHz LTE', maxRangeKm: 1.5 },
  'B41-4G': { freq: 2500, height: 25, power: 40, gain: 12, label: '2500 MHz LTE', maxRangeKm: 1.2 },
  // 5G
  'n78-5G':  { freq: 3500,  height: 25, power: 40, gain: 15, label: '3500 MHz NR',  maxRangeKm: 1.0 },
  'n28-5G':  { freq: 700,   height: 35, power: 43, gain: 17, label: '700 MHz NR',   maxRangeKm: 2.0 },
};

export const MODELS: PropagationModel[] = ['FSPL', 'Okumura-Hata', 'COST-231'];
export const ENVIRONMENTS: Environment[] = ['urban', 'suburban', 'rural'];
