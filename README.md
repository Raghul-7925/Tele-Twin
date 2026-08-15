# 📡 Tele-Twin — Telecom Digital Twin for RF Coverage Planning

Web-based RF Coverage Prediction and Network Planning Platform using GIS, Multiple Propagation Models, and Crowdsourced Signal Data.

## Features

- 🗺️ **Interactive GIS Map** — Real OpenStreetMap with tower visualization
- 📡 **Multiple RF Models** — FSPL, Okumura-Hata, COST-231 Hata
- 🟢 **Coverage Heatmap** — Color-coded predicted signal strength
- 🗼 **Tower Management** — Ground, Rooftop, Wall Mount types
- 👥 **Crowdsourced Data** — Import/submit real signal measurements (RSRP/RSRQ/SINR)
- 📊 **Model Comparison** — Compare FSPL vs Okumura-Hata vs COST-231
- 📈 **Prediction vs Measurement** — MAE/RMSE analysis of model accuracy
- 💡 **AI Recommendations** — Coverage gap detection and planning suggestions
- 📥 **Data Import** — CSV, JSON, GeoJSON import with validation
- 🎯 **RF Point Inspection** — Click any point to see predicted RF values
- 🔄 **Multi-tower Analysis** — Serving cell selection and neighbor detection
- 📱 **Mobile-ready APIs** — REST API designed for future Android app

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Leaflet.js |
| **Backend** | FastAPI (Python) |
| **Database** | SQLite (normalized schema) |
| **RF Engine** | FSPL, Okumura-Hata, COST-231 |
| **Models** | Pydantic v2 |

## Project Structure

```
Tele-Twin/
├── backend/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py          # All API endpoints
│   ├── database/
│   │   ├── __init__.py
│   │   └── schema.py          # DB schema + initialization
│   ├── imports/
│   │   ├── __init__.py
│   │   └── importer.py        # CSV/JSON/GeoJSON import
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py         # Pydantic models
│   ├── rf/
│   │   ├── __init__.py
│   │   ├── antenna.py         # Antenna pattern calculations
│   │   ├── cost231.py         # COST-231 Hata model
│   │   ├── engine.py          # Main RF engine
│   │   ├── fspl.py            # Free Space Path Loss
│   │   └── okumura_hata.py    # Okumura-Hata model
│   ├── services/
│   │   ├── __init__.py
│   │   └── ai_service.py      # AI recommendation engine
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_rf.py         # RF model unit tests
│   ├── main.py                # FastAPI entry point
│   ├── requirements.txt
│   ├── Procfile
│   └── railway.json
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── services/
│   │   │   └── api.ts         # API client
│   │   ├── types/
│   │   │   └── index.ts       # TypeScript types
│   │   ├── App.tsx            # Main application
│   │   ├── index.tsx          # Entry point
│   │   └── index.css          # Global styles
│   ├── package.json
│   └── tsconfig.json
└── .gitignore
```

## Run Locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start
```

### Tests

```bash
cd backend
python -m pytest tests/ -v
```

## API Endpoints

### Towers
- `GET /api/towers` — List all towers (filter by operator, type)
- `POST /api/towers` — Add a tower
- `DELETE /api/towers/{id}` — Delete a tower

### Cells
- `GET /api/cells` — List cells
- `POST /api/cells` — Add a cell to a tower

### RF Simulation
- `POST /api/rf/simulate` — Generate coverage heatmap
- `POST /api/rf/point-estimate` — RF values at a specific point
- `POST /api/rf/compare-models` — Compare all propagation models
- `GET /api/coverage/all` — Coverage for all towers

### Crowdsourced Data
- `GET /api/measurements` — List measurements
- `POST /api/measurements` — Submit a measurement

### Import
- `POST /api/import/towers` — Import towers (CSV/JSON/GeoJSON)
- `POST /api/import/measurements` — Import measurements

### Analysis
- `GET /api/ai/recommendations` — AI planning recommendations
- `GET /api/analysis/prediction-vs-measurement` — Model accuracy analysis

## RF Propagation Models

### FSPL (Free Space Path Loss)
- **Formula:** `L = 20*log10(d) + 20*log10(f) + 32.44`
- **Valid:** Any frequency, line-of-sight only
- **Use case:** Baseline, theoretical maximum range

### Okumura-Hata
- **Valid:** 150-1500 MHz, 30-200m BS height, 1-20 km
- **Environments:** Urban, Suburban, Rural
- **Use case:** 2G/3G/4G coverage in sub-2GHz bands

### COST-231 Hata
- **Valid:** 1500-2000 MHz, 30-200m BS height, 1-20 km
- **Use case:** 1800 MHz GSM/LTE, 2100 MHz UMTS

## Data Import Format

### Towers CSV
```csv
latitude,longitude,height,operator,tower_type,frequency,technology
11.94,79.81,30,BSNL,ground,900,4G
```

### Measurements JSON
```json
{
  "latitude": 11.94,
  "longitude": 79.81,
  "operator": "BSNL",
  "technology": "4G",
  "rsrp": -92,
  "rsrq": -11,
  "sinr": 12
}
```

## ECE Final Year Project

- **Student:** D. Abarna (421123104001)
- **Guide:** Mrs. D. Vasanthi, M.E., (Ph.D)
- **Subject Code:** 23EC8701

## License

Academic project — for educational purposes.
