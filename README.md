# 📡 Tele-Twin — Telecom Digital Twin

Web-based RF Coverage Planning and Tower Optimization Platform using GIS and Crowdsourced Signal Data.

## Features
- 🗺️ Interactive map — click to place virtual towers
- 📡 Okumura-Hata RF propagation model
- 🟢 Color-coded coverage heatmap
- 📥 Import real tower data (OpenCelliD CSV)
- 💡 Coverage gap detection + new tower suggestion
- 👥 Community signal reporting (RSRP)

## Stack
- **Frontend**: React.js + Leaflet.js
- **Backend**: FastAPI (Python)
- **Database**: SQLite
- **RF Model**: Okumura-Hata

## Run Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start
```

## ECE Final Year Project
- Student: D. Abarna (421123104001)
- Guide: Mrs. D. Vasanthi, M.E., (Ph.D)
- Subject Code: 23EC8701
