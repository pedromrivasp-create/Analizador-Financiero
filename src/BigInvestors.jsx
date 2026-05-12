import { useState, useEffect } from "react";

const ACTION_STYLE = {
  "compró":   { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  icon: "↑" },
  "aumentó":  { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  icon: "↑" },
  "vendió":   { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "↓" },
  "redujo":   { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "↓" },
  "mantiene": { color: "#facc15", bg: "rgba(250,204,21,0.12)",  icon: "→" },
};

function AllocationBar({ value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "var(--bd)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width .5s ease" }}/>
      </div>
      <span style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--di)", minWidth: 32, textAlign: "right" }}>{value?.toFixed(1)}%</span>
    </div>
  );
}

function InvestorCard({ investor, onSelectTicker }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("positions");
  const as = ACTION_STYLE;

  return (
    <div style={{
      background: "var(--sf)", border: `1px solid var(--bd)`, borderRadius: "var(--rr)",
      marginBottom: 10, overflow: "hidden", transition: "border-color .2s",
      ...(expanded ? { borderColor: investor.color + "55" } : {})
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(135deg, ${investor.color}33, ${investor.color}11)`,
          border: `2px solid ${investor.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
        }}>
          {investor.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", marginBottom: 2 }}>{investor.name}</div>
          <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)" }}>{investor.title}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "var(--fn)", fontSize: 9, padding: "3px 10px", borderRadius: 99,
            background: `${investor.color}18`, border: `1px solid ${investor.color}33`, color: investor.color,
            marginBottom: 4
          }}>
            {investor.currentFocus?.slice(0, 30)}{investor.currentFocus?.length > 30 ? "…" : ""}
          </div>
          <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)" }}>
            {expanded ? "▲ cerrar" : "▼ ver más"}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: `1px solid var(--bd)`, padding: "16px 20px" }}>
          {/* Quote */}
          <div style={{
            background: `${investor.color}0d`, border: `1px solid ${investor.color}22`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 16,
            fontFamily: "var(--fn)", fontSize: 12, color: "var(--di)", lineHeight: 1.6,
            fontStyle: "italic"
          }}>
            "{investor.quote}"
          </div>

          {/* Strategy */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--fn)", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--mu)", marginBottom: 6 }}>
              Estrategia
            </div>
            <div style={{ fontFamily: "var(--fn)", fontSize: 12, color: "var(--di)", lineHeight: 1.6 }}>
              {investor.strategy}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[["positions", "📊 Top posiciones"], ["moves", "🔄 Movimientos recientes"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "var(--fn)", fontSize: 11, fontWeight: 600, transition: "all .15s",
                background: tab === id ? investor.color : "var(--s2)",
                color: tab === id ? "#fff" : "var(--di)",
              }}>{label}</button>
            ))}
          </div>

          {/* Top Positions */}
          {tab === "positions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(investor.topPositions || []).map((pos, i) => {
                const act = as[pos.action] || as["mantiene"];
                return (
                  <div key={i} style={{ background: "var(--s2)", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <button
                        onClick={() => onSelectTicker && onSelectTicker(pos.ticker)}
                        style={{
                          background: `${investor.color}18`, border: `1px solid ${investor.color}33`,
                          color: investor.color, fontFamily: "var(--fn)", fontSize: 12, fontWeight: 700,
                          padding: "3px 10px", borderRadius: 6, cursor: "pointer"
                        }}
                      >{pos.ticker}</button>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{pos.name}</span>
                      <span style={{
                        fontFamily: "var(--fn)", fontSize: 10, padding: "2px 8px", borderRadius: 99,
                        background: act.bg, color: act.color
                      }}>{act.icon} {pos.action}</span>
                    </div>
                    <AllocationBar value={pos.allocation} color={investor.color}/>
                    {pos.comment && (
                      <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)", marginTop: 6, lineHeight: 1.5 }}>
                        💡 {pos.comment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Moves */}
          {tab === "moves" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(investor.recentMoves || []).map((move, i) => {
                const act = as[move.action] || as["mantiene"];
                return (
                  <div key={i} style={{
                    background: "var(--s2)", borderRadius: 8, padding: "12px 14px",
                    borderLeft: `3px solid ${act.color}`
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={() => onSelectTicker && onSelectTicker(move.ticker)}
                        style={{
                          background: act.bg, border: `1px solid ${act.color}44`,
                          color: act.color, fontFamily: "var(--fn)", fontSize: 12, fontWeight: 700,
                          padding: "3px 10px", borderRadius: 6, cursor: "pointer"
                        }}
                      >{move.ticker}</button>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{move.name}</span>
                      <span style={{ fontFamily: "var(--fn)", fontSize: 10, color: act.color, fontWeight: 700 }}>
                        {act.icon} {move.action}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
                      {move.amount && (
                        <span style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--di)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4 }}>
                          💰 {move.amount}
                        </span>
                      )}
                      {move.date && (
                        <span style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)" }}>
                          📅 {move.date}
                        </span>
                      )}
                    </div>
                    {move.reason && (
                      <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)", lineHeight: 1.5 }}>
                        {move.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BigInvestors({ onSelectTicker }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/big-investors");
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError("No se pudo cargar la información. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <style>{`
        .bi-wrap { background: var(--sf); border: 1px solid var(--bd); border-radius: var(--rr); padding: 20px; }
        .bi-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
        .bi-title { font-family: var(--fn); font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--ac); }
        .bi-meta { font-family: var(--fn); font-size: 10px; color: var(--mu); margin-top: 3px; }
        .bi-refresh { background: none; border: 1px solid var(--bd); border-radius: 6px; color: var(--di); font-family: var(--fn); font-size: 10px; padding: 4px 10px; cursor: pointer; transition: all .15s; }
        .bi-refresh:hover { border-color: var(--ac); color: var(--tx); }
        .bi-skel { border-radius: var(--rr); background: linear-gradient(90deg,var(--s2) 25%,var(--bd) 50%,var(--s2) 75%); background-size: 200% 100%; animation: ske 1.4s infinite; height: 80px; margin-bottom: 10px; }
        @keyframes ske { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .bi-disclaimer { font-family: var(--fn); font-size: 10px; color: var(--mu); padding: 10px 14px; background: var(--s2); border-radius: 8px; margin-top: 10px; line-height: 1.5; }
      `}</style>

      <div className="bi-wrap">
        <div className="bi-header">
          <div>
            <div className="bi-title">🏦 En qué invierten los grandes</div>
            {data?.generatedAt && (
              <div className="bi-meta">
                Actualizado: {data.generatedAt}
                {data.cached && <span style={{ marginLeft: 6, opacity: .6 }}>· desde caché</span>}
              </div>
            )}
          </div>
          <button className="bi-refresh" onClick={loadData} disabled={loading}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>

        {error && (
          <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)", textAlign: "center", padding: 24 }}>
            ⚠ {error}
          </div>
        )}

        {loading && [0,1,2,3].map(i => <div key={i} className="bi-skel"/>)}

        {!loading && !error && data?.investors && (
          <>
            {data.investors.map(inv => (
              <InvestorCard key={inv.id} investor={inv} onSelectTicker={onSelectTicker}/>
            ))}
            <div className="bi-disclaimer">
              ⚠ Esta información es educativa y de referencia. Los datos de portafolios provienen de reportes públicos (SEC 13F) con rezago de hasta 45 días. No constituye asesoría financiera.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
