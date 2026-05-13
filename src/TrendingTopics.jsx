import { useState, useEffect } from "react";

const TYPE_COLORS = {
  stock:     { bg: "rgba(124,107,255,0.12)", border: "rgba(124,107,255,0.3)", label: "#7c6bff",  text: "Acción"   },
  crypto:    { bg: "rgba(251,146,60,0.12)",  border: "rgba(251,146,60,0.3)",  label: "#fb923c",  text: "Crypto"   },
  commodity: { bg: "rgba(250,204,21,0.12)",  border: "rgba(250,204,21,0.3)",  label: "#facc15",  text: "Materia"  },
};

function MiniChart({ data, positive }) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const color = positive ? "#4ade80" : "#f87171";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`g${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export default function TrendingTopics({ onSelectTicker }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [genDate, setGenDate] = useState(null);
  const [cached,  setCached]  = useState(false);

  useEffect(() => { loadTrending(false); }, []);

  // forceRefresh=true omite el caché y pide datos frescos a Claude
  async function loadTrending(forceRefresh = false) {
    setLoading(true); setError(null);
    try {
      const url = forceRefresh ? "/api/trending?refresh=true" : "/api/trending";
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setItems(d.items || []);
      setGenDate(d.generatedAt);
      setCached(d.cached);
    } catch (e) {
      setError("No se pudo cargar el trending. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <style>{`
        .tt-wrap { background: var(--sf); border: 1px solid var(--bd); border-radius: var(--rr); padding: 20px; }
        .tt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
        .tt-title { font-family: var(--fn); font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--ac); }
        .tt-meta { font-family: var(--fn); font-size: 10px; color: var(--mu); }
        .tt-refresh { background: none; border: 1px solid var(--bd); border-radius: 6px; color: var(--di); font-family: var(--fn); font-size: 10px; padding: 4px 10px; cursor: pointer; transition: all .15s; }
        .tt-refresh:hover { border-color: var(--ac); color: var(--tx); }
        .tt-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
        .tt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .tt-card { background: var(--s2); border-radius: 10px; padding: 14px; border: 1px solid var(--bd); cursor: pointer; transition: all .18s; position: relative; overflow: hidden; }
        .tt-card:hover { border-color: var(--ac); transform: translateY(-2px); box-shadow: 0 4px 16px var(--gl); }
        .tt-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
        .tt-ticker { font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
        .tt-type { font-family: var(--fn); font-size: 9px; padding: 2px 7px; border-radius: 99px; }
        .tt-name { font-family: var(--fn); font-size: 10px; color: var(--mu); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tt-price { font-size: 18px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 4px; }
        .tt-changes { display: flex; gap: 10px; margin-bottom: 10px; }
        .tt-change { font-family: var(--fn); font-size: 10px; display: flex; flex-direction: column; gap: 1px; }
        .tt-change-lbl { font-size: 8px; opacity: .5; text-transform: uppercase; letter-spacing: .08em; }
        .tt-chart { display: flex; justify-content: flex-end; }
        .tt-reason { font-family: var(--fn); font-size: 10px; color: var(--di); margin-top: 8px; line-height: 1.5; padding-top: 8px; border-top: 1px solid var(--bd); }
        .tt-analyze { position: absolute; bottom: 0; left: 0; right: 0; background: var(--ac); color: #fff; text-align: center; font-family: var(--fn); font-size: 11px; font-weight: 600; padding: 7px; transform: translateY(100%); transition: transform .2s; }
        .tt-card:hover .tt-analyze { transform: translateY(0); }
        .tt-empty { font-family: var(--fn); font-size: 11px; color: var(--mu); text-align: center; padding: 24px; }
        .tt-skel { border-radius: 10px; background: linear-gradient(90deg,var(--s2) 25%,var(--bd) 50%,var(--s2) 75%); background-size: 200% 100%; animation: ske 1.4s infinite; height: 160px; }
        @keyframes ske { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .tt-cached { font-family: var(--fn); font-size: 9px; color: var(--mu); margin-left: 6px; }
      `}</style>

      <div className="tt-wrap">
        <div className="tt-header">
          <div>
            <div className="tt-title">🔥 Trending esta semana</div>
            {genDate && (
              <div className="tt-meta">
                Actualizado: {genDate}
                {cached && <span className="tt-cached">· desde caché</span>}
              </div>
            )}
          </div>
          {/* onClick pasa forceRefresh=true para saltar el caché */}
          <button className="tt-refresh" onClick={() => loadTrending(true)} disabled={loading}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>

        {error && <div className="tt-empty">⚠ {error}</div>}

        {loading && (
          <div className="tt-grid">
            {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="tt-skel"/>)}
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="tt-grid">
            {items.map((item, i) => {
              const tc = TYPE_COLORS[item.type] || TYPE_COLORS.stock;
              const pos24 = item.change24h >= 0;
              const posW  = item.changeWeek >= 0;
              const fmt = n => n >= 1000
                ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

              return (
                <div key={i} className="tt-card" onClick={() => onSelectTicker && onSelectTicker(item.ticker)}>
                  <div className="tt-card-top">
                    <div className="tt-ticker">{item.ticker}</div>
                    <div className="tt-type" style={{ background: tc.bg, border: `1px solid ${tc.border}`, color: tc.label }}>
                      {tc.text}
                    </div>
                  </div>
                  <div className="tt-name">{item.name}</div>
                  <div className="tt-price">${fmt(item.price)}</div>
                  <div className="tt-changes">
                    <div className="tt-change">
                      <span className="tt-change-lbl">24h</span>
                      <span style={{ color: pos24 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                        {pos24 ? "▲" : "▼"} {Math.abs(item.change24h).toFixed(2)}%
                      </span>
                    </div>
                    <div className="tt-change">
                      <span className="tt-change-lbl">Semana</span>
                      <span style={{ color: posW ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                        {posW ? "▲" : "▼"} {Math.abs(item.changeWeek).toFixed(2)}%
                      </span>
                    </div>
                    {item.volume && (
                      <div className="tt-change">
                        <span className="tt-change-lbl">Volumen</span>
                        <span style={{ color: "var(--di)", fontWeight: 600 }}>{item.volume}</span>
                      </div>
                    )}
                  </div>
                  <div className="tt-chart">
                    <MiniChart data={item.sparkline} positive={posW}/>
                  </div>
                  {item.reason && <div className="tt-reason">💡 {item.reason}</div>}
                  <div className="tt-analyze">Analizar {item.ticker} →</div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="tt-empty">No hay datos disponibles</div>
        )}
      </div>
    </div>
  );
}
