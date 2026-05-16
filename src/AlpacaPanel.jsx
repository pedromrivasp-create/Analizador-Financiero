import { useState, useEffect } from "react";

function fmt(n, decimals = 2) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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

export default function AlpacaPanel({ onClose, trendingData, bigInvestorsData }) {
  const [step, setStep]         = useState("connect"); // connect | dashboard | trading | confirm
  const [mode, setMode]         = useState("paper");   // paper | live
  const [apiKey, setApiKey]     = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [account, setAccount]   = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders]     = useState([]);
  const [clock, setClock]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [msg, setMsg]           = useState(null);
  const [pendingOrders, setPendingOrders] = useState([]);

  // Cargar keys guardadas en localStorage
  useEffect(() => {
    const savedKey    = localStorage.getItem("alpaca_key");
    const savedSecret = localStorage.getItem("alpaca_secret");
    const savedMode   = localStorage.getItem("alpaca_mode");
    if (savedKey && savedSecret) {
      setApiKey(savedKey);
      setApiSecret(savedSecret);
      if (savedMode) setMode(savedMode);
      connectAlpaca(savedKey, savedSecret, savedMode || "paper");
    }
  }, []);

  function alpacaFetch(action, method = "GET", body = null) {
    return fetch(`/api/alpaca?action=${action}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
        "X-Alpaca-Mode": mode,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(r => r.json());
  }

  async function connectAlpaca(key = apiKey, secret = apiSecret, m = mode) {
    if (!key || !secret) { setError("Ingresa tu API Key y Secret"); return; }
    setLoading(true); setError(null);

    try {
      const r = await fetch(`/api/alpaca?action=account`, {
        headers: {
          "APCA-API-KEY-ID": key,
          "APCA-API-SECRET-KEY": secret,
          "X-Alpaca-Mode": m,
        },
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);

      // Guardar keys en localStorage
      localStorage.setItem("alpaca_key", key);
      localStorage.setItem("alpaca_secret", secret);
      localStorage.setItem("alpaca_mode", m);

      setAccount(d);
      setStep("dashboard");
      loadDashboard(key, secret, m);
    } catch (e) {
      setError("Error conectando: " + (e.message.includes("forbidden") ? "API Keys inválidas" : e.message));
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard(key = apiKey, secret = apiSecret, m = mode) {
    try {
      const [posR, ordR, clkR] = await Promise.all([
        fetch(`/api/alpaca?action=positions`, { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "X-Alpaca-Mode": m } }).then(r => r.json()),
        fetch(`/api/alpaca?action=orders`, { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "X-Alpaca-Mode": m } }).then(r => r.json()),
        fetch(`/api/alpaca?action=clock`, { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "X-Alpaca-Mode": m } }).then(r => r.json()),
      ]);
      if (!posR.error) setPositions(posR);
      if (!ordR.error) setOrders(ordR);
      if (!clkR.error) setClock(clkR);
    } catch {}
  }

  // Generar órdenes basadas en trending + big investors
  async function generateOrders(amount) {
    const trending = (trendingData?.items || []).slice(0, 4).map(i => i.ticker);
    const bigInv = (bigInvestorsData?.investors || [])
      .flatMap(inv => (inv.topPositions || []).slice(0, 1).map(p => p.ticker))
      .slice(0, 2);

    const tickers = [...new Set([...trending, ...bigInv])].slice(0, 5);
    const perTicker = amount / tickers.length;

    // Obtener precios actuales para calcular qty
    const orders = tickers.map(ticker => ({
      symbol: ticker,
      notional: perTicker.toFixed(2), // cantidad en dólares
      side: "buy",
      type: "market",
      time_in_force: "day",
    }));

    return orders;
  }

  async function prepareAITrade(amount) {
    setLoading(true);
    try {
      const orders = await generateOrders(amount);
      setPendingOrders(orders.map(o => ({ ...o, amount: parseFloat(o.notional) })));
      setStep("confirm");
    } catch (e) {
      setError("Error generando órdenes: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function executeOrders() {
    setLoading(true); setError(null);
    const results = [];

    for (const order of pendingOrders) {
      try {
        const r = await fetch(`/api/alpaca?action=order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "APCA-API-KEY-ID": apiKey,
            "APCA-API-SECRET-KEY": apiSecret,
            "X-Alpaca-Mode": mode,
          },
          body: JSON.stringify({
            symbol: order.symbol,
            notional: order.notional || String(order.amount),
            side: "buy",
            type: "market",
            time_in_force: "day",
          }),
        });
        const d = await r.json();
        results.push({ symbol: order.symbol, success: !d.error, error: d.error, id: d.id });
      } catch (e) {
        results.push({ symbol: order.symbol, success: false, error: e.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    setMsg({ type: "ok", text: `✅ ${successful}/${results.length} órdenes ejecutadas` });
    setStep("dashboard");
    setTimeout(() => loadDashboard(), 2000);
    setLoading(false);
  }

  async function closeAllPositions() {
    if (!confirm("¿Cerrar TODAS las posiciones abiertas?")) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/alpaca?action=close-all`, {
        method: "DELETE",
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": apiSecret,
          "X-Alpaca-Mode": mode,
        },
      });
      const d = await r.json();
      setMsg({ type: "ok", text: `✅ ${d.closed || 0} posiciones cerradas` });
      setTimeout(() => loadDashboard(), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function disconnect() {
    localStorage.removeItem("alpaca_key");
    localStorage.removeItem("alpaca_secret");
    localStorage.removeItem("alpaca_mode");
    setApiKey(""); setApiSecret(""); setAccount(null);
    setPositions([]); setOrders([]);
    setStep("connect");
  }

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPl, 0);

  return (
    <>
      <style>{`
        .alp-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:1001;display:flex;align-items:flex-end;justify-content:center;animation:alpFi .2s ease }
        @keyframes alpFi { from{opacity:0} to{opacity:1} }
        .alp-panel { background:var(--bg);border:1px solid var(--bd);border-bottom:none;border-radius:20px 20px 0 0;width:100%;max-width:740px;max-height:90vh;overflow-y:auto;padding:24px 20px 40px;animation:alpUp .25s ease }
        @keyframes alpUp { from{transform:translateY(40px);opacity:0} to{transform:none;opacity:1} }
        .alp-handle { width:40px;height:4px;background:var(--bd);border-radius:99px;margin:0 auto 20px }
        .alp-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:20px }
        .alp-title { font-size:18px;font-weight:800;letter-spacing:-.02em }
        .alp-close { background:var(--s2);border:1px solid var(--bd);border-radius:99px;color:var(--mu);font-size:14px;padding:4px 12px;cursor:pointer;font-family:var(--fn) }
        .alp-close:hover { border-color:var(--bda);color:var(--tx) }
        .alp-mode-toggle { display:flex;gap:0;background:var(--s2);border:1px solid var(--bd);border-radius:8px;overflow:hidden;margin-bottom:16px }
        .alp-mode-btn { flex:1;padding:8px;border:none;cursor:pointer;font-family:var(--fn);font-size:11px;font-weight:600;transition:all .15s;background:none;color:var(--mu) }
        .alp-mode-btn.active { background:var(--ac);color:#fff }
        .alp-mode-btn.live.active { background:#f59e0b;color:#000 }
        .alp-input { width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--fn);font-size:13px;padding:10px 14px;outline:none;margin-bottom:10px;transition:border-color .2s }
        .alp-input:focus { border-color:var(--ac) }
        .alp-btn { width:100%;padding:13px;border-radius:10px;background:var(--ac);color:#fff;font-family:var(--fs);font-size:14px;font-weight:700;border:none;cursor:pointer;transition:all .15s;box-shadow:0 4px 20px var(--gl) }
        .alp-btn:hover:not(:disabled) { transform:translateY(-1px) }
        .alp-btn:disabled { opacity:.5;cursor:not-allowed }
        .alp-btn-warning { background:#f59e0b;color:#000;box-shadow:none }
        .alp-btn-danger { background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);color:#f87171;box-shadow:none }
        .alp-btn-ghost { background:var(--s2);border:1px solid var(--bd);color:var(--di);box-shadow:none }
        .alp-btn-ghost:hover { border-color:var(--ac);color:var(--tx) }
        .alp-card { background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:12px }
        .alp-label { font-family:var(--fn);font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--mu);margin-bottom:8px }
        .alp-stat-row { display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px }
        .alp-stat { flex:1;min-width:100px;background:var(--s2);border-radius:8px;padding:12px }
        .alp-stat-lbl { font-family:var(--fn);font-size:8px;opacity:.5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px }
        .alp-stat-val { font-size:18px;font-weight:800;letter-spacing:-.02em }
        .alp-pos { background:var(--s2);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap }
        .alp-pos-ticker { font-size:15px;font-weight:800;min-width:50px }
        .alp-pos-info { flex:1 }
        .alp-pos-prices { font-family:var(--fn);font-size:11px;color:var(--di) }
        .alp-order { background:var(--s2);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap }
        .alp-error { background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;padding:10px 14px;font-family:var(--fn);font-size:12px;color:#f87171;margin-bottom:12px }
        .alp-msg { border-radius:8px;padding:10px 14px;font-family:var(--fn);font-size:12px;margin-bottom:12px }
        .alp-warning { background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px 14px;font-family:var(--fn);font-size:11px;color:#f59e0b;margin-bottom:14px;line-height:1.6 }
        .alp-clock { display:flex;align-items:center;gap:8px;font-family:var(--fn);font-size:11px;margin-bottom:12px }
        .alp-clock-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0 }
      `}</style>

      <div className="alp-overlay" onClick={e => e.target.className === "alp-overlay" && onClose()}>
        <div className="alp-panel">
          <div className="alp-handle"/>
          <div className="alp-header">
            <div className="alp-title">🦙 Alpaca Trading</div>
            <button className="alp-close" onClick={onClose}>✕ Cerrar</button>
          </div>

          {error && <div className="alp-error">⚠ {error}</div>}
          {msg && (
            <div className="alp-msg" style={{
              background: msg.type === "ok" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${msg.type === "ok" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
              color: msg.type === "ok" ? "#4ade80" : "#f87171",
            }}>{msg.text}</div>
          )}

          {/* ── CONECTAR ── */}
          {step === "connect" && (
            <div className="alp-card">
              <div className="alp-label">Modo de trading</div>
              <div className="alp-mode-toggle" style={{ marginBottom: 16 }}>
                <button className={`alp-mode-btn ${mode === "paper" ? "active" : ""}`} onClick={() => setMode("paper")}>
                  📄 Paper Trading (simulado)
                </button>
                <button className={`alp-mode-btn live ${mode === "live" ? "active" : ""}`} onClick={() => setMode("live")}>
                  ⚡ Live Trading (real)
                </button>
              </div>

              {mode === "live" && (
                <div className="alp-warning">
                  ⚠️ <strong>Live Trading usa dinero real.</strong> Las órdenes se ejecutan en el mercado real. Asegúrate de entender los riesgos antes de continuar.
                </div>
              )}

              <div className="alp-label">Tu API Key de Alpaca ({mode === "paper" ? "Paper" : "Live"})</div>
              <input className="alp-input" type="text" placeholder="PKXXXXXXXXXXXXXXXXXXXXX"
                value={apiKey} onChange={e => setApiKey(e.target.value)}/>

              <div className="alp-label">Tu Secret Key</div>
              <input className="alp-input" type="password" placeholder="••••••••••••••••••••••••"
                value={apiSecret} onChange={e => setApiSecret(e.target.value)}/>

              <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", marginBottom: 14, lineHeight: 1.6 }}>
                🔐 Tus keys se guardan solo en este dispositivo (localStorage). Nunca se envían a nuestros servidores.
                Obtenlas en <strong>app.alpaca.markets → API Keys</strong>.
              </div>

              <button className="alp-btn" onClick={() => connectAlpaca()} disabled={loading}>
                {loading ? "Conectando…" : "🔗 Conectar cuenta"}
              </button>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {step === "dashboard" && account && (
            <>
              {/* Estado del mercado */}
              {clock && (
                <div className="alp-clock">
                  <div className="alp-clock-dot" style={{ background: clock.isOpen ? "#4ade80" : "#f87171", animation: clock.isOpen ? "blink 1.4s infinite" : "none" }}/>
                  <span style={{ color: clock.isOpen ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                    Mercado {clock.isOpen ? "ABIERTO" : "CERRADO"}
                  </span>
                  {!clock.isOpen && (
                    <span style={{ color: "var(--mu)" }}>
                      · Abre: {new Date(clock.nextOpen).toLocaleString("es-MX", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}

              {/* Badge modo */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                <span style={{
                  fontFamily: "var(--fn)", fontSize: 10, padding: "3px 10px", borderRadius: 99,
                  background: mode === "paper" ? "rgba(124,107,255,0.15)" : "rgba(245,158,11,0.15)",
                  border: `1px solid ${mode === "paper" ? "rgba(124,107,255,0.3)" : "rgba(245,158,11,0.3)"}`,
                  color: mode === "paper" ? "#7c6bff" : "#f59e0b",
                }}>
                  {mode === "paper" ? "📄 Paper Trading" : "⚡ Live Trading"}
                </span>
                <span style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)" }}>
                  {account.status}
                </span>
              </div>

              {/* Balance */}
              <div className="alp-stat-row">
                <div className="alp-stat">
                  <div className="alp-stat-lbl">Portafolio</div>
                  <div className="alp-stat-val">${fmt(account.portfolioValue)}</div>
                </div>
                <div className="alp-stat">
                  <div className="alp-stat-lbl">Cash disponible</div>
                  <div className="alp-stat-val" style={{ color: "#4ade80" }}>${fmt(account.cash)}</div>
                </div>
                <div className="alp-stat">
                  <div className="alp-stat-lbl">P&L no realizado</div>
                  <div className="alp-stat-val" style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>
                    {totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}
                  </div>
                </div>
              </div>

              {/* Botón invertir con IA */}
              <button className="alp-btn" style={{ marginBottom: 10 }}
                onClick={() => setStep("trading")} disabled={loading || !clock?.isOpen}>
                🤖 {clock?.isOpen ? "Invertir con IA" : "Mercado cerrado — no se puede operar"}
              </button>

              {/* Posiciones */}
              {positions.length > 0 && (
                <div className="alp-card">
                  <div className="alp-label">Posiciones abiertas ({positions.length})</div>
                  {positions.map((pos, i) => (
                    <div key={i} className="alp-pos">
                      <div className="alp-pos-ticker" style={{ color: pos.unrealizedPl >= 0 ? "#4ade80" : "#f87171" }}>
                        {pos.symbol}
                      </div>
                      <div className="alp-pos-info">
                        <div className="alp-pos-prices">
                          Entrada: <strong>${fmt(pos.avgEntryPrice)}</strong> · Ahora: <strong>${fmt(pos.currentPrice)}</strong>
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <PnlBadge value={pos.unrealizedPlpc}/>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: "var(--fn)", fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>${fmt(pos.marketValue)}</div>
                        <div style={{ color: pos.unrealizedPl >= 0 ? "#4ade80" : "#f87171" }}>
                          {pos.unrealizedPl >= 0 ? "+" : ""}${fmt(pos.unrealizedPl)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="alp-btn alp-btn-danger" style={{ marginTop: 8 }} onClick={closeAllPositions}>
                    🚪 Cerrar todas las posiciones
                  </button>
                </div>
              )}

              {/* Órdenes recientes */}
              {orders.length > 0 && (
                <div className="alp-card">
                  <div className="alp-label">Órdenes recientes</div>
                  {orders.slice(0, 5).map((o, i) => (
                    <div key={i} className="alp-order">
                      <span style={{ fontWeight: 700, minWidth: 50 }}>{o.symbol}</span>
                      <span style={{
                        fontFamily: "var(--fn)", fontSize: 10, padding: "2px 8px", borderRadius: 99,
                        background: o.side === "buy" ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                        color: o.side === "buy" ? "#4ade80" : "#f87171",
                      }}>{o.side === "buy" ? "↑ COMPRA" : "↓ VENTA"}</span>
                      <span style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", flex: 1 }}>
                        {o.qty} acciones
                      </span>
                      <span style={{
                        fontFamily: "var(--fn)", fontSize: 10, padding: "2px 8px", borderRadius: 99,
                        background: "var(--s2)", color: "var(--di)",
                      }}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="alp-btn alp-btn-ghost" style={{ flex: 1 }} onClick={() => loadDashboard()}>
                  🔄 Actualizar
                </button>
                <button className="alp-btn alp-btn-ghost" style={{ flex: 1 }} onClick={disconnect}>
                  🔌 Desconectar
                </button>
              </div>
            </>
          )}

          {/* ── SELECCIONAR MONTO ── */}
          {step === "trading" && (
            <div className="alp-card">
              <div className="alp-label">¿Cuánto quieres invertir?</div>
              <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)", marginBottom: 12, lineHeight: 1.6 }}>
                Cash disponible: <strong style={{ color: "#4ade80" }}>${fmt(account?.cash)}</strong>
              </div>
              {[100, 250, 500, 1000].filter(v => v <= (account?.cash || 0)).map(v => (
                <button key={v} className="alp-btn alp-btn-ghost" style={{ marginBottom: 8 }}
                  onClick={() => prepareAITrade(v)}>
                  🤖 Invertir ${v} con IA
                </button>
              ))}
              <button className="alp-btn alp-btn-ghost" style={{ marginTop: 4 }} onClick={() => setStep("dashboard")}>
                ← Volver
              </button>
            </div>
          )}

          {/* ── CONFIRMAR ÓRDENES ── */}
          {step === "confirm" && (
            <div className="alp-card">
              <div className="alp-label">Órdenes a ejecutar</div>

              {mode === "live" && (
                <div className="alp-warning">
                  ⚠️ <strong>Estas órdenes se ejecutarán con DINERO REAL en el mercado.</strong> Revisa cuidadosamente antes de confirmar.
                </div>
              )}

              {pendingOrders.map((o, i) => (
                <div key={i} className="alp-order" style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, minWidth: 60 }}>{o.symbol}</span>
                  <span style={{ fontFamily: "var(--fn)", fontSize: 10, color: "#4ade80" }}>↑ COMPRA</span>
                  <span style={{ fontFamily: "var(--fn)", fontSize: 11, flex: 1, color: "var(--di)" }}>
                    ${fmt(o.amount)} · Market Order
                  </span>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="alp-btn alp-btn-ghost" style={{ flex: 1 }} onClick={() => setStep("dashboard")}>
                  ✕ Cancelar
                </button>
                <button
                  className={`alp-btn ${mode === "live" ? "alp-btn-warning" : ""}`}
                  style={{ flex: 2 }}
                  onClick={executeOrders}
                  disabled={loading}
                >
                  {loading ? "Ejecutando…" : mode === "live" ? "⚡ Confirmar — Dinero Real" : "✅ Confirmar Paper Trade"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
