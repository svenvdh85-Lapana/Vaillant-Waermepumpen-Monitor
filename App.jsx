import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, RefreshCcw, ZoomIn, Maximize, Info, AlertTriangle, Clock, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

/**
 * Wärmepumpen Dashboard - Google Sheets Integration
 * Erlaubt das Blättern durch die Historie in 24h-Schritten (1440 Datenpunkte).
 */

const App = () => {
  const [allData, setAllData] = useState([]); // Alle verfügbaren Daten
  const [viewIndex, setViewIndex] = useState(0); // Offset vom Ende (0 = aktuellste 24h)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State für Zoom und Pan innerhalb des Fensters
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0); 
  const [hoveredPoint, setHoveredPoint] = useState(null);
  
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const POINTS_PER_PAGE = 1440; // 24 Stunden bei 1-Min-Intervall
  const SHEET_ID = '19PhTnQKksVQL_902Oi7lDEH2KhqaYUFoqL8WZfkEskc';
  const GID = '0';
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

  const fetchSheetData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error('Netzwerk-Antwort war nicht ok.');
      
      const csvText = await response.text();
      const rows = csvText.split('\n').map(row => row.split(','));
      
      const parsedData = rows.slice(1)
        .filter(row => row.length >= 2 && row[0] !== "")
        .map((row, index) => {
          const dateStr = row[0].replace(/"/g, '');
          const valStr = row[1].replace(/"/g, '').replace(',', '.');
          return {
            time: new Date(dateStr),
            value: parseFloat(valStr) || 0,
            id: index
          };
        })
        .filter(item => !isNaN(item.time.getTime()));

      if (parsedData.length === 0) throw new Error('Keine gültigen Daten gefunden.');
      
      parsedData.sort((a, b) => a.time - b.time);
      setAllData(parsedData);
      setViewIndex(0); // Standardmäßig die neuesten Daten zeigen
    } catch (err) {
      setError("Daten konnten nicht geladen werden. Bitte prüfe die Freigabe des Sheets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheetData();
  }, []);

  // Aktueller Ausschnitt der Daten (1440 Punkte basierend auf viewIndex)
  const currentWindowData = useMemo(() => {
    if (allData.length === 0) return [];
    
    // Wir zählen von hinten: 
    // viewIndex 0 -> [length-1440, length]
    // viewIndex 1 -> [length-2880, length-1440]
    const end = allData.length - (viewIndex * POINTS_PER_PAGE);
    const start = Math.max(0, end - POINTS_PER_PAGE);
    
    return allData.slice(start, end);
  }, [allData, viewIndex]);

  const chartMetrics = useMemo(() => {
    if (currentWindowData.length === 0) return null;

    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const width = 1000;
    const height = 450;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const values = currentWindowData.map(d => d.value);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const maxVal = Math.max(...values, avgValue, 0.1) * 1.1; 
    
    const visiblePointsCount = Math.max(10, Math.floor(currentWindowData.length / zoom));
    const maxOffsetValue = currentWindowData.length - visiblePointsCount;
    const startIdx = Math.floor(panOffset * maxOffsetValue);
    const visibleData = currentWindowData.slice(startIdx, startIdx + visiblePointsCount);

    const getX = (index) => margin.left + (index / (visiblePointsCount - 1)) * chartWidth;
    const getY = (val) => margin.top + chartHeight - (val / maxVal) * chartHeight;

    const points = visibleData.map((d, i) => ({
      x: getX(i),
      y: getY(d.value),
      data: d
    }));

    const pathD = points.length > 1 ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') : "";
    const areaD = points.length > 1 ? `${pathD} L ${points[points.length - 1].x} ${margin.top + chartHeight} L ${points[0].x} ${margin.top + chartHeight} Z` : "";
    const avgY = getY(avgValue);

    return { pathD, areaD, points, margin, width, height, chartWidth, chartHeight, maxVal, visibleData, avgValue, avgY };
  }, [currentWindowData, zoom, panOffset]);

  // Navigation Funktionen
  const goBack = () => {
    if ((viewIndex + 1) * POINTS_PER_PAGE < allData.length) {
      setViewIndex(prev => prev + 1);
      setZoom(1);
      setPanOffset(0);
    }
  };

  const goForward = () => {
    if (viewIndex > 0) {
      setViewIndex(prev => prev - 1);
      setZoom(1);
      setPanOffset(0);
    }
  };

  const handleMouseDown = (e) => {
    isDragging.current = true;
    lastX.current = e.clientX || (e.touches && e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    const currentX = e.clientX || (e.touches && e.touches[0].clientX);
    if (isDragging.current) {
      const deltaX = lastX.current - currentX;
      setPanOffset(prev => Math.max(0, Math.min(1, prev + (deltaX * 0.002 / zoom))));
      lastX.current = currentX;
    }
    if (containerRef.current && chartMetrics) {
      const rect = containerRef.current.getBoundingClientRect();
      const xPos = ((currentX - rect.left) / rect.width) * chartMetrics.width;
      const closest = chartMetrics.points.reduce((p, c) => Math.abs(c.x - xPos) < Math.abs(p.x - xPos) ? c : p);
      setHoveredPoint(Math.abs(closest.x - xPos) < 20 ? closest : null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-blue-600 rounded-lg shadow-blue-200 shadow-lg">
                <Zap className="text-white" size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">Wärmepumpen-Monitor</h1>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Calendar size={14} />
                <span>Zeitraum: {currentWindowData.length > 0 ? 
                  `${currentWindowData[0].time.toLocaleDateString()} - ${currentWindowData[currentWindowData.length-1].time.toLocaleDateString()}` : 'Lade...'}</span>
            </div>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={fetchSheetData} disabled={loading} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm font-medium disabled:opacity-50">
              <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={() => { setZoom(1); setPanOffset(0); }} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl hover:bg-slate-200 transition-all font-medium">
              <Maximize size={18} />
              Reset Zoom
            </button>
          </div>
        </header>

        {/* Historie-Navigation */}
        <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <button 
            onClick={goBack} 
            disabled={loading || (viewIndex + 1) * POINTS_PER_PAGE >= allData.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-all font-semibold"
          >
            <ChevronLeft size={20} /> 24h zurück
          </button>
          
          <div className="text-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Ansicht</span>
            <span className="text-sm font-bold text-blue-600">
              {viewIndex === 0 ? "Aktuelle 24 Stunden" : `Vor ${viewIndex * 24} Stunden`}
            </span>
          </div>

          <button 
            onClick={goForward} 
            disabled={loading || viewIndex === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-all font-semibold"
          >
            24h vor <ChevronRight size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-800">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><p className="font-bold">Fehler</p><p className="text-sm">{error}</p></div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative">
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button onClick={() => setZoom(z => Math.min(30, z * 1.5))} className="p-2.5 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm hover:bg-white text-blue-600 active:scale-95 transition-transform"><ZoomIn size={20}/></button>
            <button onClick={() => setZoom(z => Math.max(1, z * 0.7))} className="p-2.5 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm hover:bg-white text-slate-600 active:scale-95 transition-transform"><span className="font-bold text-lg leading-none">−</span></button>
          </div>

          <div 
            className="w-full h-[450px] cursor-crosshair touch-none select-none relative"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => isDragging.current = false}
            onMouseLeave={() => isDragging.current = false}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={() => isDragging.current = false}
          >
            {loading && !allData.length ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20">
                <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <p className="font-medium text-slate-500">Synchronisiere Daten...</p>
              </div>
            ) : chartMetrics ? (
              <svg viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`} className="w-full h-full">
                {/* Gitter */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                  <g key={p}>
                    <line x1={chartMetrics.margin.left} x2={chartMetrics.width - chartMetrics.margin.right} y1={chartMetrics.margin.top + chartMetrics.chartHeight * p} y2={chartMetrics.margin.top + chartMetrics.chartHeight * p} stroke="#f1f5f9" strokeWidth="1" />
                    <text x={chartMetrics.margin.left - 12} y={chartMetrics.margin.top + chartMetrics.chartHeight * (1 - p) + 4} textAnchor="end" className="text-[12px] fill-slate-400 font-medium">{(chartMetrics.maxVal * p).toFixed(1)}</text>
                  </g>
                ))}

                {/* X-Achse */}
                {chartMetrics.visibleData.filter((_, i) => i % Math.max(1, Math.floor(chartMetrics.visibleData.length / 6)) === 0).map((d) => {
                  const x = chartMetrics.points.find(p => p.data.id === d.id)?.x;
                  if (!x) return null;
                  return <text key={d.id} x={x} y={chartMetrics.height - 18} textAnchor="middle" className="text-[11px] fill-slate-400 font-medium">{d.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</text>;
                })}

                <defs>
                  <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chartMetrics.areaD} fill="url(#chartGradient)" />
                <path d={chartMetrics.pathD} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* Mittelwert */}
                <g>
                  <line x1={chartMetrics.margin.left} x2={chartMetrics.width - chartMetrics.margin.right} y1={chartMetrics.avgY} y2={chartMetrics.avgY} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                  <rect x={chartMetrics.width - chartMetrics.margin.right - 90} y={chartMetrics.avgY - 25} width="85" height="20" rx="4" fill="#ef4444" />
                  <text x={chartMetrics.width - chartMetrics.margin.right - 47.5} y={chartMetrics.avgY - 11} textAnchor="middle" className="text-[10px] fill-white font-bold">Ø {chartMetrics.avgValue.toFixed(2)} kW</text>
                </g>

                {hoveredPoint && (
                  <g>
                    <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={chartMetrics.margin.top} y2={chartMetrics.height - chartMetrics.margin.bottom} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4" />
                    <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="6" fill="#2563eb" stroke="white" strokeWidth="2.5" />
                    <foreignObject x={hoveredPoint.x > chartMetrics.width - 150 ? hoveredPoint.x - 140 : hoveredPoint.x + 10} y={hoveredPoint.y - 65} width="130" height="60">
                      <div className="bg-slate-800/95 backdrop-blur text-white p-2.5 rounded-xl text-xs shadow-2xl border border-slate-700">
                        <div className="text-slate-400 mb-0.5">{hoveredPoint.data.time.toLocaleString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'})}</div>
                        <div className="text-sm font-bold text-blue-300">{hoveredPoint.data.value.toLocaleString('de-DE')} kW</div>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </svg>
            ) : null}
          </div>
        </div>

        {/* Stats Grid */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Letzter Wert im Fenster" value={currentWindowData.length > 0 ? currentWindowData[currentWindowData.length-1].value.toLocaleString('de-DE', {minimumFractionDigits: 2}) : '--'} unit="kW" color="blue" sub={`um ${currentWindowData.length > 0 ? currentWindowData[currentWindowData.length-1].time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}`} />
          <StatCard title="Spitzenwert (Fenster)" value={currentWindowData.length > 0 ? Math.max(...currentWindowData.map(d => d.value)).toLocaleString('de-DE', {maximumFractionDigits: 1}) : '--'} unit="kW" color="red" sub="Maximaler Peak" />
          <StatCard title="Ø Verbrauch (Fenster)" value={chartMetrics ? chartMetrics.avgValue.toLocaleString('de-DE', {maximumFractionDigits: 2}) : '--'} unit="kW" color="orange" sub="Durchschnitt gewählter Zeitraum" />
          <StatCard title="Datenhistorie" value={allData.length.toLocaleString('de-DE')} unit="Punkte" color="green" sub="Gesamt verfügbare Daten" />
        </section>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, unit, color, sub }) => {
  const colorMap = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    red: "text-rose-600 bg-rose-50 border-rose-100",
    orange: "text-amber-600 bg-amber-50 border-amber-100",
    green: "text-emerald-600 bg-emerald-50 border-emerald-100",
  };
  return (
    <div className={`bg-white p-6 rounded-2xl border ${colorMap[color].split(' ')[2]} shadow-sm transition-all hover:shadow-md`}>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-slate-800">{value}</span>
        <span className="text-slate-500 font-medium">{unit}</span>
      </div>
      <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{sub}</p>
    </div>
  );
};

export default App;