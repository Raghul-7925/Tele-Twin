"""
Database schema and initialization for Tele-Twin.
Normalized schema: Operators, Technologies, Bands, Towers, Cells, Antennas,
CrowdsourcedMeasurements, Simulations, SimulationPoints, CoverageResults.
"""
import sqlite3
import os

DB_PATH = os.environ.get("TELETWIN_DB", "teletwin.db")


def get_connection():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    con = get_connection()
    cur = con.cursor()

    # ── Reference tables ──────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS operators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            code TEXT,
            country TEXT DEFAULT 'IN'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS technologies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            generation TEXT,
            description TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS bands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            frequency_mhz REAL NOT NULL,
            technology_id INTEGER REFERENCES technologies(id),
            earfcn_start INTEGER,
            earfcn_end INTEGER,
            bandwidth_mhz REAL,
            UNIQUE(name, frequency_mhz)
        )
    """)

    # ── Tower infrastructure ──────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS towers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_id TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            elevation_m REAL,
            tower_type TEXT CHECK(tower_type IN ('ground','rooftop','wall_mount')),
            height_m REAL,
            operator_id INTEGER REFERENCES operators(id),
            site_id TEXT,
            address TEXT,
            source TEXT DEFAULT 'manual',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tower_id INTEGER NOT NULL REFERENCES towers(id) ON DELETE CASCADE,
            cell_id TEXT,
            pci INTEGER,
            technology_id INTEGER REFERENCES technologies(id),
            band_id INTEGER REFERENCES bands(id),
            frequency_mhz REAL,
            earfcn INTEGER,
            nrarfcn INTEGER,
            azimuth REAL,
            mechanical_tilt REAL,
            electrical_tilt REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS antennas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cell_id INTEGER NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
            model TEXT,
            gain_dbi REAL DEFAULT 15.0,
            horizontal_beamwidth REAL DEFAULT 65.0,
            vertical_beamwidth REAL DEFAULT 7.0,
            front_to_back_ratio REAL DEFAULT 25.0,
            max_power_dbm REAL DEFAULT 43.0,
            eirp_dbm REAL,
            height_m REAL
        )
    """)

    # ── Crowdsourced measurements ─────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS crowdsourced_measurements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            operator_id INTEGER REFERENCES operators(id),
            technology_id INTEGER REFERENCES technologies(id),
            band_name TEXT,
            rsrp REAL,
            rsrq REAL,
            sinr REAL,
            rssi REAL,
            cell_id TEXT,
            pci INTEGER,
            earfcn INTEGER,
            nrarfcn INTEGER,
            device_model TEXT,
            timestamp DATETIME,
            source TEXT DEFAULT 'manual',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Simulations ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS simulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            tower_config TEXT,
            propagation_model TEXT,
            grid_resolution INTEGER DEFAULT 50,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS simulation_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            distance_km REAL,
            path_loss_db REAL,
            predicted_rsrp REAL,
            predicted_rsrq REAL,
            predicted_sinr REAL,
            predicted_rssi REAL,
            estimated_ta REAL,
            serving_tower_id INTEGER,
            coverage_class TEXT,
            obstruction_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Coverage results (per-tower cached) ───────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS coverage_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tower_id INTEGER NOT NULL REFERENCES towers(id) ON DELETE CASCADE,
            propagation_model TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            distance_km REAL,
            path_loss_db REAL,
            predicted_rsrp REAL,
            coverage_class TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Indexes ───────────────────────────────────────────────────────────────
    cur.execute("CREATE INDEX IF NOT EXISTS idx_towers_location ON towers(latitude, longitude)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_towers_operator ON towers(operator_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cells_tower ON cells(tower_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_measurements_location ON crowdsourced_measurements(latitude, longitude)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_measurements_operator ON crowdsourced_measurements(operator_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_coverage_tower ON coverage_results(tower_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sim_points ON simulation_points(simulation_id)")

    # ── Seed reference data ───────────────────────────────────────────────────
    # Operators (Indian telecom)
    for name, code in [("BSNL","BSNL"),("Jio","JIO"),("Airtel","ATL"),("Vi","VI"),("Other","OTH")]:
        cur.execute("INSERT OR IGNORE INTO operators (name, code) VALUES (?,?)", (name, code))

    # Technologies
    for name, gen, desc in [
        ("2G","2G","GSM/GPRS/EDGE"),
        ("3G","3G","UMTS/HSPA"),
        ("4G","4G","LTE/LTE-A"),
        ("5G","5G","NR"),
    ]:
        cur.execute("INSERT OR IGNORE INTO technologies (name, generation, description) VALUES (?,?,?)", (name, gen, desc))

    # Bands (Indian allocations)
    bands_data = [
        ("B5",  850,  "2G", None, None, None),
        ("B8",  900,  "2G", None, None, None),
        ("B3", 1800,  "2G", None, None, None),
        ("B1", 2100,  "3G", None, None, None),
        ("B5",  850,  "3G", None, None, None),
        ("B8",  900,  "3G", None, None, None),
        ("B3", 1800,  "4G", 1200, 1949, 20),
        ("B5",  850,  "4G", 2400, 2649, 10),
        ("B8",  900,  "4G", 3450, 3799, 10),
        ("B1", 2100,  "4G",  300,  599, 15),
        ("B40",2300,  "4G", 38650, 39649, 20),
        ("B41",2500,  "4G", 39650, 41589, 20),
        ("n78",3500,  "5G", 620000, 653333, 50),
        ("n28", 700,  "5G", 151600, 153600, 10),
    ]
    for name, freq, tech_name, earfcn_s, earfcn_e, bw in bands_data:
        cur.execute("""
            INSERT OR IGNORE INTO bands (name, frequency_mhz, technology_id, earfcn_start, earfcn_end, bandwidth_mhz)
            SELECT ?, ?, id, ?, ?, ? FROM technologies WHERE name = ?
        """, (name, freq, earfcn_s, earfcn_e, bw, tech_name))

    con.commit()
    con.close()
