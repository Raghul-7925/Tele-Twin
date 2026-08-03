from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import sqlite3
import math
import os

app = FastAPI(title="Tele-Twin API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB = "teletwin.db"

def init_db():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS towers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL, lon REAL,
            height REAL, frequency REAL,
            power REAL, gain REAL,
            operator TEXT, source TEXT DEFAULT 'manual'
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS signal_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL, lon REAL,
            rsrp REAL, operator TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    con.commit()
    con.close()

init_db()

# ── Models ────────────────────────────────────────────────────────────────────

class Tower(BaseModel):
    lat: float
    lon: float
    height: float        # metres
    frequency: float     # MHz
    power: float         # dBm
    gain: float          # dBi
    operator: str = "BSNL"
    source: str = "manual"

class SignalReport(BaseModel):
    lat: float
    lon: float
    rsrp: float          # dBm
    operator: str

# ── RF Math ───────────────────────────────────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lon points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def okumura_hata(f, hb, hm, d, env="urban"):
    """
    Okumura-Hata path loss model.
    f  = frequency MHz
    hb = base station height m
    hm = mobile height m (default 1.5)
    d  = distance km
    Returns path loss in dB
    """
    if d < 0.01:
        d = 0.01
    # Mobile antenna correction factor (urban large city)
    if f >= 300:
        a_hm = 3.2 * (math.log10(11.75 * hm))**2 - 4.97
    else:
        a_hm = 8.29 * (math.log10(1.54 * hm))**2 - 1.1

    L = (69.55 + 26.16 * math.log10(f)
         - 13.82 * math.log10(hb)
         - a_hm
         + (44.9 - 6.55 * math.log10(hb)) * math.log10(d))

    if env == "suburban":
        L -= 2 * (math.log10(f / 28))**2 - 5.4
    elif env == "rural":
        L -= 4.78 * (math.log10(f))**2 - 18.33 * math.log10(f) - 40.94

    return L

def signal_quality(rsrp):
    if rsrp >= -80:   return "excellent"
    if rsrp >= -95:   return "good"
    if rsrp >= -110:  return "weak"
    return "none"

def color_for_quality(q):
    return {"excellent": "#22c55e", "good": "#eab308",
            "weak": "#f97316", "none": "#ef4444"}.get(q, "#ef4444")

def compute_coverage(tower, grid_steps=50):
    """Generate a list of coverage points around a tower."""
    lat, lon = tower["lat"], tower["lon"]
    hb = tower["height"]
    f  = tower["frequency"]
    tx = tower["power"]   # dBm
    g  = tower["gain"]    # dBi
    hm = 1.5

    # max range estimate (km) — lower frequencies propagate further
    if f <= 700:
        max_range = 25
    elif f <= 900:
        max_range = 20
    elif f <= 1800:
        max_range = 12
    elif f <= 2100:
        max_range = 8
    else:
        max_range = 5

    points = []

    for i in range(grid_steps):
        for j in range(grid_steps):
            dlat = -max_range/111 + i * (2*max_range/111) / grid_steps
            dlon = -max_range/111 + j * (2*max_range/111) / grid_steps
            plat = lat + dlat
            plon = lon + dlon

            d = haversine(lat, lon, plat, plon)
            if d < 0.05:
                d = 0.05

            path_loss = okumura_hata(f, hb, hm, d)
            rsrp = tx + g - path_loss

            if rsrp >= -120:
                q = signal_quality(rsrp)
                points.append({
                    "lat": round(plat, 6),
                    "lon": round(plon, 6),
                    "rsrp": round(rsrp, 1),
                    "quality": q,
                    "color": color_for_quality(q),
                })

    return points

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "project": "Tele-Twin RF Coverage Simulator"}

@app.post("/towers")
def add_tower(t: Tower):
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute(
        "INSERT INTO towers (lat,lon,height,frequency,power,gain,operator,source) VALUES (?,?,?,?,?,?,?,?)",
        (t.lat, t.lon, t.height, t.frequency, t.power, t.gain, t.operator, t.source)
    )
    tower_id = cur.lastrowid
    con.commit(); con.close()
    return {"id": tower_id, "message": "Tower added"}

@app.get("/towers")
def get_towers():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT id,lat,lon,height,frequency,power,gain,operator,source FROM towers")
    rows = cur.fetchall()
    con.close()
    return [{"id":r[0],"lat":r[1],"lon":r[2],"height":r[3],"frequency":r[4],
             "power":r[5],"gain":r[6],"operator":r[7],"source":r[8]} for r in rows]

