import { useState, useEffect, useRef } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function fmt(n, decimals = 2) {
  if (!n && n !== 0) return "—";
  const num = Number(n);
  if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: 4 });
}

function PnlBadge({ value }) {
  const pos = value >= 0;
  return (
    <span style={{
      fontFamily: "var(--fn)", fontSize: 11, fontWeight: 700,
      color: pos ? "#4ade80" : "#f87171",
      background: pos ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
      border: `1px solid ${pos ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
      borderRadius: 99, padding: "2px 8px",
    }}>
      {pos ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

export default function PortfolioPanel({ onClose, trendingData, bigInvestorsData }) {
  const [step, setStep]       = useState("input"); // input | creating | active | closed
  const [amount, setAmount]   = useState("");
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]     = useState(null);
  const intervalRef = useRef(null);

  // Cargar portfolio guardado en localStorage si existe
  useEffect(() => {
    const saved = localStorage.getItem("portfolioId");
    if (saved) fetchPortfolio(saved);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Auto-refresh cada 10 minutos si hay portfolio activo
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (portfolio?.status === "active") {
      intervalRef.current = setInterval(() => refreshPortfolio(portfolio.id), 10 * 60 * 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [portfolio?.id, portfolio?.status]);

  async function fetchPortfolio(id) {
    try {
      const r = await fetch(`/api/portfolio?portfolioId=${id}`);
      const d = await r.json();
      if (!d.error) {
        setPortfolio(d);
        setStep(d.status === "closed" ? "closed" : "active");
      }
    } catch {}
  }

  async function createPortfolio() {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) { setError("Ingresa un monto mínimo de $10"); return; }
    setLoading(true); setError(null); setStep("creating");

    const messages = [
      "🤖 Analizando trending topics…",
      "📊 Consultando portafolios de grandes inversores…",
      "🧠 IA distribuyendo tu inversión…",
      "💰 Obteniendo precios reales…",
      "✅ Creando tu portafolio virtual…",
    ];
    let mi = 0;
    setLoadingMsg(messages[0]);
    const msgInterval = setInterval(() => {
      mi = (mi + 1) % messages.length;
      setLoadingMsg(messages[mi]);
    }, 3000);

    try {
      const r = await fetch("/api/portfolio?action=create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, trendingData, bigInvestorsData }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPortfolio(d);
      setStep("active");
      localStorage.setItem("portfolioId", d.id);
    } catch (e) {
      setError("Error creando portafolio: " + e.message);
      setStep("input");
    } finally {
      clearInterval(msgInterval);
      setLoading(false);
    }
  }

  async function refreshPortfolio(id) {
    try {
      const r = await fetch(`/api/portfolio?action=refresh&portfolioId=${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const d = await r.json();
      if (!d.error) setPortfolio(d);
    } catch {}
  }

  async function closePortfolio() {
    if (!portfolio) return;
    if (!confirm("¿Retirar todo el dinero virtual y cerrar el portafolio?")) return;
    try {
      const r = await fetch(`/api/portfolio?portfolioId=${portfolio.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!d.error) { setPortfolio(d); setStep("closed"); }
    } catch {}
  }

  function resetPortfolio() {
    localStorage.removeItem("portfolioId");
    setPortfolio(null);
    setStep("input");
    setAmount("");
    setError(null);
  }

  const pnlColor = portfolio?.totalPnl >= 0 ? "#4ade80" : "#f87171";
  const pnlBg    = portfolio?.totalPnl >= 0
    ? "linear-gradient(135deg,rgba(74,222,128,0.13),rgba(74,222,128,0.04))"
    : "linear-gradient(135deg,rgba(248,113,113,0.13),rgba(248,113,113,0.04))";
  const pnlBorder = portfolio?.totalPnl >= 0
    ? "1px solid rgba(74,222,128,0.3)"
    : "1px solid rgba(248,113,113,0.3)";

  return (
    <>
      <style>{`
        .pf-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:flex-end;justify-content:center;animation:pfFi .2s ease }
        @keyframes pfFi { from{opacity:0} to{opacity:1} }
        .pf-panel { background:var(--bg);border:1px solid var(--bd);border-bottom:none;border-radius:20px 20px 0 0;width:100%;max-width:740px;max-height:90vh;overflow-y:auto;padding:24px 20px 40px;animation:pfUp .25s ease }
        @keyframes pfUp { from{transform:translateY(40px);opacity:0} to{transform:none;opacity:1} }
        .pf-handle { width:40px;height:4px;background:var(--bd);border-radius:99px;margin:0 auto 20px }
        .pf-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:20px }
        .pf-title { font-size:18px;font-weight:800;letter-spacing:-.02em }
        .pf-close { background:var(--s2);border:1px solid var(--bd);border-radius:99px;color:var(--mu);font-size:14px;padding:4px 12px;cursor:pointer;font-family:var(--fn) }
        .pf-close:hover { border-color:var(--bda);color:var(--tx) }
        .pf-input-wrap { background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:20px;margin-bottom:12px }
        .pf-label { font-family:var(--fn);font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--mu);margin-bottom:8px }
        .pf-amount-row { display:flex;gap:10px;margin-bottom:14px }
        .pf-input { flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--fn);font-size:22px;font-weight:700;padding:12px 16px;outline:none;transition:border-color .2s }
        .pf-input:focus { border-color:var(--ac) }
        .pf-presets { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px }
        .pf-preset { font-family:var(--fn);font-size:11px;padding:5px 12px;border-radius:6px;background:var(--s2);border:1px solid var(--bd);color:var(--di);cursor:pointer;transition:all .15s }
        .pf-preset:hover { border-color:var(--ac);color:var(--tx) }
        .pf-btn { width:100%;padding:14px;border-radius:10px;background:var(--ac);color:#fff;font-family:var(--fs);font-size:15px;font-weight:700;border:none;cursor:pointer;transition:all .15s;box-shadow:0 4px 20px var(--gl) }
        .pf-btn:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 8px 28px var(--gl) }
        .pf-btn:disabled { opacity:.5;cursor:not-allowed }
        .pf-btn-danger { background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);color:#f87171;box-shadow:none }
        .pf-btn-danger:hover { background:rgba(248,113,113,0.25) }
        .pf-btn-ghost { background:var(--s2);border:1px solid var(--bd);color:var(--di);box-shadow:none }
        .pf-btn-ghost:hover { border-color:var(--ac);color:var(--tx) }
        .pf-summary { border-radius:12px;padding:18px 20px;margin-bottom:14px }
        .pf-summary-top { display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px }
        .pf-value { font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1 }
        .pf-pnl { font-family:var(--fn);font-size:13px;margin-top:4px }
        .pf-meta { font-family:var(--fn);font-size:10px;color:var(--mu);margin-top:4px }
        .pf-stats { display:flex;gap:16px;flex-wrap:wrap }
        .pf-stat { font-family:var(--fn);font-size:11px;display:flex;flex-direction:column;gap:2px }
        .pf-stat-lbl { font-size:8px;opacity:.5;text-transform:uppercase;letter-spacing:.1em }
        .pf-positions { display:flex;flex-direction:column;gap:8px;margin-bottom:14px }
        .pf-pos { background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap }
        .pf-pos-ticker { font-size:16px;font-weight:800;min-width:52px }
        .pf-pos-info { flex:1;min-width:140px }
        .pf-pos-name { font-family:var(--fn);font-size:10px;color:var(--mu);margin-bottom:3px }
        .pf-pos-prices { display:flex;gap:12px;align-items:center;flex-wrap:wrap }
        .pf-pos-price { font-family:var(--fn);font-size:12px }
        .pf-pos-amount { font-family:var(--fn);font-size:11px;color:var(--di);text-align:right }
        .pf-strategy { background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:14px }
        .pf-reason { font-family:var(--fn);font-size:10px;color:var(--mu);margin-top:4px;line-height:1.5 }
        .pf-refresh-row { display:flex;gap:8px;margin-bottom:14px }
        .pf-chart { background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:16px;margin-bottom:14px }
        .pf-creating { display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:16px }
        .pf-spinner { width:40px;height:40px;border:3px solid var(--bd);border-top-color:var(--ac);border-radius:50%;animation:spin .7s linear infinite }
        @keyframes spin { to{transform:rotate(360deg)} }
        .pf-creating-msg { font-family:var(--fn);font-size:12px;color:var(--di);text-align:center;animation:fi .3s ease }
        @keyframes fi { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        .pf-error { background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;padding:10px 14px;font-family:var(--fn);font-size:12px;color:#f87171;margin-bottom:12px }
        .pf-closed-banner { background:rgba(124,107,255,0.12);border:1px solid rgba(124,107,255,0.3);border-radius:10px;padding:16px;margin-bottom:14px;text-align:center }
      `}</style>

      <div className="pf-overlay" onClick={e => e.target.className === "pf-overlay" && onClose()}>
        <div className="pf-panel">
          <div className="pf-handle"/>
          <div className="pf-header">
            <div className="pf-title">💼 Portafolio Virtual IA</div>
            <button className="pf-close" onClick={onClose}>✕ Cerrar</button>
          </div>

          {/* ── PASO: CREATING ── */}
          {step === "creating" && (
            <div className="pf-creating">
              <div className="pf-spinner"/>
              <div className="pf-creating-msg">{loadingMsg}</div>
              <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)" }}>
                Esto puede tomar hasta 30 segundos…
              </div>
            </div>
          )}

          {/* ── PASO: INPUT ── */}
          {step === "input" && (
            <>
              {error && <div className="pf-error">⚠ {error}</div>}
              <div className="pf-input-wrap">
                <div className="pf-label">¿Cuánto quieres invertir virtualmente?</div>
                <div className="pf-amount-row">
                  <span style={{ fontFamily: "var(--fn)", fontSize: 22, fontWeight: 700, padding: "12px 0", color: "var(--mu)" }}>$</span>
                  <input
                    className="pf-input"
                    type="number"
                    min="10"
                    placeholder="100"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && createPortfolio()}
                  />
                  <span style={{ fontFamily: "var(--fn)", fontSize: 12, padding: "14px 0", color: "var(--mu)" }}>USD</span>
                </div>
                <div className="pf-label">Montos rápidos</div>
                <div className="pf-presets">
                  {[50, 100, 250, 500, 1000].map(v => (
                    <button key={v} className="pf-preset" onClick={() => setAmount(String(v))}>
                      ${v}
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", marginBottom: 14, lineHeight: 1.6 }}>
                  🤖 La IA distribuirá tu dinero automáticamente basándose en los <strong>trending topics</strong> de esta semana y las <strong>posiciones de los grandes inversores</strong>.
                </div>
                <button className="pf-btn" onClick={createPortfolio} disabled={loading}>
                  🚀 Invertir con IA
                </button>
              </div>
            </>
          )}

          {/* ── PASO: ACTIVE / CLOSED ── */}
          {(step === "active" || step === "closed") && portfolio && (
            <>
              {step === "closed" && (
                <div className="pf-closed-banner">
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🏁</div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Portafolio cerrado</div>
                  <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)" }}>
                    Resultado final de tu inversión virtual
                  </div>
                </div>
              )}

              {/* Resumen */}
              <div className="pf-summary" style={{ background: pnlBg, border: pnlBorder }}>
                <div className="pf-summary-top">
                  <div>
                    <div style={{ fontFamily: "var(--fn)", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: pnlColor, opacity: .7, marginBottom: 6 }}>
                      Valor actual
                    </div>
                    <div className="pf-value" style={{ color: pnlColor }}>
                      ${fmt(portfolio.currentValue)}
                    </div>
                    <div className="pf-pnl" style={{ color: pnlColor }}>
                      {portfolio.totalPnl >= 0 ? "+" : ""}${fmt(portfolio.totalPnl)} ({portfolio.totalPnl >= 0 ? "+" : ""}{portfolio.totalPnlPct.toFixed(2)}%)
                    </div>
                    <div className="pf-meta">
                      Inversión inicial: ${fmt(portfolio.initialAmount)} · Actualizado: {new Date(portfolio.lastUpdated).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="pf-stats">
                    <div className="pf-stat">
                      <span className="pf-stat-lbl">Posiciones</span>
                      <span style={{ fontWeight: 700 }}>{portfolio.positions.length}</span>
                    </div>
                    <div className="pf-stat">
                      <span className="pf-stat-lbl">Ganancia</span>
                      <span style={{ fontWeight: 700, color: "#4ade80" }}>
                        +${fmt(Math.max(0, portfolio.totalPnl))}
                      </span>
                    </div>
                    <div className="pf-stat">
                      <span className="pf-stat-lbl">Pérdida</span>
                      <span style={{ fontWeight: 700, color: "#f87171" }}>
                        -${fmt(Math.abs(Math.min(0, portfolio.totalPnl)))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Estrategia */}
              {portfolio.strategy && (
                <div className="pf-strategy">
                  <div style={{ fontFamily: "var(--fn)", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--ac)", marginBottom: 6 }}>
                    🧠 Estrategia IA
                  </div>
                  <div style={{ fontFamily: "var(--fn)", fontSize: 12, color: "var(--di)", lineHeight: 1.6 }}>
                    {portfolio.strategy}
                  </div>
                </div>
              )}

              {/* Gráfica histórico */}
              {portfolio.history?.length > 1 && (
                <div className="pf-chart">
                  <div style={{ fontFamily: "var(--fn)", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--di)", marginBottom: 12 }}>
                    Evolución del portafolio
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={portfolio.history.map((h, i) => ({ i, value: h.value }))}>
                      <defs>
                        <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={pnlColor} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={pnlColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                      <XAxis dataKey="i" hide/>
                      <YAxis tick={{ fontFamily: "monospace", fontSize: 9, fill: "#6b6d7e" }} axisLine={false} tickLine={false} width={56}
                        tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0)}`}/>
                      <Tooltip formatter={v => [`$${fmt(v)}`, "Valor"]} contentStyle={{ background: "#0c0d10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }}/>
                      <Area type="monotone" dataKey="value" stroke={pnlColor} strokeWidth={2} fill="url(#pfGrad)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Posiciones */}
              <div style={{ fontFamily: "var(--fn)", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--di)", marginBottom: 10 }}>
                Posiciones ({portfolio.positions.length})
              </div>
              <div className="pf-positions">
                {portfolio.positions.map((pos, i) => (
                  <div key={i} className="pf-pos">
                    <div className="pf-pos-ticker" style={{ color: pos.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                      {pos.ticker}
                    </div>
                    <div className="pf-pos-info">
                      <div className="pf-pos-name">{pos.name}</div>
                      <div className="pf-pos-prices">
                        <span className="pf-pos-price" style={{ color: "var(--mu)" }}>
                          Entrada: <strong style={{ color: "var(--tx)" }}>${fmt(pos.entryPrice)}</strong>
                        </span>
                        <span className="pf-pos-price">
                          Ahora: <strong>${fmt(pos.currentPrice)}</strong>
                        </span>
                        <PnlBadge value={pos.pnlPct}/>
                      </div>
                      {pos.reason && <div className="pf-reason">💡 {pos.reason}</div>}
                    </div>
                    <div className="pf-pos-amount">
                      <div style={{ fontWeight: 700 }}>${fmt(pos.currentPrice * pos.shares)}</div>
                      <div style={{ fontSize: 10, color: pos.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                        {pos.pnl >= 0 ? "+" : ""}${fmt(pos.pnl)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Acciones */}
              {step === "active" && (
                <div className="pf-refresh-row">
                  <button className="pf-btn pf-btn-ghost" style={{ flex: 1 }}
                    onClick={() => refreshPortfolio(portfolio.id)}>
                    🔄 Actualizar precios
                  </button>
                  <button className="pf-btn pf-btn-danger" style={{ flex: 1 }}
                    onClick={closePortfolio}>
                    💸 Retirar todo
                  </button>
                </div>
              )}

              {step === "closed" && (
                <button className="pf-btn" onClick={resetPortfolio}>
                  🚀 Crear nuevo portafolio
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
