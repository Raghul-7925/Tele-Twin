"""
Data import pipeline for towers and crowdsourced measurements.

Supports: JSON, CSV, GeoJSON
Handles validation, deduplication, and operator/technology mapping.
"""
import csv
import io
import json
import sqlite3
from typing import List, Dict, Tuple, Optional

from ..database.schema import get_connection


# ── Operator mapping ──────────────────────────────────────────────────────────

OPERATOR_ALIASES = {
    "bsnl": "BSNL", "bharat sanchar nigam": "BSNL", "51": "BSNL",
    "jio": "Jio", "reliance jio": "Jio", "reliance": "Jio", "55": "Jio",
    "airtel": "Airtel", "bharti airtel": "Airtel", "45": "Airtel",
    "vi": "Vi", "vodafone": "Vi", "idea": "Vi", "vodafone idea": "Vi", "46": "Vi",
}

TECHNOLOGY_ALIASES = {
    "2g": "2G", "gsm": "2G", "edge": "2G", "gprs": "2G",
    "3g": "3G", "umts": "3G", "hspa": "3G", "hspa+": "3G", "wcdma": "3G",
    "4g": "4G", "lte": "4G", "lte-a": "4G", "4g+": "4G",
    "5g": "5G", "nr": "5G", "5g nr": "5G",
}

TOWER_TYPE_ALIASES = {
    "ground": "ground", "gnd": "ground", "ground tower": "ground", "green": "ground",
    "rooftop": "rooftop", "roof": "rooftop", "rooftop tower": "rooftop", "blue": "rooftop",
    "wall mount": "wall_mount", "wall_mount": "wall_mount", "wall": "wall_mount", "pink": "wall_mount",
}

BAND_ALIASES = {
    "b1": "B1", "band 1": "B1", "band1": "B1", "2100": "B1",
    "b3": "B3", "band 3": "B3", "band3": "B3", "1800": "B3",
    "b5": "B5", "band 5": "B5", "band5": "B5", "850": "B5",
    "b8": "B8", "band 8": "B8", "band8": "B8", "900": "B8",
    "b40": "B40", "band 40": "B40", "band40": "B40", "2300": "B40",
    "b41": "B41", "band 41": "B41", "band41": "B41", "2500": "B41",
    "n78": "n78", "band n78": "n78", "3500": "n78",
    "n28": "n28", "band n28": "n28", "700": "n28",
}


def normalize_operator(value: str) -> str:
    """Map various operator name formats to standard names."""
    if not value:
        return "Unknown"
    return OPERATOR_ALIASES.get(value.strip().lower(), value.strip())


def normalize_technology(value: str) -> str:
    if not value:
        return None
    return TECHNOLOGY_ALIASES.get(value.strip().lower(), value.strip())


def normalize_tower_type(value: str) -> str:
    if not value:
        return "ground"
    result = TOWER_TYPE_ALIASES.get(value.strip().lower())
    return result if result else "ground"


def normalize_band(value: str) -> str:
    if not value:
        return None
    return BAND_ALIASES.get(value.strip().lower(), value.strip())


# ── Field extraction helpers ──────────────────────────────────────────────────

def _extract_field(row: dict, candidates: List[str], default=None):
    """Extract a field value trying multiple possible column names."""
    for name in candidates:
        val = row.get(name)
        if val is not None and str(val).strip():
            return str(val).strip()
    return default


def _extract_float(row: dict, candidates: List[str], default=None) -> Optional[float]:
    """Extract a float field trying multiple possible column names."""
    val = _extract_field(row, candidates)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


# ── Tower import ──────────────────────────────────────────────────────────────

