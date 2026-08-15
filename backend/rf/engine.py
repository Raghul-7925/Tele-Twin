"""
RF Propagation Engine.

Central module that orchestrates all RF calculations:
- Selects propagation model based on frequency/parameters
- Calculates path loss with terrain/building obstruction
- Computes received signal metrics (RSRP, RSRQ, SINR, RSSI)
- Handles multi-tower analysis and serving cell selection
- Supports antenna pattern calculations
"""
import math
from typing import List, Optional, Dict, Tuple

from .fspl import calculate_fspl, validate_fspl
from .okumura_hata import calculate_okumura_hata, validate_okumura_hata
from .cost231 import calculate_cost231, validate_cost231
from .antenna import (
    calculate_eirp,
    calculate_3d_antenna_gain,
    calculate_elevation_angle,
    calculate_timing_advance,
)


# ── Constants ─────────────────────────────────────────────────────────────────

# Mobile device parameters (typical smartphone)
MOBILE_HEIGHT_M = 1.5
MOBILE_RX_GAIN_DBI = 0.0
NOISE_FLOOR_DBM = -104.0  # Typical thermal noise + NF for LTE

# Coverage class thresholds (RSRP in dBm)
COVERAGE_THRESHOLDS = [
    (-80, "excellent", "#22c55e"),
    (-90, "good", "#84cc16"),
    (-100, "moderate", "#eab308"),
    (-110, "weak", "#f97316"),
    (-120, "very_weak", "#ef4444"),
    (-999, "no_coverage", "#7f1d1d"),
]


def classify_rsrp(rsrp: float) -> Tuple[str, str]:
    """Return (class_name, color) for given RSRP."""
    for threshold, name, color in COVERAGE_THRESHOLDS:
        if rsrp >= threshold:
            return name, color
    return "no_coverage", "#7f1d1d"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


def calculate_azimuth(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate azimuth from point 1 to point 2 in degrees (0-360)."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlon_r = math.radians(lon2 - lon1)

    x = math.sin(dlon_r) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon_r)

    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def select_propagation_model(
    frequency_mhz: float,
    requested_model: str = "auto",
) -> str:
    """
    Select the best propagation model based on frequency.

    Auto-selection logic:
    - 150-1500 MHz: Okumura-Hata
    - 1500-2000 MHz: COST-231 Hata
    - Any frequency: FSPL always available as fallback
    """
    if requested_model != "auto":
        return requested_model

    if 150 <= frequency_mhz <= 1500:
        return "Okumura-Hata"
    elif 1500 < frequency_mhz <= 2000:
        return "COST-231"
    elif frequency_mhz > 2000:
        return "FSPL"  # No empirical model valid above 2 GHz for Hata
    else:
        return "Okumura-Hata"


def estimate_rsrq(rsrp: float, num_neighbors: int = 0) -> float:
    """
    Estimate RSRQ from RSRP.

    RSRQ = N * RSRP / RSSI (per 3GPP definition)
    Simplified estimation: RSRQ ≈ RSRP - RSSI + 10*log10(N)

    NOTE: This is an ESTIMATE. Real RSRQ requires actual RSSI measurement.
    """
    # Simplified: RSRQ is typically -8 to -15 dB in decent conditions
    # Worst case: proportional to number of interfering neighbors
    base_rsrq = -10.0  # Typical good condition
    neighbor_penalty = min(num_neighbors * 1.5, 6.0)
    return round(base_rsrq - neighbor_penalty, 1)


def estimate_sinr(rsrp: float, neighbor_rsrp_list: List[float]) -> float:
    """
    Estimate SINR from serving RSRP and neighbor RSRP values.

    SINR ≈ RSRP_serving - 10*log10(sum(10^(RSRP_i/10)) + N0)

    NOTE: This is a SIMPLIFIED estimation, not a full 3GPP simulation.
    """
    # Convert serving signal to linear
    serving_linear = 10 ** (rsrp / 10)

    # Sum interference from neighbors
    interference_linear = sum(10 ** (n / 10) for n in neighbor_rsrp_list)

    # Noise floor
    noise_linear = 10 ** (NOISE_FLOOR_DBM / 10)

    # SINR
    sinr_linear = serving_linear / (interference_linear + noise_linear + 1e-12)
    sinr_db = 10 * math.log10(max(sinr_linear, 1e-12))

    return round(sinr_db, 1)


