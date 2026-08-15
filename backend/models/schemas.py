"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class TowerType(str, Enum):
    ground = "ground"
    rooftop = "rooftop"
    wall_mount = "wall_mount"

class PropagationModel(str, Enum):
    fspl = "FSPL"
    okumura_hata = "Okumura-Hata"
    cost231 = "COST-231"

class CoverageClass(str, Enum):
    excellent = "excellent"
    good = "good"
    moderate = "moderate"
    weak = "weak"
    very_weak = "very_weak"
    no_coverage = "no_coverage"

class Environment(str, Enum):
    urban = "urban"
    suburban = "suburban"
    rural = "rural"


# ── Tower ─────────────────────────────────────────────────────────────────────

class TowerCreate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation_m: Optional[float] = None
    tower_type: TowerType = TowerType.ground
    height_m: float = Field(30.0, gt=0, le=200)
    operator_name: str = "BSNL"
    site_id: Optional[str] = None
    source: str = "manual"

class TowerResponse(BaseModel):
    id: int
    external_id: Optional[str]
    latitude: float
    longitude: float
    elevation_m: Optional[float]
    tower_type: Optional[str]
    height_m: Optional[float]
    operator_name: str
    operator_color: str
    site_id: Optional[str]
    source: str
    cell_count: int = 0

class TowerImportItem(BaseModel):
    latitude: float
    longitude: float
    elevation_m: Optional[float] = None
    tower_type: Optional[str] = "ground"
    height_m: Optional[float] = 30.0
    operator: Optional[str] = "Unknown"
    technology: Optional[str] = None
    band: Optional[str] = None
    frequency_mhz: Optional[float] = None
    azimuth: Optional[float] = None
    cell_id: Optional[str] = None
    site_id: Optional[str] = None


# ── Cell / Antenna ────────────────────────────────────────────────────────────

class CellCreate(BaseModel):
    tower_id: int
    cell_id: Optional[str] = None
    pci: Optional[int] = Field(None, ge=0, le=1007)
    technology_name: str = "4G"
    band_name: str = "B3"
    frequency_mhz: float = 1800.0
    earfcn: Optional[int] = None
    nrarfcn: Optional[int] = None
    azimuth: float = Field(0.0, ge=0, le=360)
    mechanical_tilt: float = Field(0.0, ge=-10, le=10)
    electrical_tilt: float = Field(0.0, ge=0, le=15)
    gain_dbi: float = Field(15.0, ge=0, le=30)
    horizontal_beamwidth: float = Field(65.0, ge=5, le=360)
    vertical_beamwidth: float = Field(7.0, ge=1, le=90)
    max_power_dbm: float = Field(43.0, ge=0, le=60)

class CellResponse(BaseModel):
    id: int
    tower_id: int
    cell_id: Optional[str]
    pci: Optional[int]
    technology_name: str
    band_name: str
    frequency_mhz: float
    earfcn: Optional[int]
    nrarfcn: Optional[int]
    azimuth: float
    mechanical_tilt: float
    electrical_tilt: float
    gain_dbi: float
    horizontal_beamwidth: float
    vertical_beamwidth: float
    max_power_dbm: float
    eirp_dbm: Optional[float]


# ── Crowdsourced Measurement ──────────────────────────────────────────────────

class MeasurementCreate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    operator_name: str = "BSNL"
    technology_name: str = "4G"
    band_name: Optional[str] = None
    rsrp: Optional[float] = Field(None, ge=-140, le=-30)
    rsrq: Optional[float] = Field(None, ge=-20, le=3)
    sinr: Optional[float] = Field(None, ge=-20, le=30)
    rssi: Optional[float] = Field(None, ge=-120, le=-10)
    cell_id: Optional[str] = None
    pci: Optional[int] = None
    earfcn: Optional[int] = None
    nrarfcn: Optional[int] = None
    device_model: Optional[str] = None
    timestamp: Optional[datetime] = None
    source: str = "manual"

class MeasurementResponse(BaseModel):
    id: int
    latitude: float
    longitude: float
    operator_name: str
    technology_name: str
    band_name: Optional[str]
    rsrp: Optional[float]
    rsrq: Optional[float]
    sinr: Optional[float]
    rssi: Optional[float]
    cell_id: Optional[str]
    pci: Optional[int]
    timestamp: Optional[str]
    quality: str
    color: str


# ── RF Simulation ─────────────────────────────────────────────────────────────