def parse_tower_row(row: dict) -> Optional[dict]:
    """Parse a single tower row from CSV/JSON into normalized format."""
    lat = _extract_float(row, ["latitude", "lat", "Latitude", "LAT", "y"])
    lon = _extract_float(row, ["longitude", "lon", "lng", "Longitude", "LON", "x"])

    if lat is None or lon is None:
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    return {
        "latitude": lat,
        "longitude": lon,
        "elevation_m": _extract_float(row, ["elevation", "elevation_m", "elev", "alt"]),
        "tower_type": normalize_tower_type(_extract_field(row, ["tower_type", "type", "TowerType"], "ground")),
        "height_m": _extract_float(row, ["height", "height_m", "tower_height"], 30.0),
        "operator": normalize_operator(_extract_field(row, ["operator", "Operator", "OPERATOR", "net"], "Unknown")),
        "technology": normalize_technology(_extract_field(row, ["technology", "tech", "Technology"])),
        "band": normalize_band(_extract_field(row, ["band", "Band", "BAND"])),
        "frequency_mhz": _extract_float(row, ["frequency", "frequency_mhz", "freq"]),
        "azimuth": _extract_float(row, ["azimuth", "azim", "az"]),
        "cell_id": _extract_field(row, ["cell_id", "cellid", "CellID", "CID"]),
        "site_id": _extract_field(row, ["site_id", "siteid", "SiteID"]),
    }