def estimate_rssi(rsrp: float, bandwidth_mhz: float = 10.0) -> float:
    """
    Estimate RSSI from RSRP.

    RSSI ≈ RSRP + 10*log10(N_RB * 12) for LTE
    Simplified: RSSI ≈ RSRP + 10*log10(bandwidth_MHz * 1000 / 15)

    NOTE: This is an ESTIMATE. Real RSSI includes all received power.
    """
    # Simplified estimation
    rssi = rsrp + 10 * math.log10(max(bandwidth_mhz, 1.0)) + 3
    return round(rssi, 1)


def calculate_path_loss(
    frequency_mhz: float,
    base_height_m: float,
    distance_km: float,
    model: str = "Okumura-Hata",
    environment: str = "urban",
    mobile_height_m: float = MOBILE_HEIGHT_M,
    obstruction_loss_db: float = 0.0,
) -> Tuple[float, dict]:
    """
    Calculate path loss using the specified model.

    Returns (path_loss_db, model_info_dict).
    """
    model_info = {"model": model, "environment": environment}

    if model == "FSPL":
        pl = calculate_fspl(frequency_mhz, distance_km)
        validation = validate_fspl(frequency_mhz, distance_km)
        model_info.update(validation)

    elif model == "Okumura-Hata":
        pl = calculate_okumura_hata(
            frequency_mhz, base_height_m, mobile_height_m, distance_km, environment
        )
        validation = validate_okumura_hata(frequency_mhz, base_height_m, mobile_height_m, distance_km)
        model_info.update(validation)

    elif model == "COST-231":
        pl = calculate_cost231(
            frequency_mhz, base_height_m, mobile_height_m, distance_km, environment
        )
        validation = validate_cost231(frequency_mhz, base_height_m, mobile_height_m, distance_km)
        model_info.update(validation)

    else:
        # Fallback to FSPL
        pl = calculate_fspl(frequency_mhz, distance_km)
        model_info["model"] = "FSPL (fallback)"

    # Add obstruction loss
    pl += obstruction_loss_db

    return pl, model_info


def calculate_point_estimate(
    tower_lat: float,
    tower_lon: float,
    tower_height_m: float,
    frequency_mhz: float,
    power_dbm: float,
    gain_dbi: float,
    azimuth: float = 0.0,
    horizontal_beamwidth: float = 65.0,
    vertical_beamwidth: float = 7.0,
    electrical_tilt: float = 0.0,
    mechanical_tilt: float = 0.0,
    point_lat: float = 0.0,
    point_lon: float = 0.0,
    model: str = "Okumura-Hata",
    environment: str = "urban",
    obstruction_loss_db: float = 0.0,
    bandwidth_mhz: float = 10.0,
    neighbor_rsrp_list: Optional[List[float]] = None,
) -> dict:
    """
    Calculate predicted RF values at a specific point from a tower.

    Returns a dict with all predicted values, clearly labeled as PREDICTIONS.
    """
    # Distance and azimuth
    distance_km = haversine_km(tower_lat, tower_lon, point_lat, point_lon)
    if distance_km < 0.01:
        distance_km = 0.01

    azimuth_to_point = calculate_azimuth(tower_lat, tower_lon, point_lat, point_lon)
    azimuth_diff = azimuth_to_point - azimuth
    if azimuth_diff > 180:
        azimuth_diff -= 360
    elif azimuth_diff < -180:
        azimuth_diff += 360

    # Elevation angle
    elevation_angle = calculate_elevation_angle(tower_height_m, 0.0, distance_km)

    # Antenna pattern gain
    antenna_gain = calculate_3d_antenna_gain(
        azimuth_diff=azimuth_diff,
        elevation_angle=elevation_angle,
        max_gain_dbi=gain_dbi,
        horizontal_beamwidth=horizontal_beamwidth,
        vertical_beamwidth=vertical_beamwidth,
        electrical_tilt=electrical_tilt,
        mechanical_tilt=mechanical_tilt,
    )

    # Path loss
    path_loss, model_info = calculate_path_loss(
        frequency_mhz=frequency_mhz,
        base_height_m=tower_height_m,
        distance_km=distance_km,
        model=model,
        environment=environment,
        obstruction_loss_db=obstruction_loss_db,
    )

    # EIRP
    eirp = calculate_eirp(power_dbm, gain_dbi)

    # Predicted RSRP = EIRP - path_loss + antenna_pattern_gain
    # Note: EIRP already includes max gain, so antenna_gain gives the pattern reduction
    # We use: RSRP = power + antenna_gain (pattern-adjusted) - path_loss
    predicted_rsrp = power_dbm + antenna_gain - path_loss

    # Other predictions
    predicted_rssi = estimate_rssi(predicted_rsrp, bandwidth_mhz)
    predicted_rsrq = estimate_rsrq(predicted_rsrp)
    predicted_sinr = estimate_sinr(predicted_rsrp, neighbor_rsrp_list or [])

    # Timing Advance (estimated)
    ta = calculate_timing_advance(distance_km, "4G")

    # Coverage classification
    coverage_class, coverage_color = classify_rsrp(predicted_rsrp)

    return {
        "latitude": point_lat,
        "longitude": point_lon,
        "distance_km": round(distance_km, 3),
        "azimuth_from_tower": round(azimuth_to_point, 1),
        "azimuth_diff": round(azimuth_diff, 1),
        "elevation_angle": round(elevation_angle, 1),
        "antenna_gain_applied": round(antenna_gain, 1),
        "path_loss_db": round(path_loss, 1),
        "eirp_dbm": round(eirp, 1),
        "obstruction_loss_db": obstruction_loss_db,
        "predicted_rsrp": round(predicted_rsrp, 1),
        "predicted_rssi": round(predicted_rssi, 1),
        "predicted_rsrq": predicted_rsrq,
        "predicted_sinr": predicted_sinr,
        "estimated_ta_us": ta,
        "coverage_class": coverage_class,
        "coverage_color": coverage_color,
        "data_source": "MODEL PREDICTION",
        "propagation_model": model_info.get("model", model),
        "environment": environment,
        "model_info": model_info,
    }