class RFSimulateRequest(BaseModel):
    """Request to simulate coverage for a proposed tower."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    height_m: float = Field(30.0, gt=0, le=200)
    frequency_mhz: float = Field(900.0, gt=0, le=6000)
    power_dbm: float = Field(43.0, ge=0, le=60)
    gain_dbi: float = Field(15.0, ge=0, le=30)
    azimuth: float = Field(0.0, ge=0, le=360)
    horizontal_beamwidth: float = Field(65.0, ge=5, le=360)
    vertical_beamwidth: float = Field(7.0, ge=1, le=90)
    mechanical_tilt: float = Field(0.0, ge=-10, le=10)
    electrical_tilt: float = Field(0.0, ge=0, le=15)
    propagation_model: PropagationModel = PropagationModel.okumura_hata
    environment: Environment = Environment.urban
    grid_steps: int = Field(50, ge=10, le=200)
    is_proposed: bool = True

class PointEstimateRequest(BaseModel):
    """Request RF estimation at a specific point."""
    tower_lat: float
    tower_lon: float
    tower_height_m: float = 30.0
    frequency_mhz: float = 900.0
    power_dbm: float = 43.0
    gain_dbi: float = 15.0
    azimuth: float = 0.0
    horizontal_beamwidth: float = 65.0
    electrical_tilt: float = 0.0
    mechanical_tilt: float = 0.0
    point_lat: float
    point_lon: float
    propagation_model: PropagationModel = PropagationModel.okumura_hata
    environment: Environment = Environment.urban

class RFPointResult(BaseModel):
    latitude: float
    longitude: float
    distance_km: float
    path_loss_db: float
    predicted_rsrp: float
    predicted_rssi: float
    predicted_rsrq: Optional[float] = None
    predicted_sinr: Optional[float] = None
    estimated_ta_us: Optional[float] = None
    coverage_class: str
    coverage_color: str
    serving_tower: Optional[str] = None
    neighbor_towers: List[dict] = []
    data_source: str = "MODEL PREDICTION"
    propagation_model: str
    environment: str
    antenna_gain_applied: float = 0.0
    obstruction_loss_db: float = 0.0


# ── Model Comparison ──────────────────────────────────────────────────────────

class ModelComparisonRequest(BaseModel):
    tower_lat: float
    tower_lon: float
    tower_height_m: float = 30.0
    frequency_mhz: float = 900.0
    power_dbm: float = 43.0
    gain_dbi: float = 15.0
    environment: Environment = Environment.urban
    grid_steps: int = 50

class ModelComparisonResult(BaseModel):
    model: str
    coverage_area_km2: float
    points_count: int
    avg_path_loss_db: float
    avg_rsrp: float
    min_rsrp: float
    max_rsrp: float


# ── AI Recommendations ────────────────────────────────────────────────────────

class AIRecommendation(BaseModel):
    category: str
    priority: str  # high, medium, low
    title: str
    description: str
    suggested_action: str
    location: Optional[dict] = None


# ── Import ────────────────────────────────────────────────────────────────────

class ImportResult(BaseModel):
    success: bool
    imported: int
    skipped: int
    errors: List[str]
    preview: Optional[List[dict]] = None


# ── Coverage Thresholds ───────────────────────────────────────────────────────

COVERAGE_THRESHOLDS = {
    CoverageClass.excellent: {"min_rsrp": -80, "color": "#22c55e", "label": "Excellent"},
    CoverageClass.good:      {"min_rsrp": -90, "color": "#84cc16", "label": "Good"},
    CoverageClass.moderate:  {"min_rsrp": -100, "color": "#eab308", "label": "Moderate"},
    CoverageClass.weak:      {"min_rsrp": -110, "color": "#f97316", "label": "Weak"},
    CoverageClass.very_weak: {"min_rsrp": -120, "color": "#ef4444", "label": "Very Weak"},
    CoverageClass.no_coverage: {"min_rsrp": -999, "color": "#7f1d1d", "label": "No Coverage"},
}

OPERATOR_COLORS = {
    "BSNL": "#f97316",
    "Jio": "#3b82f6",
    "Airtel": "#ef4444",
    "Vi": "#a855f7",
    "Other": "#6b7280",
    "Unknown": "#6b7280",
}

TOWER_TYPE_COLORS = {
    "ground": "#22c55e",
    "rooftop": "#3b82f6",
    "wall_mount": "#ec4899",
}


def classify_coverage(rsrp: float) -> tuple:
    """Return (coverage_class, color) for a given RSRP value."""
    for cls, info in COVERAGE_THRESHOLDS.items():
        if rsrp >= info["min_rsrp"]:
            return cls.value, info["color"]
    return CoverageClass.no_coverage.value, "#7f1d1d"
