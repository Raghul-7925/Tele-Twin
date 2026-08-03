import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

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

// ── Animated Tower Icon ──────────────────────────────────────────────────────
function towerIcon(operator) {
  const color = OP_COLORS[operator] || '#fff';
  return L.divIcon({
    className: 'tower-icon-wrapper',
    html: `
      <div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
        <!-- Outer spreading ring 1 -->
        <div style="
          position:absolute;
          width:60px;height:60px;
          border-radius:50%;
          background:radial-gradient(circle, ${color}44 0%, ${color}00 70%);
          border:2px solid ${color}66;
          animation:towerSpread 2.5s ease-out infinite;
        "></div>
        <!-- Outer spreading ring 2 (delayed) -->
        <div style="
          position:absolute;
          width:60px;height:60px;
          border-radius:50%;
          background:radial-gradient(circle, ${color}33 0%, ${color}00 70%);
          border:2px solid ${color}44;
          animation:towerSpread 2.5s ease-out infinite 0.8s;
        "></div>
        <!-- Middle pulse ring -->
        <div style="
          position:absolute;
          width:40px;height:40px;
          border-radius:50%;
          background:radial-gradient(circle, ${color}55 0%, ${color}00 70%);
          border:2px solid ${color}88;
          animation:towerPulse 1.8s ease-out infinite;
        "></div>
        <!-- Inner core -->
        <div style="
          position:absolute;
          width:22px;height:22px;
          border-radius:50%;
          background:radial-gradient(circle, ${color}cc 0%, ${color}88 100%);
          border:2px solid ${color};
          box-shadow: 0 0 12px ${color}88, 0 0 24px ${color}44;
          animation: towerGlow 1.5s ease-in-out infinite alternate;
        "></div>
        <!-- Tower emoji -->
        <div style="
          position:relative;z-index:2;
          font-size:20px;line-height:1;
          filter:drop-shadow(0 0 6px ${color});
        ">🗼</div>
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -30],
  });
}

function signalIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;opacity:0.9;box-shadow:0 0 6px ${color}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// ── Heatmap Layer Component ─────────────────────────────────────────────────
function HeatmapLayer({ points, visible }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    // Remove existing layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!visible || !points || points.length === 0) return;

    // Check if L.heatLayer is available (loaded via CDN)
    if (!L.heatLayer) {
      console.error('leaflet.heat not loaded — L.heatLayer is undefined');
      return;
    }

    // Convert coverage points to heatmap format [lat, lon, intensity]
    const heatData = points.map(p => {
      // Normalize RSRP to intensity (0-1)
      // -50 dBm = max intensity (1.0), -120 dBm = min (0.1)
      const intensity = Math.max(0.1, Math.min(1.0, (p.rsrp + 120) / 70));
      return [p.lat, p.lon, intensity];
    });

    // Create heat layer with gradient
    heatLayerRef.current = L.heatLayer(heatData, {
      radius: 30,
      blur: 25,
      maxZoom: 15,
      max: 1.0,
      minOpacity: 0.3,
      gradient: {
        0.1: '#ef4444',   // red - no coverage
        0.3: '#f97316',   // orange - weak
        0.5: '#eab308',   // yellow - moderate
        0.7: '#84cc16',   // lime - good
        1.0: '#22c55e',   // green - excellent
      },
    }).addTo(map);

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
      }
    };
  }, [map, points, visible]);

  return null;
}

// ── Map Click Handler ────────────────────────────────────────────────────────
function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

export default function App() {
  const [towers, setTowers] = useState([]);
  const [coveragePoints, setCoveragePoints] = useState([]);
  const [signalReports, setSignalReports] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [activeTab, setActiveTab] = useState('towers');
  const [showCoverage, setShowCoverage] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    lat: '', lon: '', height: 30, frequency: 900,
    power: 43, gain: 15, operator: 'BSNL',
  });
  const [reportForm, setReportForm] = useState({
    lat: '', lon: '', rsrp: -85, operator: 'BSNL',
  });

  const mapCenter = [11.9416, 79.8083]; // Puducherry / Villupuram area

  useEffect(() => { fetchTowers(); fetchReports(); }, []);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  async function fetchTowers() {
    try { const r = await axios.get(`${API}/towers`); setTowers(r.data); } catch (e) {}
  }
  async function fetchReports() {
    try { const r = await axios.get(`${API}/signal-reports`); setSignalReports(r.data); } catch (e) {}
  }

  async function addTower() {
    if (!form.lat || !form.lon) return showMsg('📍 Tap map to set tower location');
    setLoading(true);
    try {
      await axios.post(`${API}/towers`, {
        ...form,
        lat: parseFloat(form.lat), lon: parseFloat(form.lon),
        height: parseFloat(form.height), frequency: parseFloat(form.frequency),
        power: parseFloat(form.power), gain: parseFloat(form.gain),
      });
      showMsg('✅ Tower added! Calculating coverage...');
      await fetchTowers();
      await loadAllCoverage();
    } catch (e) { showMsg('❌ Error adding tower'); }
    setLoading(false);
  }

  async function deleteTower(id) {
    await axios.delete(`${API}/towers/${id}`);
    await fetchTowers();
    await loadAllCoverage();
    showMsg('🗑️ Tower removed');
  }

  async function loadAllCoverage() {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/coverage/all`);
      setCoveragePoints(r.data.points);
      showMsg(`📡 Coverage heatmap loaded — ${r.data.count} points`);
    } catch (e) { showMsg('❌ Coverage failed'); }
    setLoading(false);
  }

  async function addReport() {
    if (!reportForm.lat || !reportForm.lon) return showMsg('📍 Tap map to set location');
    try {
      const r = await axios.post(`${API}/signal-reports`, {
        ...reportForm,
        lat: parseFloat(reportForm.lat), lon: parseFloat(reportForm.lon),
        rsrp: parseFloat(reportForm.rsrp),
      });
      showMsg(`✅ Report submitted — ${r.data.quality}`);
      await fetchReports();
    } catch (e) { showMsg('❌ Report failed'); }
  }

  async function getSuggestion() {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/suggest-tower`);
      setSuggestion(r.data);
      showMsg('💡 Suggestion ready!');
    } catch (e) { showMsg('❌ Error'); }
    setLoading(false);
  }

  function onMapClick({ lat, lng }) {
    if (activeTab === 'towers') {
      setForm(f => ({ ...f, lat: lat.toFixed(6), lon: lng.toFixed(6) }));
      showMsg(`📍 Tower location set`);
    } else if (activeTab === 'reports') {
      setReportForm(f => ({ ...f, lat: lat.toFixed(6), lon: lng.toFixed(6) }));
      showMsg(`📍 Report location set`);
    }
  }

  const qualityLabel = {
    excellent: '🟢 Excellent', good: '🟡 Good',
    weak: '🟠 Weak', none: '🔴 No Signal'
  };

  return (
    <>
      {/* Animations */}
      <style>{`
        @keyframes towerSpread {
          0%   { transform: scale(0.5); opacity: 0.9; }
          50%  { transform: scale(2.5); opacity: 0.3; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes towerPulse {
          0%   { transform: scale(0.7); opacity: 0.9; }
          70%  { transform: scale(2.0); opacity: 0; }
          100% { transform: scale(0.7); opacity: 0; }
        }
        @keyframes towerGlow {
          0%   { box-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
          100% { box-shadow: 0 0 16px currentColor, 0 0 32px currentColor; }
        }
        /* Hide default leaflet marker when using divIcon */
        .tower-icon-wrapper {
          background: transparent !important;
          border: none !important;
        }
      `}</style>

      <div style={{ display:'flex', height:'100vh', flexDirection:'column', background:'#0a1628' }}>

        {/* TOP BAR */}
        <div style={{ background:'#0d2137', borderBottom:'2px solid #00bcd4',
          padding:'8px 14px', display:'flex', alignItems:'center',
          justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>📡</span>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#00bcd4', letterSpacing:1 }}>TELE-TWIN</div>
              <div style={{ fontSize:10, color:'#90a4ae' }}>RF Coverage Planning Platform</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={loadAllCoverage} disabled={loading} style={btn('#1565c0')}>
              {loading ? '⏳' : '🗺️'} Coverage
            </button>
            <button onClick={() => { setCoveragePoints([]); setSuggestion(null); }} style={btn('#546e7a')}>
              🗑️ Clear
            </button>
          </div>
        </div>

        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* SIDEBAR */}
          <div style={{ width:300, background:'#0d2137', borderRight:'1px solid #1e3a5f',
            display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>

            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid #1e3a5f' }}>
              {[['towers','🗼 Towers'],['reports','📊 Reports'],['suggest','💡 Suggest']].map(([t,l]) => (
                <button key={t} onClick={() => setActiveTab(t)} style={{
                  flex:1, padding:'8px 4px', fontSize:11, fontWeight:600, border:'none', cursor:'pointer',
                  background: activeTab===t ? '#1565c0' : 'transparent',
                  color: activeTab===t ? '#fff' : '#90a4ae',
                  borderBottom: activeTab===t ? '2px solid #00bcd4' : '2px solid transparent',
                }}>{l}</button>
              ))}
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:12 }}>

              {/* TOWERS TAB */}
              {activeTab === 'towers' && <>
                <div style={card}>
                  <div style={cardTitle}>🗼 Add Tower</div>
                  <div style={hint}>Tap map to set location</div>
                  {[['lat','Lat'],['lon','Lon']].map(([k,l]) => (
                    <div key={k} style={rowStyle}>
                      <span style={lbl}>{l}</span>
                      <input style={inputStyle} value={form[k]} readOnly placeholder="tap map" />
                    </div>
                  ))}
                  <div style={rowStyle}>
                    <span style={lbl}>Operator</span>
                    <select style={inputStyle} value={form.operator}
                      onChange={e => setForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={rowStyle}>
                    <span style={lbl}>Frequency</span>
                    <select style={inputStyle} value={form.frequency}
                      onChange={e => setForm(f => ({...f, frequency: e.target.value}))}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f} MHz</option>)}
                    </select>
                  </div>
                  {[['height','Height (m)'],['power','Power (dBm)'],['gain','Gain (dBi)']].map(([k,l]) => (
                    <div key={k} style={rowStyle}>
                      <span style={lbl}>{l}</span>
                      <input style={inputStyle} type="number" value={form[k]}
                        onChange={e => setForm(f => ({...f, [k]: e.target.value}))} />
                    </div>
                  ))}
                  <button onClick={addTower} disabled={loading}
                    style={{...btn('#1565c0'), width:'100%', marginTop:8, padding:'9px'}}>
                    ➕ Add Tower
                  </button>
                </div>

                <div style={{ marginTop:14 }}>
                  <div style={sectionHdr}>TOWERS ({towers.length})</div>
                  {towers.map(t => (
                    <div key={t.id} style={{ ...card, display:'flex', justifyContent:'space-between', padding:'8px 10px' }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color: OP_COLORS[t.operator]||'#fff' }}>
                          🗼 {t.operator} — {t.frequency} MHz
                        </div>
                        <div style={{ fontSize:10, color:'#90a4ae' }}>
                          📍 {parseFloat(t.lat).toFixed(4)}, {parseFloat(t.lon).toFixed(4)}
                        </div>
                        <div style={{ fontSize:10, color:'#607d8b' }}>
                          H:{t.height}m P:{t.power}dBm G:{t.gain}dBi
                        </div>
                      </div>
                      <button onClick={() => deleteTower(t.id)}
                        style={{ background:'#ef4444', border:'none', color:'#fff',
                          borderRadius:4, padding:'2px 8px', cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  ))}
                  {towers.length === 0 && <div style={{ color:'#546e7a', fontSize:11, textAlign:'center', padding:16 }}>
                    No towers yet — tap map to add
                  </div>}
                </div>
              </>}

              {/* REPORTS TAB */}
              {activeTab === 'reports' && <>
                <div style={card}>
                  <div style={cardTitle}>📊 Submit Signal Report</div>
                  <div style={hint}>Tap map → enter RSRP reading</div>
                  {[['lat','Lat'],['lon','Lon']].map(([k,l]) => (
                    <div key={k} style={rowStyle}>
                      <span style={lbl}>{l}</span>
                      <input style={inputStyle} value={reportForm[k]} readOnly placeholder="tap map" />
                    </div>
                  ))}
                  <div style={rowStyle}>
                    <span style={lbl}>RSRP (dBm)</span>
                    <input style={inputStyle} type="number" value={reportForm.rsrp}
                      onChange={e => setReportForm(f => ({...f, rsrp: e.target.value}))} />
                  </div>
                  <div style={rowStyle}>
                    <span style={lbl}>Operator</span>
                    <select style={inputStyle} value={reportForm.operator}
                      onChange={e => setReportForm(f => ({...f, operator: e.target.value}))}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize:10, color:'#607d8b', marginBottom:8 }}>
                    ≥-80 Excellent | ≥-95 Good | ≥-110 Weak
                  </div>
                  <button onClick={addReport} style={{...btn('#22c55e'), width:'100%', padding:'9px'}}>
                    📤 Submit
                  </button>
                </div>
                <div style={{ marginTop:12 }}>
                  <div style={sectionHdr}>RECENT REPORTS ({signalReports.length})</div>
                  {signalReports.slice(0,10).map(r => (
                    <div key={r.id} style={{ ...card, padding:'7px 10px',
                      borderColor: r.color+'55' }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontSize:11, color: OP_COLORS[r.operator] }}>{r.operator}</span>
                        <span style={{ fontSize:11, color: r.color, fontWeight:700 }}>{r.rsrp} dBm</span>
                      </div>
                      <div style={{ fontSize:10, color:'#90a4ae' }}>
                        {qualityLabel[r.quality]} | {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lon).toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </>}

              {/* SUGGEST TAB */}
              {activeTab === 'suggest' && <>
                <div style={{ fontSize:11, color:'#90a4ae', lineHeight:1.7, marginBottom:12 }}>
                  Add towers → Calculate Coverage → then get a suggestion for the best new tower placement.
                </div>
                <button onClick={getSuggestion} disabled={loading}
                  style={{...btn('#f59e0b'), width:'100%', padding:'10px'}}>
                  💡 Suggest New Tower
                </button>
                {suggestion && (
                  <div style={{ ...card, marginTop:12, borderColor:'#f59e0b55' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#f59e0b', marginBottom:8 }}>
                      📍 Optimal Location Found
                    </div>
                    {[['Latitude', suggestion.suggested_lat],['Longitude', suggestion.suggested_lon],
                      ['Frequency', suggestion.recommended_frequency+' MHz'],
                      ['Height', suggestion.recommended_height+' m']].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                        <span style={{ color:'#90a4ae' }}>{k}</span>
                        <span style={{ color:'#fff', fontWeight:600 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ fontSize:10, color:'#90a4ae', background:'#0a1628',
                      borderRadius:4, padding:8, marginTop:6, lineHeight:1.6 }}>
                      💬 {suggestion.reason}
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div style={{ marginTop:18 }}>
                  <div style={sectionHdr}>HEATMAP LEGEND</div>
                  {[['#22c55e','Excellent (≥ -80 dBm)'],['#84cc16','Good (-80 to -95)'],
                    ['#eab308','Moderate (-95 to -105)'],['#f97316','Weak (-105 to -110)'],
                    ['#ef4444','No Coverage (< -110 dBm)']].map(([c,l]) => (
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ width:14, height:14, borderRadius:3, background:c }} />
                      <span style={{ fontSize:11, color:'#b0bec5' }}>{l}</span>
                    </div>
                  ))}
                  <div style={sectionHdr}>OPERATORS</div>
                  {Object.entries(OP_COLORS).map(([op,c]) => (
                    <div key={op} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ width:14, height:14, borderRadius:'50%', background:c }} />
                      <span style={{ fontSize:11, color:'#b0bec5' }}>{op}</span>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          </div>

          {/* MAP */}
          <div style={{ flex:1, position:'relative' }}>
            <MapContainer center={mapCenter} zoom={11}
              style={{ width:'100%', height:'100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              <MapClickHandler onMapClick={onMapClick} />

              {/* Real Heatmap Layer */}
              <HeatmapLayer points={coveragePoints} visible={showCoverage} />

              {/* Tower markers with spreading animation */}
              {towers.map(t => (
                <Marker key={t.id} position={[t.lat, t.lon]} icon={towerIcon(t.operator)}>
                  <Popup>
                    <div style={{ fontSize:13 }}>
                      <strong style={{ color: OP_COLORS[t.operator] }}>🗼 {t.operator}</strong><br />
                      {t.frequency} MHz | Height: {t.height}m<br />
                      Power: {t.power} dBm | Gain: {t.gain} dBi
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Signal reports */}
              {showReports && signalReports.map(r => (
                <Marker key={r.id} position={[r.lat, r.lon]} icon={signalIcon(r.color)}>
                  <Popup>
                    <strong>{r.operator}</strong> — {qualityLabel[r.quality]}<br />
                    RSRP: {r.rsrp} dBm
                  </Popup>
                </Marker>
              ))}

              {/* Suggestion marker */}
              {suggestion && (
                <Marker
                  position={[suggestion.suggested_lat, suggestion.suggested_lon]}
                  icon={L.divIcon({
                    className: '',
                    html: `<div style="font-size:28px;filter:drop-shadow(0 0 10px #f59e0b);animation:float 2s ease-in-out infinite alternate">💡</div>
                      <style>@keyframes float { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }</style>`,
                    iconSize: [32, 32], iconAnchor: [16, 16],
                  })}>
                  <Popup>
                    <strong>💡 Suggested Location</strong><br />
                    {suggestion.recommended_frequency} MHz | {suggestion.recommended_height}m
                  </Popup>
                </Marker>
              )}
            </MapContainer>

            {/* Toggle buttons */}
            <div style={{ position:'absolute', top:10, right:10, zIndex:1000,
              display:'flex', flexDirection:'column', gap:6 }}>
              <button onClick={() => setShowCoverage(v => !v)}
                style={toggleBtn(showCoverage, '#1565c0')}>
                {showCoverage ? '🔥' : '🚫'} Heatmap
              </button>
              <button onClick={() => setShowReports(v => !v)}
                style={toggleBtn(showReports, '#22c55e')}>
                {showReports ? '👁️' : '🚫'} Reports
              </button>
            </div>

            {/* Status bar */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0,
              background:'#0d2137cc', padding:'4px 12px', zIndex:1000,
              display:'flex', justifyContent:'space-between', fontSize:10, color:'#90a4ae' }}>
              <span>🗼 {towers.length} towers | 🔥 {coveragePoints.length} heatmap pts | 📊 {signalReports.length} reports</span>
              <span>Tele-Twin v1.0 — Okumura-Hata RF Model</span>
            </div>

            {/* Toast */}
            {msg && (
              <div style={{ position:'absolute', top:12, left:'50%',
                transform:'translateX(-50%)', background:'#0d2137',
                border:'1px solid #00bcd4', color:'#fff', padding:'8px 18px',
                borderRadius:8, fontSize:12, zIndex:2000, whiteSpace:'nowrap',
                boxShadow:'0 4px 16px #00000088' }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Styles
const btn = (bg) => ({
  background:bg, color:'#fff', border:'none', borderRadius:6,
  padding:'7px 12px', fontSize:12, cursor:'pointer', fontWeight:600,
});
const toggleBtn = (active, color) => ({
  background: active ? color : '#1e3a5f', color:'#fff',
  border:'none', borderRadius:6, padding:'6px 10px',
  fontSize:11, cursor:'pointer', fontWeight:600,
});
const card = {
  background:'#0a1628', border:'1px solid #1e3a5f',
  borderRadius:8, padding:12, marginBottom:8,
};
const cardTitle = { fontSize:12, fontWeight:700, color:'#00bcd4', marginBottom:8 };
const hint = { background:'#0d2137', border:'1px solid #1e3a5f', borderRadius:4,
  padding:'5px 8px', fontSize:10, color:'#90a4ae', marginBottom:8 };
const rowStyle = { display:'flex', alignItems:'center', marginBottom:6, gap:6 };
const lbl = { fontSize:10, color:'#90a4ae', width:75, flexShrink:0 };
const inputStyle = {
  flex:1, background:'#0d2137', border:'1px solid #1e3a5f',
  borderRadius:4, padding:'5px 7px', fontSize:11, color:'#fff', outline:'none',
};
const sectionHdr = {
  fontSize:10, color:'#00bcd4', fontWeight:700,
  marginBottom:8, marginTop:4, letterSpacing:0.5,
};