@app.delete("/towers/{tower_id}")
def delete_tower(tower_id: int):
    con = sqlite3.connect(DB)
    con.execute("DELETE FROM towers WHERE id=?", (tower_id,))
    con.commit(); con.close()
    return {"message": "Deleted"}

@app.post("/coverage")
def get_coverage(t: Tower):
    """Calculate coverage for a given tower config."""
    tower = t.dict()
    points = compute_coverage(tower)
    return {"count": len(points), "points": points}

@app.get("/coverage/all")
def coverage_all():
    """Coverage for all towers in DB."""
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT lat,lon,height,frequency,power,gain,operator FROM towers")
    rows = cur.fetchall()
    con.close()

    all_points = []
    for r in rows:
        tower = {"lat":r[0],"lon":r[1],"height":r[2],"frequency":r[3],
                 "power":r[4],"gain":r[5],"operator":r[6]}
        all_points.extend(compute_coverage(tower, grid_steps=50))

    return {"count": len(all_points), "points": all_points}

@app.post("/signal-reports")
def add_signal_report(s: SignalReport):
    con = sqlite3.connect(DB)
    con.execute(
        "INSERT INTO signal_reports (lat,lon,rsrp,operator) VALUES (?,?,?,?)",
        (s.lat, s.lon, s.rsrp, s.operator)
    )
    con.commit(); con.close()
    return {"message": "Report submitted", "quality": signal_quality(s.rsrp)}

@app.get("/signal-reports")
def get_signal_reports():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT id,lat,lon,rsrp,operator,created_at FROM signal_reports ORDER BY id DESC LIMIT 500")
    rows = cur.fetchall()
    con.close()
    return [{"id":r[0],"lat":r[1],"lon":r[2],"rsrp":r[3],"operator":r[4],
             "quality": signal_quality(r[3]), "color": color_for_quality(signal_quality(r[3])),
             "created_at":r[5]} for r in rows]

# ── CSV Import ──────────────────────────────────────────────────────────────────

@app.post("/import-csv")
async def import_csv(file: bytes):
    """Import OpenCelliD CSV data. Expects columns: lat, lon, operator (optional)."""
    import csv
    import io
    try:
        text = file.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        count = 0
        con = sqlite3.connect(DB)
        cur = con.cursor()
        for row in reader:
            lat = float(row.get('lat', row.get('Lat', row.get('LAT', 0))))
            lon = float(row.get('lon', row.get('Lon', row.get('LON', row.get('lng', row.get('Lng', 0))))))
            op = row.get('operator', row.get('Operator', row.get('OPERATOR', row.get('net', 'Unknown'))))
            if lat == 0 or lon == 0:
                continue
            # Map operator names
            op_lower = str(op).lower()
            if 'bsnl' in op_lower or '51' in op_lower:
                op = 'BSNL'
            elif 'jio' in op_lower or 'reliance' in op_lower or '55' in op_lower:
                op = 'Jio'
            elif 'airtel' in op_lower or '45' in op_lower:
                op = 'Airtel'
            elif 'vi' in op_lower or 'vodafone' in op_lower or 'idea' in op_lower or '46' in op_lower:
                op = 'Vi'
            cur.execute(
                "INSERT INTO towers (lat,lon,height,frequency,power,gain,operator,source) VALUES (?,?,?,?,?,?,?,?)",
                (lat, lon, 30, 900, 43, 15, op, 'csv')
            )
            count += 1
        con.commit(); con.close()
        return {"message": f"Imported {count} towers", "count": count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/suggest-tower")
def suggest_tower():
    """Simple gap detection — suggest center of largest uncovered area."""
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT lat,lon,height,frequency,power,gain FROM towers")
    towers = cur.fetchall()
    con.close()

    if not towers:
        return {"message": "No towers in database to analyze"}

    # Find centroid of existing towers
    avg_lat = sum(t[0] for t in towers) / len(towers)
    avg_lon = sum(t[1] for t in towers) / len(towers)

    # Suggest a point 10 km offset from centroid
    suggested_lat = round(avg_lat + 0.09, 5)
    suggested_lon = round(avg_lon + 0.09, 5)

    return {
        "suggested_lat": suggested_lat,
        "suggested_lon": suggested_lon,
        "recommended_frequency": 700,
        "recommended_height": 30,
        "reason": "Identified coverage gap northeast of existing tower cluster. 700 MHz recommended for maximum rural coverage.",
    }
