"""
API routes for Tele-Twin.
"""
import json
import sqlite3
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from typing import Optional

from ..database.schema import get_connection
from ..models.schemas import (
    TowerCreate, TowerResponse, CellCreate, CellResponse,
    MeasurementCreate, MeasurementResponse,
    RFSimulateRequest, PointEstimateRequest, RFPointResult,
    ModelComparisonRequest, ModelComparisonResult,
    ImportResult, AIRecommendation,
    PropagationModel, Environment,
    OPERATOR_COLORS, TOWER_TYPE_COLORS, classify_coverage,
)
from ..rf.engine import (
    calculate_point_estimate, generate_coverage_grid,
    haversine_km, select_propagation_model, classify_rsrp,
)
from ..rf.fspl import calculate_fspl
from ..rf.okumura_hata import calculate_okumura_hata
from ..rf.cost231 import calculate_cost231
from ..imports.importer import (
    import_towers_csv, import_towers_json, import_towers_geojson,
    import_measurements_csv, import_measurements_json, import_measurements_geojson,
)
from ..services.ai_service import (
    analyze_coverage_gaps, analyze_tower_density,
    generate_recommendations,
)

router = APIRouter(prefix="/api")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tower_to_response(row) -> dict:
    con = get_connection()
    cur = con.cursor()
    cur.execute("SELECT name FROM operators WHERE id = ?", (row["operator_id"],))
    op_row = cur.fetchone()
    op_name = op_row[0] if op_row else "Unknown"
    cur.execute("SELECT COUNT(*) FROM cells WHERE tower_id = ?", (row["id"],))
    cell_count = cur.fetchone()[0]
    con.close()
    return {
        "id": row["id"],
        "external_id": row["external_id"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "elevation_m": row["elevation_m"],
        "tower_type": row["tower_type"],
        "height_m": row["height_m"],
        "operator_name": op_name,
        "operator_color": OPERATOR_COLORS.get(op_name, "#6b7280"),
        "site_id": row["site_id"],
        "source": row["source"],
        "cell_count": cell_count,
    }


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok", "project": "Tele-Twin", "version": "2.0.0"}


# ── Towers ────────────────────────────────────────────────────────────────────

@router.get("/towers")
def get_towers(operator: Optional[str] = None, technology: Optional[str] = None,
               tower_type: Optional[str] = None):
    con = get_connection()
    cur = con.cursor()

    query = "SELECT * FROM towers WHERE 1=1"
    params = []

    if operator:
        cur.execute("SELECT id FROM operators WHERE name = ?", (operator,))
        op_row = cur.fetchone()
        if op_row:
            query += " AND operator_id = ?"
            params.append(op_row[0])

    if tower_type:
        query += " AND tower_type = ?"
        params.append(tower_type)

    cur.execute(query, params)
    rows = cur.fetchall()
    con.close()

    return [_tower_to_response(r) for r in rows]


@router.post("/towers")
def add_tower(t: TowerCreate):
    con = get_connection()
    cur = con.cursor()

    # Get or create operator
    cur.execute("SELECT id FROM operators WHERE name = ?", (t.operator_name,))
    op_row = cur.fetchone()
    if op_row:
        operator_id = op_row[0]
    else:
        cur.execute("INSERT INTO operators (name) VALUES (?)", (t.operator_name,))
        operator_id = cur.lastrowid

    cur.execute("""
        INSERT INTO towers (latitude, longitude, elevation_m, tower_type, height_m, operator_id, site_id, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (t.latitude, t.longitude, t.elevation_m, t.tower_type.value, t.height_m,
          operator_id, t.site_id, t.source))
    tower_id = cur.lastrowid
    con.commit()
    con.close()
    return {"id": tower_id, "message": "Tower added"}


@router.delete("/towers/{tower_id}")
def delete_tower(tower_id: int):
    con = get_connection()
    con.execute("DELETE FROM towers WHERE id = ?", (tower_id,))
    con.commit()
    con.close()
    return {"message": "Deleted"}


# ── Cells ─────────────────────────────────────────────────────────────────────

@router.get("/cells")
def get_cells(tower_id: Optional[int] = None):
    con = get_connection()
    cur = con.cursor()
    if tower_id:
        cur.execute("""
            SELECT c.*, t.name as tech_name, b.name as band_name, b.frequency_mhz as band_freq
            FROM cells c
            LEFT JOIN technologies t ON c.technology_id = t.id
            LEFT JOIN bands b ON c.band_id = b.id
            WHERE c.tower_id = ?
        """, (tower_id,))
    else:
        cur.execute("""
            SELECT c.*, t.name as tech_name, b.name as band_name, b.frequency_mhz as band_freq
            FROM cells c
            LEFT JOIN technologies t ON c.technology_id = t.id
            LEFT JOIN bands b ON c.band_id = b.id
        """)
    rows = cur.fetchall()
    con.close()
    return [dict(r) for r in rows]


@router.post("/cells")
def add_cell(c: CellCreate):
    con = get_connection()
    cur = con.cursor()

    cur.execute("SELECT id FROM technologies WHERE name = ?", (c.technology_name,))
    tech_row = cur.fetchone()
    tech_id = tech_row[0] if tech_row else None

    cur.execute("SELECT id FROM bands WHERE name = ? AND frequency_mhz = ?", (c.band_name, c.frequency_mhz))
    band_row = cur.fetchone()
    band_id = band_row[0] if band_row else None

    eirp = c.max_power_dbm + c.gain_dbi

    cur.execute("""
        INSERT INTO cells (tower_id, cell_id, pci, technology_id, band_id, earfcn, nrarfcn,
                          azimuth, mechanical_tilt, electrical_tilt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (c.tower_id, c.cell_id, c.pci, tech_id, band_id, c.earfcn, c.nrarfcn,
          c.azimuth, c.mechanical_tilt, c.electrical_tilt))
    cell_id = cur.lastrowid

    cur.execute("""
        INSERT INTO antennas (cell_id, gain_dbi, horizontal_beamwidth, vertical_beamwidth,
                             max_power_dbm, eirp_dbm, height_m)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (cell_id, c.gain_dbi, c.horizontal_beamwidth, c.vertical_beamwidth,
          c.max_power_dbm, eirp, None))

    con.commit()
    con.close()
    return {"id": cell_id, "message": "Cell added"}


# ── Operators / Technologies / Bands ──────────────────────────────────────────

@router.get("/operators")
def get_operators():
    con = get_connection()
    rows = con.execute("SELECT * FROM operators").fetchall()
    con.close()
    return [dict(r) for r in rows]


@router.get("/technologies")
def get_technologies():
    con = get_connection()
    rows = con.execute("SELECT * FROM technologies").fetchall()
    con.close()
    return [dict(r) for r in rows]


@router.get("/bands")
def get_bands(technology: Optional[str] = None):
    con = get_connection()
    if technology:
        rows = con.execute("""
            SELECT b.*, t.name as technology_name FROM bands b
            JOIN technologies t ON b.technology_id = t.id
            WHERE t.name = ?
        """, (technology,)).fetchall()
    else:
        rows = con.execute("""
            SELECT b.*, t.name as technology_name FROM bands b
            LEFT JOIN technologies t ON b.technology_id = t.id
        """).fetchall()
    con.close()
    return [dict(r) for r in rows]


# ── Crowdsourced Measurements ─────────────────────────────────────────────────

@router.get("/measurements")
def get_measurements(limit: int = 500):
    con = get_connection()
    cur = con.cursor()
    cur.execute("""
        SELECT m.*, o.name as operator_name, t.name as technology_name
        FROM crowdsourced_measurements m
        LEFT JOIN operators o ON m.operator_id = o.id
        LEFT JOIN technologies t ON m.technology_id = t.id
        ORDER BY m.id DESC LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    con.close()

    results = []
    for r in rows:
        quality, color = classify_coverage(r["rsrp"]) if r["rsrp"] else ("unknown", "#6b7280")
        results.append({
            **dict(r),
            "quality": quality,
            "color": color,
        })
    return results


@router.post("/measurements")
def add_measurement(m: MeasurementCreate):
    con = get_connection()
    cur = con.cursor()

    cur.execute("SELECT id FROM operators WHERE name = ?", (m.operator_name,))
    op_row = cur.fetchone()
    operator_id = op_row[0] if op_row else None

    cur.execute("SELECT id FROM technologies WHERE name = ?", (m.technology_name,))
    tech_row = cur.fetchone()
    tech_id = tech_row[0] if tech_row else None

    cur.execute("""
        INSERT INTO crowdsourced_measurements
        (latitude, longitude, operator_id, technology_id, band_name, rsrp, rsrq, sinr, rssi,
         cell_id, pci, earfcn, nrarfcn, device_model, timestamp, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (m.latitude, m.longitude, operator_id, tech_id, m.band_name,
          m.rsrp, m.rsrq, m.sinr, m.rssi, m.cell_id, m.pci, m.earfcn, m.nrarfcn,
          m.device_model, m.timestamp, m.source))

    con.commit()
    con.close()
    quality, _ = classify_coverage(m.rsrp) if m.rsrp else ("unknown", "#6b7280")
    return {"message": "Measurement submitted", "quality": quality}


# ── RF Simulation ─────────────────────────────────────────────────────────────

@router.post("/rf/simulate")
def rf_simulate(req: RFSimulateRequest):
    """Generate coverage heatmap for a proposed tower."""
    model = select_propagation_model(req.frequency_mhz, req.propagation_model.value)

    points = generate_coverage_grid(
        tower_lat=req.latitude,
        tower_lon=req.longitude,
        tower_height_m=req.height_m,
        frequency_mhz=req.frequency_mhz,
        power_dbm=req.power_dbm,
        gain_dbi=req.gain_dbi,
        azimuth=req.azimuth,
        horizontal_beamwidth=req.horizontal_beamwidth,
        vertical_beamwidth=req.vertical_beamwidth,
        electrical_tilt=req.electrical_tilt,
        mechanical_tilt=req.mechanical_tilt,
        model=model,
        environment=req.environment.value,
        grid_steps=req.grid_steps,
    )

    return {
        "count": len(points),
        "points": points,
        "model": model,
        "environment": req.environment.value,
        "is_proposed": req.is_proposed,
    }


@router.post("/rf/point-estimate")
def rf_point_estimate(req: PointEstimateRequest):
    """Calculate RF values at a specific point."""
    model = select_propagation_model(req.frequency_mhz, req.propagation_model.value)

    result = calculate_point_estimate(
        tower_lat=req.tower_lat,
        tower_lon=req.tower_lon,
        tower_height_m=req.tower_height_m,
        frequency_mhz=req.frequency_mhz,
        power_dbm=req.power_dbm,
        gain_dbi=req.gain_dbi,
        azimuth=req.azimuth,
        horizontal_beamwidth=req.horizontal_beamwidth,
        electrical_tilt=req.electrical_tilt,
        mechanical_tilt=req.mechanical_tilt,
        point_lat=req.point_lat,
        point_lon=req.point_lon,
        model=model,
        environment=req.environment.value,
    )

    return result


@router.post("/rf/compare-models")
def rf_compare_models(req: ModelComparisonRequest):
    """Compare different propagation models for the same tower configuration."""
    models = ["FSPL", "Okumura-Hata", "COST-231"]
    results = []

    for model in models:
        try:
            points = generate_coverage_grid(
                tower_lat=req.tower_lat,
                tower_lon=req.tower_lon,
                tower_height_m=req.tower_height_m,
                frequency_mhz=req.frequency_mhz,
                power_dbm=req.power_dbm,
                gain_dbi=req.gain_dbi,
                model=model,
                environment=req.environment.value,
                grid_steps=req.grid_steps,
            )

            if points:
                rsrp_values = [p["predicted_rsrp"] for p in points]
                avg_pl = sum(p["path_loss_db"] for p in points) / len(points)

                # Estimate coverage area (each grid cell covers ~area)
                total_range = 20  # km
                cell_area = (2 * total_range / req.grid_steps) ** 2
                coverage_area = len(points) * cell_area

                results.append({
                    "model": model,
                    "coverage_area_km2": round(coverage_area, 2),
                    "points_count": len(points),
                    "avg_path_loss_db": round(avg_pl, 1),
                    "avg_rsrp": round(sum(rsrp_values) / len(rsrp_values), 1),
                    "min_rsrp": round(min(rsrp_values), 1),
                    "max_rsrp": round(max(rsrp_values), 1),
                })
        except Exception as e:
            results.append({"model": model, "error": str(e)})

    return results


# ── Coverage for all towers ──────────────────────────────────────────────────

@router.post("/rf/quick-estimate")
def rf_quick_estimate(band: str = "B8", environment: str = "urban", lat: float = 11.94, lon: float = 79.81):
    """
    Quick coverage estimate using only band name.
    Auto-fills typical Indian macro cell defaults.
    """
    from ..rf.engine import select_propagation_model

    # Band → frequency mapping with typical Indian parameters
    band_defaults = {
        "n28": {"freq": 700, "height": 40, "power": 43, "gain": 17, "label": "700 MHz (5G NR)"},
        "B5":  {"freq": 850, "height": 35, "power": 43, "gain": 15, "label": "850 MHz"},
        "B8":  {"freq": 900, "height": 30, "power": 43, "gain": 15, "label": "900 MHz"},
        "B3":  {"freq": 1800, "height": 30, "power": 43, "gain": 15, "label": "1800 MHz"},
        "B1":  {"freq": 2100, "height": 25, "power": 40, "gain": 15, "label": "2100 MHz"},
        "B40": {"freq": 2300, "height": 25, "power": 40, "gain": 12, "label": "2300 MHz"},
        "B41": {"freq": 2500, "height": 25, "power": 40, "gain": 12, "label": "2500 MHz"},
        "n78": {"freq": 3500, "height": 25, "power": 40, "gain": 15, "label": "3500 MHz (5G NR)"},
    }

    defaults = band_defaults.get(band, band_defaults["B8"])
    freq = defaults["freq"]
    model = select_propagation_model(freq, "auto")

    points = generate_coverage_grid(
        tower_lat=lat,
        tower_lon=lon,
        tower_height_m=defaults["height"],
        frequency_mhz=freq,
        power_dbm=defaults["power"],
        gain_dbi=defaults["gain"],
        model=model,
        environment=environment,
        grid_steps=40,
    )

    return {
        "count": len(points),
        "points": points,
        "model": model,
        "band": band,
        "frequency_mhz": freq,
        "defaults_used": {
            "height_m": defaults["height"],
            "power_dbm": defaults["power"],
            "gain_dbi": defaults["gain"],
            "azimuth": 0,
            "note": "Typical Indian macro cell defaults used. Refine with actual tower specs for accuracy.",
        },
        "environment": environment,
        "is_estimate": True,
    }


@router.get("/coverage/all")
def coverage_all(model: str = "Okumura-Hata", environment: str = "urban"):
    """Generate coverage for all towers in the database."""
    con = get_connection()
    cur = con.cursor()
    cur.execute("""
        SELECT t.*, o.name as operator_name FROM towers t
        LEFT JOIN operators o ON t.operator_id = o.id
    """)
    towers = cur.fetchall()
    con.close()

    all_points = []
    for t in towers:
        tower_model = select_propagation_model(900, model)  # Default freq
        points = generate_coverage_grid(
            tower_lat=t["latitude"],
            tower_lon=t["longitude"],
            tower_height_m=t["height_m"] or 30,
            frequency_mhz=900,
            power_dbm=43,
            gain_dbi=15,
            model=tower_model,
            environment=environment,
            grid_steps=50,
        )
        for p in points:
            p["serving_tower"] = f"{t['operator_name']} #{t['id']}"
        all_points.extend(points)

    return {"count": len(all_points), "points": all_points}


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import/towers")
async def import_towers(file: UploadFile = File(...)):
    """Import towers from CSV, JSON, or GeoJSON file."""
    content = await file.read()
    text = content.decode("utf-8")

    filename = file.filename.lower()
    if filename.endswith(".geojson"):
        imported, skipped, errors = import_towers_geojson(text)
    elif filename.endswith(".json"):
        data = json.loads(text)
        if isinstance(data, list):
            imported, skipped, errors = import_towers_json(data)
        else:
            imported, skipped, errors = import_towers_geojson(text)
    else:  # CSV
        imported, skipped, errors = import_towers_csv(text)

    return {
        "success": len(errors) == 0,
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:20],
    }


@router.post("/import/measurements")
async def import_measurements(file: UploadFile = File(...)):
    """Import crowdsourced measurements from CSV, JSON, or GeoJSON."""
    content = await file.read()
    text = content.decode("utf-8")

    filename = file.filename.lower()
    if filename.endswith(".geojson"):
        imported, skipped, errors = import_measurements_geojson(text)
    elif filename.endswith(".json"):
        data = json.loads(text)
        if isinstance(data, list):
            imported, skipped, errors = import_measurements_json(data)
        else:
            imported, skipped, errors = import_measurements_geojson(text)
    else:
        imported, skipped, errors = import_measurements_csv(text)

    return {
        "success": len(errors) == 0,
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:20],
    }


# ── AI Recommendations ───────────────────────────────────────────────────────

@router.get("/ai/recommendations")
def get_recommendations():
    """Get AI-assisted planning recommendations."""
    con = get_connection()
    cur = con.cursor()

    # Get towers
    cur.execute("""
        SELECT t.*, o.name as operator_name FROM towers t
        LEFT JOIN operators o ON t.operator_id = o.id
    """)
    towers = [dict(r) for r in cur.fetchall()]

    # Get measurements
    cur.execute("""
        SELECT m.*, o.name as operator_name FROM crowdsourced_measurements m
        LEFT JOIN operators o ON m.operator_id = o.id
    """)
    measurements = [dict(r) for r in cur.fetchall()]
    con.close()

    # Generate coverage for gap analysis (simplified)
    coverage_points = []
    for t in towers:
        points = generate_coverage_grid(
            tower_lat=t["latitude"],
            tower_lon=t["longitude"],
            tower_height_m=t["height_m"] or 30,
            frequency_mhz=900,
            power_dbm=43,
            gain_dbi=15,
            grid_steps=30,
        )
        coverage_points.extend(points)

    # Analyze
    gaps = analyze_coverage_gaps(coverage_points)
    recommendations = generate_recommendations(towers, coverage_points, measurements, gaps)

    return recommendations


# ── Prediction vs Measurement comparison ─────────────────────────────────────

@router.get("/analysis/prediction-vs-measurement")
def prediction_vs_measurement():
    """Compare predicted vs measured RSRP where data overlaps."""
    con = get_connection()
    cur = con.cursor()

    cur.execute("""
        SELECT m.*, o.name as operator_name FROM crowdsourced_measurements m
        LEFT JOIN operators o ON m.operator_id = o.id
        WHERE m.rsrp IS NOT NULL
    """)
    measurements = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT t.*, o.name as operator_name FROM towers t
        LEFT JOIN operators o ON t.operator_id = o.id
    """)
    towers = [dict(r) for r in cur.fetchall()]
    con.close()

    if not measurements or not towers:
        return {"comparisons": [], "statistics": None}

    comparisons = []
    errors = []

    for m in measurements:
        # Find nearest tower
        min_dist = float("inf")
        nearest = None
        for t in towers:
            dist = haversine_km(m["latitude"], m["longitude"], t["latitude"], t["longitude"])
            if dist < min_dist:
                min_dist = dist
                nearest = t

        if nearest and min_dist < 10:
            # Calculate prediction
            result = calculate_point_estimate(
                tower_lat=nearest["latitude"],
                tower_lon=nearest["longitude"],
                tower_height_m=nearest["height_m"] or 30,
                frequency_mhz=900,
                power_dbm=43,
                gain_dbi=15,
                point_lat=m["latitude"],
                point_lon=m["longitude"],
                model="Okumura-Hata",
            )

            error = m["rsrp"] - result["predicted_rsrp"]
            errors.append(error)
            comparisons.append({
                "latitude": m["latitude"],
                "longitude": m["longitude"],
                "operator": m["operator_name"],
                "measured_rsrp": m["rsrp"],
                "predicted_rsrp": result["predicted_rsrp"],
                "error_db": round(error, 1),
                "distance_to_tower_km": min_dist,
            })

    # Statistics
    stats = None
    if errors:
        mae = sum(abs(e) for e in errors) / len(errors)
        mean_error = sum(errors) / len(errors)
        rmse = (sum(e**2 for e in errors) / len(errors)) ** 0.5
        stats = {
            "count": len(errors),
            "mae": round(mae, 2),
            "mean_error": round(mean_error, 2),
            "rmse": round(rmse, 2),
            "max_error": round(max(abs(e) for e in errors), 2),
        }

    return {"comparisons": comparisons, "statistics": stats}