def import_towers_json(data: List[dict]) -> Tuple[int, int, List[str]]:
    """Import towers from a list of dicts (JSON/CSV parsed)."""
    con = get_connection()
    cur = con.cursor()
    imported = 0
    skipped = 0
    errors = []

    # Ensure operator exists
    def ensure_operator(name):
        cur.execute("SELECT id FROM operators WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("INSERT INTO operators (name) VALUES (?)", (name,))
        return cur.lastrowid

    # Ensure technology exists
    def ensure_technology(name):
        if not name:
            return None
        cur.execute("SELECT id FROM technologies WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("INSERT INTO technologies (name, generation) VALUES (?, ?)", (name, name))
        return cur.lastrowid

    for i, row in enumerate(data):
        try:
            parsed = parse_tower_row(row)
            if parsed is None:
                skipped += 1
                continue

            operator_id = ensure_operator(parsed["operator"])
            tech_id = ensure_technology(parsed["technology"])

            # Check for duplicate (within ~50m)
            cur.execute("""
                SELECT id FROM towers
                WHERE ABS(latitude - ?) < 0.0005 AND ABS(longitude - ?) < 0.0005
                AND operator_id = ?
                LIMIT 1
            """, (parsed["latitude"], parsed["longitude"], operator_id))
            if cur.fetchone():
                skipped += 1
                continue

            # Insert tower
            cur.execute("""
                INSERT INTO towers (latitude, longitude, elevation_m, tower_type, height_m, operator_id, site_id, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'import')
            """, (
                parsed["latitude"], parsed["longitude"], parsed["elevation_m"],
                parsed["tower_type"], parsed["height_m"], operator_id, parsed["site_id"]
            ))
            tower_id = cur.lastrowid

            # Insert cell if we have cell info
            if parsed["technology"] or parsed["band"] or parsed["frequency_mhz"]:
                # Find band_id
                band_id = None
                if parsed["band"]:
                    cur.execute("SELECT id FROM bands WHERE name = ?", (parsed["band"],))
                    band_row = cur.fetchone()
                    if band_row:
                        band_id = band_row[0]

                freq = parsed["frequency_mhz"]
                if not freq and band_id:
                    cur.execute("SELECT frequency_mhz FROM bands WHERE id = ?", (band_id,))
                    freq_row = cur.fetchone()
                    if freq_row:
                        freq = freq_row[0]

                cur.execute("""
                    INSERT INTO cells (tower_id, cell_id, technology_id, band_id, frequency_mhz, azimuth)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (tower_id, parsed["cell_id"], tech_id, band_id, freq, parsed["azimuth"]))

            imported += 1
        except Exception as e:
            errors.append(f"Row {i+1}: {str(e)}")
            skipped += 1

    con.commit()
    con.close()
    return imported, skipped, errors


def import_towers_csv(csv_text: str) -> Tuple[int, int, List[str]]:
    """Import towers from CSV text."""
    reader = csv.DictReader(io.StringIO(csv_text))
    return import_towers_json(list(reader))


def import_towers_geojson(geojson_text: str) -> Tuple[int, int, List[str]]:
    """Import towers from GeoJSON text."""
    data = json.loads(geojson_text)
    features = data.get("features", [])
    rows = []
    for f in features:
        props = f.get("properties", {})
        coords = f.get("geometry", {}).get("coordinates", [None, None])
        if len(coords) >= 2:
            props["longitude"] = coords[0]
            props["latitude"] = coords[1]
        rows.append(props)
    return import_towers_json(rows)


# ── Measurement import ────────────────────────────────────────────────────────

def parse_measurement_row(row: dict) -> Optional[dict]:
    """Parse a single measurement row."""
    lat = _extract_float(row, ["latitude", "lat", "Latitude", "LAT"])
    lon = _extract_float(row, ["longitude", "lon", "lng", "Longitude", "LON"])

    if lat is None or lon is None:
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    return {
        "latitude": lat,
        "longitude": lon,
        "operator": normalize_operator(_extract_field(row, ["operator", "Operator"], "Unknown")),
        "technology": normalize_technology(_extract_field(row, ["technology", "tech"])),
        "band": normalize_band(_extract_field(row, ["band", "Band"])),
        "rsrp": _extract_float(row, ["rsrp", "RSRP"]),
        "rsrq": _extract_float(row, ["rsrq", "RSRQ"]),
        "sinr": _extract_float(row, ["sinr", "SINR", "snr", "SNR"]),
        "rssi": _extract_float(row, ["rssi", "RSSI"]),
        "cell_id": _extract_field(row, ["cell_id", "cellid", "CellID", "CID"]),
        "pci": _extract_float(row, ["pci", "PCI"]),
        "earfcn": _extract_float(row, ["earfcn", "EARFCN"]),
        "nrarfcn": _extract_float(row, ["nrarfcn", "NRARFCN"]),
        "device_model": _extract_field(row, ["device", "device_model", "model"]),
        "timestamp": _extract_field(row, ["timestamp", "time", "date", "created_at"]),
    }


def import_measurements_json(data: List[dict]) -> Tuple[int, int, List[str]]:
    """Import crowdsourced measurements from a list of dicts."""
    con = get_connection()
    cur = con.cursor()
    imported = 0
    skipped = 0
    errors = []

    def ensure_operator(name):
        cur.execute("SELECT id FROM operators WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("INSERT INTO operators (name) VALUES (?)", (name,))
        return cur.lastrowid

    def ensure_technology(name):
        if not name:
            return None
        cur.execute("SELECT id FROM technologies WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute("INSERT INTO technologies (name, generation) VALUES (?, ?)", (name, name))
        return cur.lastrowid

    for i, row in enumerate(data):
        try:
            parsed = parse_measurement_row(row)
            if parsed is None:
                skipped += 1
                continue

            operator_id = ensure_operator(parsed["operator"])
            tech_id = ensure_technology(parsed["technology"])

            cur.execute("""
                INSERT INTO crowdsourced_measurements
                (latitude, longitude, operator_id, technology_id, band_name, rsrp, rsrq, sinr, rssi,
                 cell_id, pci, earfcn, nrarfcn, device_model, timestamp, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')
            """, (
                parsed["latitude"], parsed["longitude"], operator_id, tech_id,
                parsed["band"], parsed["rsrp"], parsed["rsrq"], parsed["sinr"], parsed["rssi"],
                parsed["cell_id"], parsed["pci"], parsed["earfcn"], parsed["nrarfcn"],
                parsed["device_model"], parsed["timestamp"]
            ))
            imported += 1
        except Exception as e:
            errors.append(f"Row {i+1}: {str(e)}")
            skipped += 1

    con.commit()
    con.close()
    return imported, skipped, errors


def import_measurements_csv(csv_text: str) -> Tuple[int, int, List[str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    return import_measurements_json(list(reader))


def import_measurements_geojson(geojson_text: str) -> Tuple[int, int, List[str]]:
    data = json.loads(geojson_text)
    features = data.get("features", [])
    rows = []
    for f in features:
        props = f.get("properties", {})
        coords = f.get("geometry", {}).get("coordinates", [None, None])
        if len(coords) >= 2:
            props["longitude"] = coords[0]
            props["latitude"] = coords[1]
        rows.append(props)
    return import_measurements_json(rows)
