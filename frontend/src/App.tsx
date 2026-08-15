/**
 * Tele-Twin — Telecom Digital Twin Frontend
 *
 * Professional engineering dashboard for RF coverage planning,
 * tower visualization, crowdsourced data, and AI recommendations.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './index.css';
import {
  Tower, Measurement, RFPointResult, AIRecommendation,
  ModelComparisonResult, PropagationModel, Environment,
  OPERATOR_COLORS, TOWER_TYPE_COLORS, OPERATORS, TECHNOLOGIES,
  FREQUENCIES, MODELS, ENVIRONMENTS,
} from './types';
import {
  getTowers, addTower, deleteTower, getMeasurements, addMeasurement,
  rfSimulate, rfPointEstimate, rfCompareModels, getCoverageAll, rfQuickEstimate,
  importTowers, importMeasurements, getRecommendations,
  getPredictionVsMeasurement,
} from './services/api';

// ── Fix leaflet default icons ────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Map center (Puducherry area) ─────────────────────────────────────────────
const MAP_CENTER: [number, number] = [11.9416, 79.8083];

// Frequency → band mapping for quick estimate
const FREQUENCY_TO_BAND: Record<number, string> = {
  700: 'n28', 850: 'B5', 900: 'B8', 1800: 'B3', 2100: 'B1', 2300: 'B40', 2500: 'B41', 3500: 'n78',
};

// ── Helper: Tower marker icon ────────────────────────────────────────────────
function towerIcon(operator: string, towerType: string = 'ground', isProposed: boolean = false): L.DivIcon {
  const color = isProposed ? '#f59e0b' : (TOWER_TYPE_COLORS[towerType] || '#22c55e');
  const opColor = OPERATOR_COLORS[operator] || '#6b7280';
  const label = isProposed ? '💡' : '🗼';
  const border = isProposed ? 'dashed' : 'solid';

  return L.divIcon({
    className: 'tower-marker',
    html: `
      <div style="position:relative;width:50px;height:50px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:50px;height:50px;border-radius:50%;background:radial-gradient(circle,${color}44 0%,${color}00 70%);border:2px ${border} ${color}66;animation:towerSpread 2.5s ease-out infinite;"></div>
        <div style="position:absolute;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,${color}55 0%,${color}00 70%);border:2px ${border} ${color}88;animation:towerPulse 1.8s ease-out infinite;"></div>
        <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:${color}cc;border:2px ${border} ${color};box-shadow:0 0 10px ${color}88;"></div>
        <div style="position:relative;z-index:2;font-size:16px;filter:drop-shadow(0 0 4px ${color});">${label}</div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25],
  });
}

// ── Heatmap Layer ────────────────────────────────────────────────────────────
function HeatmapLayer({ points, visible }: { points: RFPointResult[]; visible: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!visible || !points.length) return;

    const layer = L.layerGroup();
    points.forEach(p => {
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 4,
        fillColor: p.coverage_color,
        fillOpacity: 0.6,
        stroke: false,
      });
      marker.bindTooltip(
        `RSRP: ${p.predicted_rsrp} dBm (${p.coverage_class})\nDist: ${p.distance_km} km\nModel: ${p.propagation_model}`,
        { sticky: true }
      );
      layer.addLayer(marker);
    });
    layer.addTo(map);
    layerRef.current = layer;

    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [map, points, visible]);

  return null;
}

// ── Map click handler ────────────────────────────────────────────────────────
function MapClickHandler({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // State
  const [towers, setTowers] = useState<Tower[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [coveragePoints, setCoveragePoints] = useState<RFPointResult[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [modelComparison, setModelComparison] = useState<ModelComparisonResult[]>([]);
  const [predictionComparison, setPredictionComparison] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'towers' | 'planning' | 'crowdsourced' | 'analysis' | 'ai' | 'import'>('towers');
  const [showCoverage, setShowCoverage] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Tower form
  const [towerForm, setTowerForm] = useState({
    lat: '', lon: '', height: 30, frequency: 900, power: 43, gain: 15,
    operator: 'BSNL', towerType: 'ground' as string,
    model: 'Okumura-Hata' as PropagationModel, environment: 'urban' as Environment,
    azimuth: 0, hBeamwidth: 65, vBeamwidth: 7, eTilt: 0, mTilt: 0,
  });

  // Measurement form
  const [measForm, setMeasForm] = useState({
    lat: '', lon: '', rsrp: -85, rsrq: -11, sinr: 12, operator: 'BSNL', tech: '4G',
  });

  // RF point inspection
  const [pointInspection, setPointInspection] = useState<any>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3500);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadTowers = useCallback(async () => {
    try { const r = await getTowers(); setTowers(r.data); } catch {}
  }, []);

  const loadMeasurements = useCallback(async () => {
    try { const r = await getMeasurements(); setMeasurements(r.data); } catch {}
  }, []);

  useEffect(() => { loadTowers(); loadMeasurements(); }, [loadTowers, loadMeasurements]);

  // ── Tower actions ──────────────────────────────────────────────────────────
  const handleAddTower = async () => {
    if (!towerForm.lat || !towerForm.lon) return toast('📍 Tap map to set location');
    setLoading(true);
    try {
      const payload = {
        latitude: parseFloat(towerForm.lat),
        longitude: parseFloat(towerForm.lon),
        height_m: parseFloat(String(towerForm.height)) || 30,
        operator_name: towerForm.operator,
        tower_type: towerForm.towerType,
      };
      console.log('Adding tower:', payload);
      const res = await addTower(payload as any);
      console.log('Tower added:', res.data);
      toast(`✅ Tower #${res.data.id} added`);
      await loadTowers();
    } catch (err: any) {
      console.error('Add tower error:', err?.response?.data || err);
      toast(`❌ ${err?.response?.data?.detail || 'Error adding tower'}`);
    }
    setLoading(false);
  };

  const handleDeleteTower = async (id: number) => {
    await deleteTower(id);
    await loadTowers();
    toast('🗑️ Tower removed');
  };

  // ── Coverage simulation ────────────────────────────────────────────────────
  const handleSimulate = async () => {
    if (!towerForm.lat || !towerForm.lon) return toast('📍 Tap map to set location');
    setLoading(true);
    try {
      const r = await rfSimulate({
        latitude: parseFloat(towerForm.lat),
        longitude: parseFloat(towerForm.lon),
        height_m: towerForm.height,
        frequency_mhz: towerForm.frequency,
        power_dbm: towerForm.power,
        gain_dbi: towerForm.gain,
        azimuth: towerForm.azimuth,
        horizontal_beamwidth: towerForm.hBeamwidth,
        vertical_beamwidth: towerForm.vBeamwidth,
        electrical_tilt: towerForm.eTilt,
        mechanical_tilt: towerForm.mTilt,
        propagation_model: towerForm.model,
        environment: towerForm.environment,
        grid_steps: 50,
        is_proposed: true,
      });
      setCoveragePoints(r.data.points);
      toast(`📡 Coverage: ${r.data.count} points (${r.data.model})`);
    } catch { toast('❌ Simulation failed'); }
    setLoading(false);
  };

  const handleQuickEstimate = async () => {
    if (!towerForm.lat || !towerForm.lon) return toast('📍 Tap map to set location');
    setLoading(true);
    try {
      const band = FREQUENCY_TO_BAND[towerForm.frequency] || 'B8';
      const r = await rfQuickEstimate(band, towerForm.environment, parseFloat(towerForm.lat), parseFloat(towerForm.lon));
      setCoveragePoints(r.data.points);
      toast(`⚡ Quick estimate: ${r.data.count} points (${r.data.band} ${r.data.frequency_mhz} MHz, ${r.data.model})`);
    } catch { toast('❌ Quick estimate failed'); }
    setLoading(false);
  };

  const handleLoadAllCoverage = async () => {
    setLoading(true);
    try {
      const r = await getCoverageAll(towerForm.model, towerForm.environment);
      setCoveragePoints(r.data.points);
      toast(`🗺️ All towers: ${r.data.count} coverage points`);
    } catch { toast('❌ Failed'); }
    setLoading(false);
  };

  // ── Model comparison ───────────────────────────────────────────────────────
  const handleCompareModels = async () => {
    if (!towerForm.lat || !towerForm.lon) return toast('📍 Set tower location first');
    setLoading(true);
    try {
      const r = await rfCompareModels({
        tower_lat: parseFloat(towerForm.lat),
        tower_lon: parseFloat(towerForm.lon),
        tower_height_m: towerForm.height,
        frequency_mhz: towerForm.frequency,
        power_dbm: towerForm.power,
        gain_dbi: towerForm.gain,
        environment: towerForm.environment,
        grid_steps: 30,
      });
      setModelComparison(r.data);
      toast('📊 Model comparison complete');
    } catch { toast('❌ Comparison failed'); }
    setLoading(false);
  };

  // ── Measurement ────────────────────────────────────────────────────────────
  const handleAddMeasurement = async () => {
    if (!measForm.lat || !measForm.lon) return toast('📍 Tap map for location');
    try {
      await addMeasurement({
        latitude: parseFloat(measForm.lat),
        longitude: parseFloat(measForm.lon),
        operator_name: measForm.operator,
        technology_name: measForm.tech,
        rsrp: measForm.rsrp,
        rsrq: measForm.rsrp ? undefined : undefined,
        sinr: undefined,
      });
      toast('✅ Measurement submitted');
      await loadMeasurements();
    } catch { toast('❌ Submit failed'); }
  };

  // ── AI Recommendations ─────────────────────────────────────────────────────
  const handleGetRecommendations = async () => {
    setLoading(true);
    try {
      const r = await getRecommendations();
      setRecommendations(r.data);
      toast(`💡 ${r.data.length} recommendations`);
    } catch { toast('❌ AI analysis failed'); }
    setLoading(false);
  };

  // ── Prediction vs Measurement ──────────────────────────────────────────────
  const handlePredictionComparison = async () => {
    setLoading(true);
    try {
      const r = await getPredictionVsMeasurement();
      setPredictionComparison(r.data);
      toast(`📊 ${r.data.comparisons?.length || 0} comparisons`);
    } catch { toast('❌ Analysis failed'); }
    setLoading(false);
  };

  // ── File import ────────────────────────────────────────────────────────────
  const handleImportTowers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const r = await importTowers(file);
      toast(`📥 Imported ${r.data.imported} towers (${r.data.skipped} skipped)`);
      await loadTowers();
    } catch { toast('❌ Import failed'); }
    setLoading(false);
  };

  const handleImportMeasurements = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const r = await importMeasurements(file);
      toast(`📥 Imported ${r.data.imported} measurements`);
      await loadMeasurements();
    } catch { toast('❌ Import failed'); }
    setLoading(false);
  };

  // ── Map click ──────────────────────────────────────────────────────────────
  const onMapClick = useCallback((latlng: L.LatLng) => {
    const lat = latlng.lat.toFixed(6);
    const lon = latlng.lng.toFixed(6);
    setTowerForm(f => ({ ...f, lat, lon }));
    setMeasForm(f => ({ ...f, lat, lon }));
    toast(`📍 Location set: ${lat}, ${lon}`);
  }, [toast]);

  // ── Point inspection (click on coverage) ───────────────────────────────────
  const handlePointInspection = async (lat: number, lon: number) => {
    if (!towerForm.lat || !towerForm.lon) return;
    try {
      const r = await rfPointEstimate({
        tower_lat: parseFloat(towerForm.lat),
        tower_lon: parseFloat(towerForm.lon),
        tower_height_m: towerForm.height,
        frequency_mhz: towerForm.frequency,
        power_dbm: towerForm.power,
        gain_dbi: towerForm.gain,
        azimuth: towerForm.azimuth,
        point_lat: lat,
        point_lon: lon,
        propagation_model: towerForm.model,
        environment: towerForm.environment,
      });
      setPointInspection(r.data);
    } catch {}
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const btn = (bg: string) => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 6,
    padding: '7px 14px', fontSize: 12, cursor: 'pointer' as const, fontWeight: 600,
  });
  const card: React.CSSProperties = {
    background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12, marginBottom: 8,
  };
  const input: React.CSSProperties = {
    flex: 1, background: '#0d2137', border: '1px solid #1e3a5f', borderRadius: 4,
    padding: '5px 8px', fontSize: 11, color: '#fff', outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 10, color: '#90a4ae', width: 80, flexShrink: 0 };
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 6, gap: 6 };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes towerSpread { 0%{transform:scale(0.5);opacity:0.9} 50%{transform:scale(2.5);opacity:0.3} 100%{transform:scale(3.5);opacity:0} }
        @keyframes towerPulse { 0%{transform:scale(0.7);opacity:0.9} 70%{transform:scale(2);opacity:0} 100%{transform:scale(0.7);opacity:0} }
        .tower-marker { background:transparent!important; border:none!important; }
        .sidebar-tab { flex:1; padding:8px 4px; font-size:11px; font-weight:600; border:none; cursor:pointer; background:transparent; color:#90a4ae; border-bottom:2px solid transparent; }
        .sidebar-tab.active { background:#1565c0; color:#fff; border-bottom-color:#00bcd4; }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#0a1628' }}>
        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <div style={{ background: '#0d2137', borderBottom: '2px solid #00bcd4', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>📡</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#00bcd4', letterSpacing: 1 }}>TELE-TWIN</div>
              <div style={{ fontSize: 10, color: '#90a4ae' }}>RF Coverage Planning Platform — Digital Twin</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#546e7a' }}>
              🗼 {towers.length} towers | 📊 {measurements.length} measurements | 🔥 {coveragePoints.length} pts
            </span>
            <button onClick={handleLoadAllCoverage} disabled={loading} style={btn('#1565c0')}>
              {loading ? '⏳' : '🗺️'} Coverage
            </button>
            <button onClick={() => { setCoveragePoints([]); setPointInspection(null); setModelComparison([]); }} style={btn('#546e7a')}>
              🗑️ Clear
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* ── Sidebar ──────────────────────────────────────────────────── */}
          <div style={{ width: 320, background: '#0d2137', borderRight: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
              {([['towers','🗼 Towers'],['planning','📡 RF Planning'],['crowdsourced','📊 Data'],['analysis','📈 Analysis'],['ai','💡 AI'],['import','📥 Import']] as const).map(([t, l]) => (
                <button key={t} onClick={() => setActiveTab(t)} className={`sidebar-tab ${activeTab === t ? 'active' : ''}`}>{l}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {/* ── TOWERS TAB ────────────────────────────────────────────── */}
              {activeTab === 'towers' && <>
                {/* Quick Estimate - Band Only */}
                <div style={{...card, borderColor: '#0891b255'}}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', marginBottom: 4 }}>⚡ Quick Estimate</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 8 }}>
                    Tap map → select band → get instant coverage estimate
                  </div>
                  <div style={row}>
                    <span style={label}>Band</span>
                    <select style={input} value={towerForm.frequency} onChange={e => setTowerForm(f => ({...f, frequency: +e.target.value}))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f} MHz</option>)}
                    </select>
                  </div>
                  <button onClick={handleQuickEstimate} disabled={loading || !towerForm.lat} style={{...btn('#0891b2'), width:'100%', padding:'10px', marginTop: 4}}>
                    {loading ? '⏳' : '⚡'} Quick Estimate
                  </button>
                  {!towerForm.lat && <div style={{ fontSize: 10, color: '#f97316', marginTop: 4 }}>📍 Tap map first</div>}
                </div>

                {/* Full Tower Config */}
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>🗼 Add Tower</div>
                  <div style={{ ...row, fontSize: 10, color: '#90a4ae', background: '#0d2137', borderRadius: 4, padding: '4px 8px', marginBottom: 8 }}>Tap map to set location</div>
                  {[['lat','Lat'],['lon','Lon']].map(([k,l]) => (
                    <div key={k} style={row}>
                      <span style={label}>{l}</span>
                      <input style={input} value={(towerForm as any)[k]} readOnly placeholder="tap map" />
                    </div>
                  ))}
                  <div style={row}>
                    <span style={label}>Operator</span>
                    <select style={input} value={towerForm.operator} onChange={e => setTowerForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <span style={label}>Type</span>
                    <select style={input} value={towerForm.towerType} onChange={e => setTowerForm(f => ({...f, towerType: e.target.value}))}>
                      <option value="ground">🟢 Ground</option>
                      <option value="rooftop">🔵 Rooftop</option>
                      <option value="wall_mount">🩷 Wall Mount</option>
                    </select>
                  </div>
                  <div style={row}>
                    <span style={label}>Frequency</span>
                    <select style={input} value={towerForm.frequency} onChange={e => setTowerForm(f => ({...f, frequency: +e.target.value}))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f} MHz</option>)}
                    </select>
                  </div>
                  {[['height','Height (m)'],['power','Power (dBm)'],['gain','Gain (dBi)'],['azimuth','Azimuth (°)']].map(([k,l]) => (
                    <div key={k} style={row}>
                      <span style={label}>{l}</span>
                      <input style={input} type="number" value={(towerForm as any)[k]} onChange={e => setTowerForm(f => ({...f, [k]: +e.target.value}))} />
                    </div>
                  ))}
                  <button onClick={handleAddTower} style={{...btn('#1565c0'), width:'100%', marginTop:8, padding:'9px'}}>➕ Add Tower</button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>TOWERS ({towers.length})</div>
                  {towers.map(t => (
                    <div key={t.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', padding: '8px 10px' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: OPERATOR_COLORS[t.operator_name] || '#fff' }}>
                          🗼 {t.operator_name} — {t.tower_type}
                        </div>
                        <div style={{ fontSize: 10, color: '#90a4ae' }}>📍 {t.latitude.toFixed(4)}, {t.longitude.toFixed(4)}</div>
                        <div style={{ fontSize: 10, color: '#607d8b' }}>H:{t.height_m}m | {t.cell_count} cells</div>
                      </div>
                      <button onClick={() => handleDeleteTower(t.id)} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                  {!towers.length && <div style={{ color: '#546e7a', fontSize: 11, textAlign: 'center', padding: 16 }}>No towers — tap map or import data</div>}
                </div>
              </>}

              {/* ── RF PLANNING TAB ──────────────────────────────────────── */}
              {activeTab === 'planning' && <>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📡 RF Propagation</div>
                  <div style={row}>
                    <span style={label}>Model</span>
                    <select style={input} value={towerForm.model} onChange={e => setTowerForm(f => ({...f, model: e.target.value as PropagationModel}))}>
                      {MODELS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <span style={label}>Environment</span>
                    <select style={input} value={towerForm.environment} onChange={e => setTowerForm(f => ({...f, environment: e.target.value as Environment}))}>
                      {ENVIRONMENTS.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  {[['hBeamwidth','H Beamwidth (°)'],['vBeamwidth','V Beamwidth (°)'],['eTilt','E-Tilt (°)'],['mTilt','M-Tilt (°)']].map(([k,l]) => (
                    <div key={k} style={row}>
                      <span style={label}>{l}</span>
                      <input style={input} type="number" value={(towerForm as any)[k]} onChange={e => setTowerForm(f => ({...f, [k]: +e.target.value}))} />
                    </div>
                  ))}
                  <button onClick={handleSimulate} disabled={loading} style={{...btn('#1565c0'), width:'100%', padding:'9px', marginTop:8}}>
                    {loading ? '⏳ Computing...' : '🔥 Generate Coverage'}
                  </button>
                  <button onClick={handleQuickEstimate} disabled={loading} style={{...btn('#0891b2'), width:'100%', padding:'9px', marginTop:6}}>
                    ⚡ Quick Estimate (Band Only)
                  </button>
                  <button onClick={handleCompareModels} disabled={loading} style={{...btn('#7c3aed'), width:'100%', padding:'9px', marginTop:6}}>
                    📊 Compare All Models
                  </button>
                </div>

                {/* Model comparison results */}
                {modelComparison.length > 0 && (
                  <div style={{ ...card, borderColor: '#7c3aed55' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>📊 Model Comparison</div>
                    {modelComparison.map(m => (
                      <div key={m.model} style={{ marginBottom: 8, padding: '6px 8px', background: '#0d2137', borderRadius: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{m.model}</div>
                        <div style={{ fontSize: 10, color: '#90a4ae' }}>
                          Coverage: {m.coverage_area_km2} km² | Avg RSRP: {m.avg_rsrp} dBm
                        </div>
                        <div style={{ fontSize: 10, color: '#607d8b' }}>
                          Range: {m.min_rsrp} to {m.max_rsrp} dBm | {m.points_count} points
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Legend */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>COVERAGE LEGEND</div>
                  {[['#22c55e','Excellent (≥ -80)'],['#84cc16','Good (-80 to -90)'],['#eab308','Moderate (-90 to -100)'],['#f97316','Weak (-100 to -110)'],['#ef4444','Very Weak (-110 to -120)'],['#7f1d1d','No Coverage (< -120)']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                      <span style={{ fontSize: 10, color: '#b0bec5' }}>{l}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#00bcd4', fontWeight: 700, marginTop: 12, marginBottom: 8 }}>TOWER TYPES</div>
                  {[['#22c55e','🟢 Ground'],['#3b82f6','🔵 Rooftop'],['#ec4899','🩷 Wall Mount']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />
                      <span style={{ fontSize: 10, color: '#b0bec5' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </>}

              {/* ── CROWDSOURCED TAB ─────────────────────────────────────── */}
              {activeTab === 'crowdsourced' && <>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📊 Submit Measurement</div>
                  {[['lat','Lat'],['lon','Lon']].map(([k,l]) => (
                    <div key={k} style={row}>
                      <span style={label}>{l}</span>
                      <input style={input} value={(measForm as any)[k]} readOnly placeholder="tap map" />
                    </div>
                  ))}
                  <div style={row}>
                    <span style={label}>RSRP (dBm)</span>
                    <input style={input} type="number" value={measForm.rsrp} onChange={e => setMeasForm(f => ({...f, rsrp: +e.target.value}))} />
                  </div>
                  <div style={row}>
                    <span style={label}>Operator</span>
                    <select style={input} value={measForm.operator} onChange={e => setMeasForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <span style={label}>Technology</span>
                    <select style={input} value={measForm.tech} onChange={e => setMeasForm(f => ({...f, tech: e.target.value}))}>
                      {TECHNOLOGIES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddMeasurement} style={{...btn('#22c55e'), width:'100%', padding:'9px', marginTop:6}}>📤 Submit Report</button>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>RECENT ({measurements.length})</div>
                  {measurements.slice(0, 15).map(m => (
                    <div key={m.id} style={{ ...card, padding: '7px 10px', borderColor: m.color + '55' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: OPERATOR_COLORS[m.operator_name] }}>{m.operator_name} | {m.technology_name}</span>
                        <span style={{ fontSize: 11, color: m.color, fontWeight: 700 }}>{m.rsrp} dBm</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#90a4ae' }}>
                        {m.quality} | {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </>}

              {/* ── ANALYSIS TAB ─────────────────────────────────────────── */}
              {activeTab === 'analysis' && <>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📈 Prediction vs Measurement</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 8, lineHeight: 1.6 }}>
                    Compare model predictions against actual crowdsourced measurements.
                    Calculates MAE, RMSE, and Mean Error.
                  </div>
                  <button onClick={handlePredictionComparison} disabled={loading} style={{...btn('#0891b2'), width:'100%', padding:'9px'}}>
                    📊 Run Analysis
                  </button>
                </div>
                {predictionComparison?.statistics && (
                  <div style={{ ...card, borderColor: '#0891b255' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', marginBottom: 8 }}>Statistics</div>
                    {[['Samples', predictionComparison.statistics.count],['MAE', `${predictionComparison.statistics.mae} dB`],['RMSE', `${predictionComparison.statistics.rmse} dB`],['Mean Error', `${predictionComparison.statistics.mean_error} dB`],['Max Error', `${predictionComparison.statistics.max_error} dB`]].map(([k,v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                        <span style={{ color: '#90a4ae' }}>{k}</span>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>}

              {/* ── AI TAB ───────────────────────────────────────────────── */}
              {activeTab === 'ai' && <>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>💡 AI Planning Assistant</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 8, lineHeight: 1.6 }}>
                    Analyzes coverage gaps, tower density, frequency usage,
                    and measurement accuracy to provide planning recommendations.
                  </div>
                  <button onClick={handleGetRecommendations} disabled={loading} style={{...btn('#f59e0b'), width:'100%', padding:'10px'}}>
                    💡 Generate Recommendations
                  </button>
                </div>
                {recommendations.map((r, i) => (
                  <div key={i} style={{ ...card, borderColor: r.priority === 'high' ? '#ef444455' : r.priority === 'medium' ? '#f59e0b55' : '#6b728055' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: r.priority === 'high' ? '#ef4444' : r.priority === 'medium' ? '#f59e0b' : '#6b7280', color: '#fff', fontWeight: 700 }}>
                        {r.priority.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{r.title}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#90a4ae', lineHeight: 1.6, marginBottom: 6 }}>{r.description}</div>
                    <div style={{ fontSize: 10, color: '#00bcd4', background: '#0d2137', borderRadius: 4, padding: 6, lineHeight: 1.6 }}>
                      💬 {r.suggested_action}
                    </div>
                  </div>
                ))}
              </>}

              {/* ── IMPORT TAB ───────────────────────────────────────────── */}
              {activeTab === 'import' && <>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📥 Import Tower Data</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 8, lineHeight: 1.6 }}>
                    Import towers from CSV, JSON, or GeoJSON.
                    Supports: latitude, longitude, operator, technology, band, frequency, tower_type, height, azimuth, cell_id, site_id.
                  </div>
                  <label style={{...btn('#1565c0'), display: 'block', textAlign: 'center', padding: '10px', cursor: 'pointer'}}>
                    📂 Choose Tower File
                    <input type="file" accept=".csv,.json,.geojson" onChange={handleImportTowers} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📥 Import Measurements</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 8, lineHeight: 1.6 }}>
                    Import crowdsourced measurements from CSV, JSON, or GeoJSON.
                    Fields: latitude, longitude, rsrp, rsrq, sinr, rssi, operator, technology, cell_id, pci, timestamp.
                  </div>
                  <label style={{...btn('#22c55e'), display: 'block', textAlign: 'center', padding: '10px', cursor: 'pointer'}}>
                    📂 Choose Measurement File
                    <input type="file" accept=".csv,.json,.geojson" onChange={handleImportMeasurements} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00bcd4', marginBottom: 8 }}>📋 Supported Formats</div>
                  <div style={{ fontSize: 10, color: '#90a4ae', lineHeight: 1.8 }}>
                    <strong>CSV</strong> — Standard comma-separated values with header row<br/>
                    <strong>JSON</strong> — Array of objects with matching field names<br/>
                    <strong>GeoJSON</strong> — FeatureCollection with properties and Point geometry<br/><br/>
                    <strong>Operator mapping:</strong> auto-detects BSNL, Jio, Airtel, Vi from various formats<br/>
                    <strong>Tower types:</strong> ground (🟢), rooftop (🔵), wall_mount (🩷)<br/>
                    <strong>Deduplication:</strong> towers within 50m of same operator are skipped
                  </div>
                </div>
              </>}
            </div>
          </div>

          {/* ── Map Area ──────────────────────────────────────────────────── */}
          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer center={MAP_CENTER} zoom={11} style={{ width: '100%', height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              <MapClickHandler onClick={onMapClick} />

              {/* Coverage heatmap */}
              <HeatmapLayer points={coveragePoints} visible={showCoverage} />

              {/* Existing towers */}
              {towers.map(t => (
                <Marker key={t.id} position={[t.latitude, t.longitude]} icon={towerIcon(t.operator_name, t.tower_type, false)}>
                  <Popup>
                    <div style={{ fontSize: 13 }}>
                      <strong style={{ color: OPERATOR_COLORS[t.operator_name] }}>🗼 {t.operator_name}</strong><br/>
                      Type: {t.tower_type} | Height: {t.height_m}m<br/>
                      📍 {t.latitude.toFixed(5)}, {t.longitude.toFixed(5)}<br/>
                      Cells: {t.cell_count} | Source: {t.source}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Measurement markers */}
              {showMeasurements && measurements.map(m => (
                <CircleMarker key={m.id} center={[m.latitude, m.longitude]} radius={5} fillColor={m.color} fillOpacity={0.8} stroke={true} color="#fff" weight={1}>
                  <Popup>
                    <strong>{m.operator_name}</strong> — {m.technology_name}<br/>
                    RSRP: {m.rsrp} dBm ({m.quality})<br/>
                    {m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Toggle buttons */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => setShowCoverage(v => !v)} style={{...btn(showCoverage ? '#1565c0' : '#1e3a5f'), fontSize: 11}}>
                {showCoverage ? '🔥' : '🚫'} Heatmap
              </button>
              <button onClick={() => setShowMeasurements(v => !v)} style={{...btn(showMeasurements ? '#22c55e' : '#1e3a5f'), fontSize: 11}}>
                {showMeasurements ? '👁️' : '🚫'} Reports
              </button>
            </div>

            {/* Point inspection panel */}
            {pointInspection && (
              <div style={{ position: 'absolute', bottom: 40, left: 10, zIndex: 1000, background: '#0d2137ee', border: '1px solid #1e3a5f', borderRadius: 8, padding: 12, width: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#00bcd4', marginBottom: 6 }}>📍 RF Point Analysis</div>
                <div style={{ fontSize: 10, color: '#90a4ae', lineHeight: 1.8 }}>
                  <div>Lat: {pointInspection.latitude} | Lon: {pointInspection.longitude}</div>
                  <div>Distance: {pointInspection.distance_km} km</div>
                  <div>Path Loss: {pointInspection.path_loss_db} dB</div>
                  <div style={{ color: pointInspection.coverage_color, fontWeight: 700 }}>
                    RSRP: {pointInspection.predicted_rsrp} dBm ({pointInspection.coverage_class})
                  </div>
                  <div>RSSI: {pointInspection.predicted_rssi} dBm</div>
                  <div>SINR: {pointInspection.predicted_sinr} dB</div>
                  <div>TA: ~{pointInspection.estimated_ta_us} μs</div>
                  <div>Model: {pointInspection.propagation_model}</div>
                  <div style={{ color: '#f59e0b', fontWeight: 600 }}>Source: {pointInspection.data_source}</div>
                </div>
                <button onClick={() => setPointInspection(null)} style={{...btn('#546e7a'), marginTop: 6, width: '100%', fontSize: 10}}>Close</button>
              </div>
            )}

            {/* Status bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#0d2137cc', padding: '4px 12px', zIndex: 1000, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#90a4ae' }}>
              <span>🗼 {towers.length} towers | 🔥 {coveragePoints.length} heatmap pts | 📊 {measurements.length} reports</span>
              <span>Tele-Twin v2.0 — Okumura-Hata / COST-231 / FSPL</span>
            </div>

            {/* Toast */}
            {msg && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#0d2137', border: '1px solid #00bcd4', color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 12, zIndex: 2000, whiteSpace: 'nowrap', boxShadow: '0 4px 16px #00000088' }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
