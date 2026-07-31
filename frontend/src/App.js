import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const OPERATORS = ['BSNL', 'Jio', 'Airtel', 'Vi'];
const FREQUENCIES = [700, 900, 1800, 2100, 3500];
const OP_COLORS = { BSNL: '#f97316', Jio: '#3b82f6', Airtel: '#ef4444', Vi: '#a855f7' };

function towerIcon(operator) {
  const color = OP_COLORS[operator] || '#fff';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function signalIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:8px;height:8px;border-radius:50%;opacity:0.85"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

// Component to handle map clicks
function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

export default function App() {
  const [towers, setTowers] = useState([]);
  const [coveragePoints, setCoveragePoints] = useState([]);
  const [signalReports, setSignalReports] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [activeTab, setActiveTab] = useState('towers'); // towers | reports | suggest
  const [showCoverage, setShowCoverage] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Tower form
  const [form, setForm] = useState({
    lat: '', lon: '', height: 30, frequency: 900,
    power: 43, gain: 15, operator: 'BSNL',
  });

  // Signal report form
  const [reportForm, setReportForm] = useState({
    lat: '', lon: '', rsrp: -85, operator: 'BSNL',
  });

  const mapCenter = [11.0168, 76.9558]; // Coimbatore, Tamil Nadu

  useEffect(() => { fetchTowers(); fetchReports(); }, []);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  async function fetchTowers() {
    try {
      const res = await axios.get(`${API}/towers`);
      setTowers(res.data);
    } catch (e) { showMsg('Could not load towers'); }
  }

  async function fetchReports() {
    try {
      const res = await axios.get(`${API}/signal-reports`);
      setSignalReports(res.data);
    } catch (e) {}
  }

  async function addTower() {
    if (!form.lat || !form.lon) return showMsg('Click map to set location first');
    setLoading(true);
    try {
      await axios.post(`${API}/towers`, { ...form,
        lat: parseFloat(form.lat), lon: parseFloat(form.lon),
        height: parseFloat(form.height), frequency: parseFloat(form.frequency),
        power: parseFloat(form.power), gain: parseFloat(form.gain),
      });
      showMsg('✅ Tower added!');
      await fetchTowers();
      await loadAllCoverage();
    } catch (e) { showMsg('Error adding tower'); }
    setLoading(false);
  }

  async function deleteTower(id) {
    await axios.delete(`${API}/towers/${id}`);
    await fetchTowers();
    await loadAllCoverage();
    showMsg('Tower removed');
  }

  async function loadAllCoverage() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/coverage/all`);
      setCoveragePoints(res.data.points);
      showMsg(`📡 Coverage calculated — ${res.data.count} points`);
    } catch (e) { showMsg('Coverage calculation failed'); }
    setLoading(false);
  }

  async function addReport() {
    if (!reportForm.lat || !reportForm.lon) return showMsg('Click map to set location first');
    try {
      const res = await axios.post(`${API}/signal-reports`, { ...reportForm,
        lat: parseFloat(reportForm.lat), lon: parseFloat(reportForm.lon),
        rsrp: parseFloat(reportForm.rsrp),
      });
      showMsg(`✅ Report submitted — ${res.data.quality} signal`);
      await fetchReports();
    } catch (e) { showMsg('Error submitting report'); }
  }

  async function getSuggestion() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/suggest-tower`);
      setSuggestion(res.data);
      showMsg('💡 Tower suggestion ready!');
    } catch (e) { showMsg('Error getting suggestion'); }
    setLoading(false);
  }

  function onMapClick(latlng) {
    const { lat, lng } = latlng;
    if (activeTab === 'towers') {
      setForm(f => ({ ...f, lat: lat.toFixed(6), lon: lng.toFixed(6) }));
      showMsg(`📍 Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (activeTab === 'reports') {
      setReportForm(f => ({ ...f, lat: lat.toFixed(6), lon: lng.toFixed(6) }));
      showMsg(`📍 Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }

  const qualityColor = { excellent: '#22c55e', good: '#eab308', weak: '#f97316', none: '#ef4444' };
  const qualityLabel = { excellent: '🟢 Excellent', good: '🟡 Good', weak: '🟠 Weak', none: '🔴 No Signal' };

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#0a1628' }}>

      {/* ── TOP BAR ── */}
      <div style={{ background: '#0d2137', borderBottom: '2px solid #00bcd4', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📡</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#00bcd4', letterSpacing: 1 }}>TELE-TWIN</div>
            <div style={{ fontSize: 10, color: '#90a4ae' }}>RF Coverage Planning Platform</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadAllCoverage} disabled={loading} style={btnStyle('#1565c0')}>
            {loading ? '⏳' : '🗺️'} Calculate Coverage
          </button>
          <button onClick={() => { setCoveragePoints([]); setSuggestion(null); }} style={btnStyle('#546e7a')}>
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* ── MAIN BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── SIDEBAR ── */}
        <div style={{ width: 310, background: '#0d2137', borderRight: '1px solid #1e3a5f',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f' }}>
            {[['towers','🗼 Towers'], ['reports','📊 Reports'], ['suggest','💡 Suggest']].map(([t, l]) => (
              <button key={t} onClick={() => setActiveTab(t)} style={{
                flex: 1, padding: '8px 4px', fontSize: 11, fontWeight: 600,
                background: activeTab === t ? '#1565c0' : 'transparent',
                color: activeTab === t ? '#fff' : '#90a4ae',
                border: 'none', cursor: 'pointer', borderBottom: activeTab === t ? '2px solid #00bcd4' : '2px solid transparent',
              }}>{l}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

            {/* ── TOWERS TAB ── */}
            {activeTab === 'towers' && (
              <div>
                <div style={sectionTitle('🗼 Add Tower')}>
                  <div style={infoBox}>Click map to set location</div>

                  <div style={row}>
                    <label style={lbl}>Lat</label>
                    <input style={inp} value={form.lat} onChange={e => setForm(f => ({...f, lat: e.target.value}))} placeholder="click map" />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Lon</label>
                    <input style={inp} value={form.lon} onChange={e => setForm(f => ({...f, lon: e.target.value}))} placeholder="click map" />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Operator</label>
                    <select style={inp} value={form.operator} onChange={e => setForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <label style={lbl}>Frequency</label>
                    <select style={inp} value={form.frequency} onChange={e => setForm(f => ({...f, frequency: e.target.value}))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f} MHz</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <label style={lbl}>Height (m)</label>
                    <input style={inp} type="number" value={form.height} onChange={e => setForm(f => ({...f, height: e.target.value}))} />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Power (dBm)</label>
                    <input style={inp} type="number" value={form.power} onChange={e => setForm(f => ({...f, power: e.target.value}))} />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Gain (dBi)</label>
                    <input style={inp} type="number" value={form.gain} onChange={e => setForm(f => ({...f, gain: e.target.value}))} />
                  </div>
                  <button onClick={addTower} disabled={loading} style={{...btnStyle('#1565c0'), width: '100%', marginTop: 8}}>
                    ➕ Add Tower
                  </button>
                </div>

                {/* Tower list */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>
                    EXISTING TOWERS ({towers.length})
                  </div>
                  {towers.map(t => (
                    <div key={t.id} style={{ background: '#0a1628', border: '1px solid #1e3a5f',
                      borderRadius: 6, padding: '8px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: OP_COLORS[t.operator] || '#fff' }}>
                          {t.operator} — {t.frequency} MHz
                        </div>
                        <div style={{ fontSize: 10, color: '#90a4ae' }}>
                          📍 {parseFloat(t.lat).toFixed(4)}, {parseFloat(t.lon).toFixed(4)}
                        </div>
                        <div style={{ fontSize: 10, color: '#90a4ae' }}>
                          H: {t.height}m | P: {t.power}dBm | G: {t.gain}dBi
                        </div>
                        {t.source !== 'manual' && <div style={{ fontSize: 9, color: '#607d8b' }}>📥 {t.source}</div>}
                      </div>
                      <button onClick={() => deleteTower(t.id)}
                        style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 4,
                          padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  {towers.length === 0 && <div style={{ fontSize: 11, color: '#546e7a', textAlign: 'center', padding: 12 }}>No towers added yet</div>}
                </div>
              </div>
            )}

            {/* ── REPORTS TAB ── */}
            {activeTab === 'reports' && (
              <div>
                <div style={sectionTitle('📊 Submit Signal Report')}>
                  <div style={infoBox}>Click map → enter your RSRP reading</div>
                  <div style={row}>
                    <label style={lbl}>Lat</label>
                    <input style={inp} value={reportForm.lat} readOnly placeholder="click map" />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Lon</label>
                    <input style={inp} value={reportForm.lon} readOnly placeholder="click map" />
                  </div>
                  <div style={row}>
                    <label style={lbl}>RSRP (dBm)</label>
                    <input style={inp} type="number" value={reportForm.rsrp}
                      onChange={e => setReportForm(f => ({...f, rsrp: e.target.value}))} />
                  </div>
                  <div style={row}>
                    <label style={lbl}>Operator</label>
                    <select style={inp} value={reportForm.operator}
                      onChange={e => setReportForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: 10, color: '#90a4ae', marginBottom: 6 }}>
                    Signal guide: Excellent ≥-80 | Good ≥-95 | Weak ≥-110
                  </div>
                  <button onClick={addReport} style={{...btnStyle('#22c55e'), width: '100%'}}>
                    📤 Submit Report
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>
                    COMMUNITY REPORTS ({signalReports.length})
                  </div>
                  {signalReports.slice(0, 10).map(r => (
                    <div key={r.id} style={{ background: '#0a1628', border: `1px solid ${r.color}44`,
                      borderRadius: 6, padding: '7px 10px', marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: OP_COLORS[r.operator] }}>{r.operator}</span>
                        <span style={{ fontSize: 11, color: r.color }}>{r.rsrp} dBm</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#90a4ae' }}>
                        📍 {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)} — {qualityLabel[r.quality]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SUGGEST TAB ── */}
            {activeTab === 'suggest' && (
              <div>
                <div style={{ fontSize: 11, color: '#90a4ae', marginBottom: 12, lineHeight: 1.6 }}>
                  After adding towers and calculating coverage, the system analyzes coverage gaps and suggests the optimal location for a new tower.
                </div>
                <button onClick={getSuggestion} disabled={loading} style={{...btnStyle('#f59e0b'), width: '100%'}}>
                  💡 Suggest New Tower Location
                </button>

                {suggestion && (
                  <div style={{ marginTop: 14, background: '#0a1628', border: '1px solid #f59e0b55',
                    borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                      📍 Suggested Location
                    </div>
                    <div style={kv('Latitude', suggestion.suggested_lat)} />
                    <div style={kv('Longitude', suggestion.suggested_lon)} />
                    <div style={kv('Frequency', suggestion.recommended_frequency + ' MHz')} />
                    <div style={kv('Height', suggestion.recommended_height + ' m')} />
                    <div style={{ fontSize: 10, color: '#90a4ae', marginTop: 8, lineHeight: 1.5,
                      background: '#0d2137', borderRadius: 4, padding: 8 }}>
                      💬 {suggestion.reason}
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, color: '#00bcd4', fontWeight: 700, marginBottom: 8 }}>SIGNAL LEGEND</div>
                  {[['#22c55e','Excellent (≥ -80 dBm)'],['#eab308','Good (-80 to -95 dBm)'],
                    ['#f97316','Weak (-95 to -110 dBm)'],['#ef4444','No Coverage (< -110 dBm)']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />
                      <span style={{ fontSize: 11, color: '#b0bec5' }}>{l}</span>
                    </div>
                  ))}

                  <div style={{ fontSize: 11, color: '#00bcd4', fontWeight: 700, marginBottom: 8, marginTop: 14 }}>OPERATORS</div>
                  {Object.entries(OP_COLORS).map(([op, c]) => (
                    <div key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: c }} />
                      <span style={{ fontSize: 11, color: '#b0bec5' }}>{op}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MAP ── */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={mapCenter} zoom={12} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            <MapClickHandler onMapClick={onMapClick} />

            {/* Tower markers */}
            {towers.map(t => (
              <Marker key={t.id} position={[t.lat, t.lon]} icon={towerIcon(t.operator)}>
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: OP_COLORS[t.operator] }}>{t.operator}</strong><br />
                    {t.frequency} MHz | {t.height}m height<br />
                    Power: {t.power} dBm | Gain: {t.gain} dBi<br />
                    📍 {parseFloat(t.lat).toFixed(5)}, {parseFloat(t.lon).toFixed(5)}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Coverage heatmap */}
            {showCoverage && coveragePoints.map((p, i) => (
              <Circle key={i} center={[p.lat, p.lon]}
                radius={150}
                pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.45, weight: 0 }}
              />
            ))}

            {/* Signal reports */}
            {showReports && signalReports.map(r => (
              <Marker key={r.id} position={[r.lat, r.lon]} icon={signalIcon(r.color)}>
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <strong>{r.operator}</strong> — {qualityLabel[r.quality]}<br />
                    RSRP: {r.rsrp} dBm<br />
                    📅 {r.created_at?.split('T')[0]}
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Suggestion marker */}
            {suggestion && (
              <Marker position={[suggestion.suggested_lat, suggestion.suggested_lon]}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="background:#f59e0b;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #f59e0b;animation:pulse 1s infinite"></div>`,
                  iconSize: [18, 18], iconAnchor: [9, 9],
                })}>
                <Popup>
                  <strong>💡 Suggested Tower Location</strong><br />
                  {suggestion.recommended_frequency} MHz | {suggestion.recommended_height}m<br />
                  {suggestion.reason}
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Map overlays toggle */}
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => setShowCoverage(v => !v)} style={toggleBtn(showCoverage, '#1565c0')}>
              {showCoverage ? '👁️' : '🚫'} Coverage
            </button>
            <button onClick={() => setShowReports(v => !v)} style={toggleBtn(showReports, '#22c55e')}>
              {showReports ? '👁️' : '🚫'} Reports
            </button>
          </div>

          {/* Status bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#0d2137cc',
            padding: '4px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 10,
            color: '#90a4ae', zIndex: 1000 }}>
            <span>🗼 {towers.length} towers | 📡 {coveragePoints.length} coverage pts | 📊 {signalReports.length} reports</span>
            <span>Tele-Twin v1.0 — Okumura-Hata RF Model</span>
          </div>

          {/* Toast */}
          {msg && (
            <div style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
              background: '#0d2137', border: '1px solid #00bcd4', color: '#fff',
              padding: '8px 18px', borderRadius: 8, fontSize: 12, zIndex: 2000, whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px #00000066' }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 6,
  padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
});
const toggleBtn = (active, color) => ({
  background: active ? color : '#1e3a5f', color: '#fff',
  border: 'none', borderRadius: 6, padding: '6px 10px',
  fontSize: 11, cursor: 'pointer', fontWeight: 600,
});
const sectionTitle = (title) => ({ marginBottom: 10,
  // not actually rendering the title here — used as wrapper flag
});
const infoBox = { background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 4,
  padding: '6px 8px', fontSize: 10, color: '#90a4ae', marginBottom: 8 };
const row = { display: 'flex', alignItems: 'center', marginBottom: 6, gap: 6 };
const lbl = { fontSize: 10, color: '#90a4ae', width: 70, flexShrink: 0 };
const inp = { flex: 1, background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 4,
  padding: '5px 7px', fontSize: 11, color: '#fff', outline: 'none' };
function kv(k, v) {
  return { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4,
    fontSize: 11 },
    children: [
      <span style={{ color: '#90a4ae' }}>{k}</span>,
      <span style={{ color: '#fff', fontWeight: 600 }}>{v}</span>
    ]
  };
}
