import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Zap, RefreshCcw, ZoomIn, ZoomOut, Maximize, Info, AlertTriangle, 
  Clock, ChevronLeft, ChevronRight, Calendar, Activity, 
  TrendingUp, BarChart3, Sun, Moon, RotateCcw 
} from 'lucide-react';

/**
 * Vaillant Premium Monitor - V3.2
 * Behebt das "White Screen" Problem durch integriertes Rendering.
 */

const App = () => {
  const [allData, setAllData] = useState([]); 
  const [viewIndex, setViewIndex] = useState(0); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0); 
  const [hoveredPoint, setHoveredPoint] = useState(null);
  
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const POINTS_PER_PAGE = 1440; 
  const SHEET_ID = '19PhTnQKksVQL_902Oi7lDEH2KhqaYUFoqL8WZfkEskc';
  const GID = '0';
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

  const fetchSheetData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(CSV_URL);
      if (!response.ok) throw new Error('Netzwerk-Fehler');
      const csvText = await response.text();
      const rows = csvText.split('\n').map(row => row.split(','));
      const parsedData = rows.slice(1)
        .filter(row => row.length >= 2 && row[0] !== "")
        .map((row, index) => ({
          time: new Date(row[0].replace(/"/g, '')),
          value: parseFloat(row[1].replace(/"/g, '').replace(',', '.')) || 0,
          id: index
        }))
        .filter(item => !isNaN(item.time.getTime()));
      parsedData.sort((a, b) => a.time - b.time);
      setAllData(parsedData);
      setViewIndex(0); 
    } catch (err) {
      setError("Datenverbindung unterbrochen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSheetData(); }, []);

  const currentWindowData = useMemo(() => {
    if (allData.length === 0) return [];
    const end = allData.length - (viewIndex * POINTS_PER_PAGE);
    const start = Math.max(0, end - POINTS_PER_PAGE);
    return allData.slice(start, end);
  }, [allData, viewIndex]);

  const cycleStats = useMemo(() => {
    if (currentWindowData.length === 0) return 0;
    let count = 0; let idleMin = 0; let active = false;
    currentWindowData.forEach(d => {
      if (d.value < 100) {
        idleMin++; if (idleMin >= 15) active = false;
      } else if (d.value > 500) {
        if (!active && idleMin >= 15) { count++; active = true; }
        idleMin = 0;
      }
    });
    return count;
  }, [currentWindowData]);

  const chartMetrics = useMemo(() => {
    if (currentWindowData.length === 0) return null;
    const margin = { top: 60, right: 30, bottom: 60, left: 75 };
    const width = 1000; const height = 500;
    const cW = width - margin.left - margin.right;
    const cH = height - margin.top - margin.bottom;

    const values = currentWindowData.map(d => d.value);
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const maxVal = Math.max(...values, avg, 100) * 1.1; 
    
    const visibleCount = Math.max(10, Math.floor(currentWindowData.length / zoom));
    const startIdx = Math.floor(panOffset * (currentWindowData.length - visibleCount));
    const visibleData = currentWindowData.slice(startIdx, startIdx + visibleCount);

    const getX = (i) => margin.left + (i / (visibleCount - 1)) * cW;
    const getY = (v) => margin.top + cH - (v / maxVal) * cH;

    const points = visibleData.map((d, i) => ({ x: getX(i), y: getY(d.value), data: d }));
    const avgY = getY(avg);

    let pathD = "";
    let areaD = "";
    if (points.length > 1) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
      }
      areaD = `${pathD} L ${points[points.length - 1].x} ${margin.top + cH} L ${points[0].x} ${margin.top + cH} Z`;
    }

    return { points, pathD, areaD, margin, width, height, cW, cH, maxVal, visibleData, avg, avgY };
  }, [currentWindowData, zoom, panOffset]);

  const timeIcons = useMemo(() => {
     if (!chartMetrics) return [];
     const icons = [];
     const step = Math.floor(chartMetrics.visibleData.length / 8);
     for (let i = 0; i < chartMetrics.visibleData.length; i += Math.max(1, step)) {
       const h = chartMetrics.visibleData[i].time.getHours();
       icons.push({ x: chartMetrics.points[i]?.x, Icon: (h > 6 && h < 18 ? Sun : Moon), hour: h });
     }
     return icons;
  }, [chartMetrics]);

  const handleMouseMove = (e) => {
    const cX = e.clientX || (e.touches && e.touches[0].clientX);
    if (isDragging.current) {
      setPanOffset(p => Math.max(0, Math.min(1, p + (lastX.current - cX) * 0.002 / zoom)));
      lastX.current = cX;
    }
    if (containerRef.current && chartMetrics) {
      const rect = containerRef.current.getBoundingClientRect();
      const xPos = ((cX - rect.left) / rect.width) * chartMetrics.width;
      const closest = chartMetrics.points.reduce((p, c) => Math.abs(c.x - xPos) < Math.abs(p.x - xPos) ? c : p);
      setHoveredPoint(Math.abs(closest.x - xPos) < 30 ? closest : null);
    }
  };

  const timeRangeLabel = useMemo(() => {
    if (currentWindowData.length === 0) return "";
    const start = currentWindowData[0].time;
    const end = currentWindowData[currentWindowData.length - 1].time;
    const f = (d) => d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `${f(start)} bis ${f(end)}`;
  }, [currentWindowData]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans p-3 sm:p-6 md:p-10 overflow-x-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
         <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-cyan-900 rounded-full blur-[150px]"></div>
         <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-blue-900 rounded-full blur-[150px]"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="p-4 bg-gradient-to-tr from-cyan-600 to-blue-700 rounded-2xl shadow-[0_0_40px_rgba(8,145,178,0.3)] border border-cyan-400/30">
              <Zap className="text-white fill-white/10" size={32} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase italic">
                Vaillant <span className="text-cyan-400 not-italic">Live</span>
              </h1>
              <div className="flex items-center gap-3 text-slate-400 text-xs sm:text-sm mt-1 font-bold">
                <Calendar size={14} className="text-cyan-500" /> {currentWindowData.length > 0 ? currentWindowData[0].time.toLocaleDateString() : '--'}
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
                Monitoring
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full lg:w-auto">
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <HeaderBtn onClick={fetchSheetData} icon={<RefreshCcw size={18} className={loading ? 'animate-spin' : ''}/>} label="Refresh" />
              <HeaderBtn onClick={() => { setZoom(1); setPanOffset(0); }} icon={<Maximize size={18}/>} label="Reset" primary />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeaderBtn onClick={() => setZoom(z => Math.min(30, z * 1.5))} icon={<ZoomIn size={18}/>} label="Zoom +" />
              <HeaderBtn onClick={() => setZoom(z => Math.max(1, z * 0.7))} icon={<ZoomOut size={18}/>} label="Zoom -" />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <StatCard title="Peak (24h)" value={currentWindowData.length > 0 ? Math.max(...currentWindowData.map(d => d.value)) : 0} unit="W" icon={<TrendingUp className="text-rose-400" />} color="rose" />
          <StatCard title="Ø-Leistung (24h)" value={chartMetrics ? chartMetrics.avg : 0} unit="W" icon={<BarChart3 className="text-amber-400" />} color="amber" />
          <StatCard title="Takte (24h)" value={cycleStats} unit="Starts" icon={<RotateCcw className="text-cyan-400" />} color="cyan" />
          <StatCard title="Status" value="Normal" unit="" icon={<Activity className="text-emerald-400" />} color="emerald" isStatus trend="Online" />
        </section>

        <div className="bg-slate-900/60 backdrop-blur-2xl rounded-[2rem] sm:rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden mb-10">
          <div className="px-6 sm:px-10 pt-6 sm:pt-10 flex flex-col sm:flex-row justify-between items-center border-b border-white/5 pb-6 gap-6">
            <div className="w-full sm:w-auto flex items-center gap-8 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
              {timeIcons.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 min-w-[40px]">
                  <item.Icon size={20} className={item.Icon === Sun ? "text-amber-400" : "text-blue-400"} />
                  <span className="text-[10px] font-black text-slate-500">{item.hour}:00</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
               <NavBtn onClick={() => { setViewIndex(v => v + 1); setZoom(1); }} icon={<ChevronLeft size={22}/>} label="-24h" />
               <NavBtn onClick={() => { setViewIndex(v => v - 1); setZoom(1); }} icon={<ChevronRight size={22}/>} label="+24h" active={viewIndex > 0} />
            </div>
          </div>

          <div 
            className="w-full h-[400px] sm:h-[550px] relative cursor-crosshair touch-none select-none" 
            ref={containerRef}
            onMouseDown={(e) => { isDragging.current = true; lastX.current = e.clientX; }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => isDragging.current = false}
            onMouseLeave={() => isDragging.current = false}
            onTouchStart={(e) => { isDragging.current = true; lastX.current = e.touches[0].clientX; }}
            onTouchMove={handleMouseMove}
            onTouchEnd={() => isDragging.current = false}
          >
            {chartMetrics && (
              <svg viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`} className="w-full h-full">
                <defs>
                  <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <text transform={`translate(25, ${chartMetrics.height / 2}) rotate(-90)`} textAnchor="middle" className="text-[10px] fill-white/20 font-black uppercase tracking-[0.4em]">Leistung in Watt</text>
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                  <g key={p}>
                    <line x1={chartMetrics.margin.left} x2={chartMetrics.width - chartMetrics.margin.right} y1={chartMetrics.margin.top + chartMetrics.cH * (1-p)} y2={chartMetrics.margin.top + chartMetrics.cH * (1-p)} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
                    <text x={chartMetrics.margin.left - 15} y={chartMetrics.margin.top + chartMetrics.cH * (1-p) + 4} textAnchor="end" className="text-[12px] fill-slate-500 font-bold">{(chartMetrics.maxVal * p).toFixed(0)}</text>
                  </g>
                ))}
                <path d={chartMetrics.areaD} fill="url(#areaGrad)" />
                <path d={chartMetrics.pathD} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />
                <g filter="url(#glow)">
                  <line x1={chartMetrics.margin.left} x2={chartMetrics.width - chartMetrics.margin.right} y1={chartMetrics.avgY} y2={chartMetrics.avgY} stroke="#f59e0b" strokeWidth="3" strokeDasharray="10,5" />
                  <text x={chartMetrics.width - chartMetrics.margin.right} y={chartMetrics.avgY - 10} textAnchor="end" className="text-[11px] fill-amber-400 font-black uppercase tracking-wider shadow-sm">Ø-Leistung (24h): {chartMetrics.avg.toFixed(0)} W</text>
                </g>
                {hoveredPoint && (
                  <g>
                    <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={chartMetrics.margin.top} y2={chartMetrics.height - chartMetrics.margin.bottom} stroke="white" strokeOpacity="0.2" strokeWidth="1" />
                    <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="8" fill="#22d3ee" stroke="#020617" strokeWidth="3" />
                    <foreignObject x={hoveredPoint.x > chartMetrics.width - 180 ? hoveredPoint.x - 170 : hoveredPoint.x + 20} y={hoveredPoint.y - 80} width="150" height="90">
                      <div className="bg-slate-950/90 border border-white/10 p-3 rounded-2xl shadow-2xl backdrop-blur-xl">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{hoveredPoint.data.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} Uhr</div>
                        <div className="text-2xl font-black text-white">{hoveredPoint.data.value.toFixed(0)}<span className="text-cyan-400 text-sm ml-1">W</span></div>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </svg>
            )}
          </div>
          
          <div className="px-6 sm:px-10 py-5 bg-black/40 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
             <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-[0.2em]"><Info size={16} className="text-cyan-500"/> Swipe zum Scrollen • Pinch zum Zoomen</div>
             <div className="text-[10px] sm:text-xs font-black text-cyan-400 bg-cyan-400/10 px-3 py-1 rounded-full border border-cyan-400/20">{timeRangeLabel}</div>
          </div>
        </div>

        <footer className="text-center pb-12 opacity-40">
           <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.5em]">System-ID: {SHEET_ID.slice(0,8)} • Vaillant Dashboard v3.2</p>
        </footer>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, unit, icon, color, isStatus, trend }) => {
  const colors = {
    rose: "from-rose-500/20 to-rose-900/10 border-rose-500/30",
    amber: "from-amber-500/20 to-amber-900/10 border-amber-500/30",
    cyan: "from-cyan-500/20 to-cyan-900/10 border-cyan-500/30",
    emerald: "from-emerald-500/20 to-emerald-900/10 border-emerald-500/30"
  };
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${colors[color]} border p-4 sm:p-6 rounded-[2rem] group transition-all hover:scale-[1.02] shadow-xl`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-900/80 rounded-xl group-hover:rotate-12 transition-transform border border-white/5">{icon}</div>
        {isStatus && <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-emerald-500/30">Online</div>}
      </div>
      <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest mb-1">{title}</p>
      <div className="flex items-baseline gap-1 sm:gap-2">
        <span className="text-2xl sm:text-4xl font-black text-white tracking-tighter">
          {typeof value === 'number' ? value.toLocaleString('de-DE', { maximumFractionDigits: 0 }) : value}
        </span>
        <span className="text-slate-500 font-bold text-xs sm:text-sm uppercase">{unit}</span>
      </div>
    </div>
  );
};

const HeaderBtn = ({ onClick, icon, label, primary }) => (
  <button onClick={onClick} className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 border ${primary ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_20px_rgba(8,145,178,0.3)]' : 'bg-slate-900/80 border-white/10 text-slate-300 hover:bg-slate-800'}`}>
    {icon} {label}
  </button>
);

const NavBtn = ({ onClick, icon, label, active = true }) => (
  <button onClick={onClick} disabled={!active} className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${active ? 'bg-slate-800 border-white/10 text-white hover:bg-slate-700' : 'opacity-20 border-transparent text-slate-600'}`}>
    {icon} {label}
  </button>
);

// --- RENDERING BLOCK FÜR ECHTE BROWSER (Vite/Vercel) ---
const container = document.getElementById('root');
if (container) {
    // Verhindert mehrfaches Rendern in Vorschau-Umgebungen
    if (!window.__app_rendered) {
        window.__app_rendered = true;
        const root = createRoot(container);
        root.render(<App />);
    }
}

export default App;