def generate_coverage_grid(
    tower_lat: float,
    tower_lon: float,
    tower_height_m: float,
    frequency_mhz: float,
    power_dbm: float,
    gain_dbi: float,
    azimuth: float = 0.0,
    horizontal_beamwidth: float = 65.0,
    vertical_beamwidth: float = 7.0,
    electrical_tilt: float = 0.0,
    mechanical_tilt: float = 0.0,
    model: str = "Okumura-Hata",
    environment: str = "urban",
    grid_steps: int = 50,
    max_range_km: Optional[float] = None,
    obstruction_loss_db: float = 0.0,
) -> List[dict]:
    """
    Generate a coverage heatmap grid around a tower.

    Returns a list of point estimates covering the area.
    Only includes points with predicted RSRP >= -120 dBm.
    """
    # Estimate max range based on frequency
    if max_range_km is None:
        if frequency_mhz <= 700:
            max_range_km = 25
        elif frequency_mhz <= 900:
            max_range_km = 20
        elif frequency_mhz <= 1800:
            max_range_km = 12
        elif frequency_mhz <= 2100:
            max_range_km = 8
        else:
            max_range_km = 5

    points = []
    lat_offset = max_range_km / 111.0
    lon_offset = max_range_km / (111.0 * math.cos(math.radians(tower_lat)))

    for i in range(grid_steps):
        for j in range(grid_steps):
            plat = tower_lat - lat_offset + i * (2 * lat_offset) / grid_steps
            plon = tower_lon - lon_offset + j * (2 * lon_offset) / grid_steps

            result = calculate_point_estimate(
                tower_lat=tower_lat,
                tower_lon=tower_lon,
                tower_height_m=tower_height_m,
                frequency_mhz=frequency_mhz,
                power_dbm=power_dbm,
                gain_dbi=gain_dbi,
                azimuth=azimuth,
                horizontal_beamwidth=horizontal_beamwidth,
                vertical_beamwidth=vertical_beamwidth,
                electrical_tilt=electrical_tilt,
                mechanical_tilt=mechanical_tilt,
                point_lat=plat,
                point_lon=plon,
                model=model,
                environment=environment,
                obstruction_loss_db=obstruction_loss_db,
            )

            # Only include points with some coverage
            if result["predicted_rsrp"] >= -120:
                points.append(result)

    return points
