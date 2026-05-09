import { useState, useEffect } from "react";

const API = "/.netlify/functions";

export default function AlertsPanel({ analysisData, ticker }) {
  const [alerts, setAlerts]     = useState([]);
  const [email, setEmail]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg]           = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => { loadAlerts(); }, []);

  async function loadAlerts() {
    try {
      const r = await fetch(`${API}/alerts`);
      const data = await r.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function saveAlert() {
    if (!email || !analysisData) return;
    setSaving(true);
    try {
      await fetch(`${API}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          email,
          entryPrice: analysisData.entrada,
          stopLoss:   analysisData.stopLoss,
          objetivo1:  analysisData.objetivo1,
          objetivo2:  analysisData.objetivo2,
        }),
      });
      setMsg({ type: "ok", text: `✅ Alerta guardada para ${ticker}` });
      await loadAlerts();
    } catch { setMsg({ type: "err", text: "Error guardando alerta" }); }
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  }

  async function deleteAlert(id) {
    await fetch(`${API}/alerts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function checkNow() {
    setChecking(true);
    try {
      const r = await fetch(`${API}/check-alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await r.json();
      const n = data.triggered?.length || 0;
      setMsg({ type: "ok", text: n > 0 ? `🔔 ${n} alerta(s) disparada(s)` : "✅ Sin alertas activas por ahora" });
    } catch { setMsg({ type: "err", text: "Error verificando alertas" }); }
    setChecking(false);
    setTimeout(() => setMsg(null), 4000);
  }

  async function requestPush() {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setPushEnabled(true);
      setMsg({ type: "ok", text: "🔔 Notificaciones push activadas" });
      setTimeout(() => setMsg(null), 3000);
    }
  }

  const fmt = n => n ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  return (
    <div style={{ marginTop: 12 }}>
      <style>{`
        .ap { background: var(--sf); border: 1px solid var(--bd); border-radius: var(--rr); padding: 20px; margin-bottom: 12px }
        .ap-title { font-family: var(--fn); font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--ac); margin-bottom: 14px }
        .ap-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap }
        .ap-input { flex: 1; min-width: 200px; background: var(--s2); border: 1px solid var(--bd); border-radius: 8px; color: var(--tx); font-family: var(--fn); font-size: 12px; padding: 9px 12px; outline: none }
        .ap-input:focus { border-color: var(--ac) }
        .ap-btn { padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: var(--fn); font-size: 12px; font-weight: 600; transition: all .15s }
        .ap-btn-primary { background: var(--ac); color: #fff }
        .ap-btn-primary:hover { opacity: .85 }
        .ap-btn-primary:disabled { opacity: .4; cursor: not-allowed }
        .ap-btn-ghost { background: var(--s2); color: var(--di); border: 1px solid var(--bd) }
        .ap-btn-ghost:hover { border-color: var(--ac); color: var(--tx) }
        .ap-levels { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px }
        .ap-level { font-family: var(--fn); font-size: 11px; padding: 5px 10px; border-radius: 6px; background: var(--s2) }
        .ap-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px }
        .ap-item { background: var(--s2); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
        .ap-item-ticker { font-weight: 700; font-size: 14px; min-width: 50px }
        .ap-item-levels { display: flex; gap: 10px; flex: 1; flex-wrap: wrap }
        .ap-item-level { font-family: var(--fn); font-size: 10px; color: var(--di) }
        .ap-item-status { font-family: var(--fn); font-size: 10px; padding: 3px 8px; border-radius: 99px }
        .ap-del { background: none; border: none; cursor: pointer; color: var(--mu); font-size: 16px; padding: 0 4px }
        .ap-del:hover { color: #f87171 }
        .ap-msg { padding: 8px 14px; border-radius: 8px; font-family: var(--fn); font-size: 12px; margin-bottom: 10px; animation: fi .3s ease }
        @keyframes fi { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform: none } }
        .ap-divider { height: 1px; background: var(--bd); margin: 14px 0 }
        .ap-push { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--s2); border-radius: 8px; margin-bottom: 10px }
        .ap-push-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0 }
        .ap-empty { font-family: var(--fn); font-size: 11px; color: var(--mu); text-align: center; padding: 16px }
      `}</style>

      <div className="ap">
        <div className="ap-title">🔔 Sistema de alertas · {ticker || "selecciona un activo"}</div>

        {/* Notificaciones push */}
        <div className="ap-push">
          <div className="ap-push-dot" style={{ background: pushEnabled ? "#4ade80" : "#6b6d7e" }} />
          <span style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--di)", flex: 1 }}>
            {pushEnabled ? "Notificaciones push activadas" : "Activa notificaciones push en este dispositivo"}
          </span>
          {!pushEnabled && (
            <button className="ap-btn ap-btn-ghost" style={{ fontSize: 11, padding: "5px 12px" }} onClick={requestPush}>
              Activar
            </button>
          )}
        </div>

        {/* Mensaje feedback */}
        {msg && (
          <div className="ap-msg" style={{
            background: msg.type === "ok" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
            border: `1px solid ${msg.type === "ok" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            color: msg.type === "ok" ? "#4ade80" : "#f87171",
          }}>{msg.text}</div>
        )}

        {/* Niveles del análisis actual */}
        {analysisData && (
          <>
            <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", marginBottom: 8 }}>
              Niveles del análisis actual:
            </div>
            <div className="ap-levels">
              <div className="ap-level">
                <span style={{ color: "#38bdf8" }}>Entrada </span>
                <strong style={{ color: "var(--tx)" }}>{fmt(analysisData.entrada)}</strong>
              </div>
              <div className="ap-level">
                <span style={{ color: "#f87171" }}>Stop Loss </span>
                <strong style={{ color: "#f87171" }}>{fmt(analysisData.stopLoss)}</strong>
              </div>
              <div className="ap-level">
                <span style={{ color: "#4ade80" }}>Obj. 1 </span>
                <strong style={{ color: "#4ade80" }}>{fmt(analysisData.objetivo1)}</strong>
              </div>
              <div className="ap-level">
                <span style={{ color: "#a3e635" }}>Obj. 2 </span>
                <strong style={{ color: "#a3e635" }}>{fmt(analysisData.objetivo2)}</strong>
              </div>
            </div>
            <div className="ap-divider" />
          </>
        )}

        {/* Configurar alerta */}
        <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", marginBottom: 8 }}>
          Recibir alertas por email:
        </div>
        <div className="ap-row">
          <input
            className="ap-input"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button
            className="ap-btn ap-btn-primary"
            onClick={saveAlert}
            disabled={saving || !email || !analysisData}
          >
            {saving ? "Guardando…" : "Guardar alerta ↗"}
          </button>
        </div>

        {!analysisData && (
          <div style={{ fontFamily: "var(--fn)", fontSize: 11, color: "var(--mu)" }}>
            ← Primero ejecuta un análisis para configurar la alerta
          </div>
        )}

        <div className="ap-divider" />

        {/* Verificar alertas manualmente */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)" }}>
            Revisión automática cada 15 min · o verifica ahora:
          </div>
          <button className="ap-btn ap-btn-ghost" onClick={checkNow} disabled={checking}>
            {checking ? "Verificando…" : "Verificar ahora"}
          </button>
        </div>

        {/* Lista de alertas activas */}
        {alerts.length > 0 && (
          <>
            <div className="ap-divider" />
            <div style={{ fontFamily: "var(--fn)", fontSize: 10, color: "var(--mu)", marginBottom: 8 }}>
              Alertas activas ({alerts.filter(a => !a.triggered).length}):
            </div>
            <div className="ap-list">
              {alerts.map(a => (
                <div key={a.id} className="ap-item">
                  <div className="ap-item-ticker">{a.ticker}</div>
                  <div className="ap-item-levels">
                    <span className="ap-item-level" style={{ color: "#f87171" }}>SL {fmt(a.stopLoss)}</span>
                    <span className="ap-item-level" style={{ color: "#4ade80" }}>O1 {fmt(a.objetivo1)}</span>
                    <span className="ap-item-level" style={{ color: "#a3e635" }}>O2 {fmt(a.objetivo2)}</span>
                    <span className="ap-item-level">{a.email}</span>
                  </div>
                  <span className="ap-item-status" style={{
                    background: a.triggered ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)",
                    color: a.triggered ? "#f87171" : "#4ade80",
                  }}>
                    {a.triggered ? "Disparada" : "Activa"}
                  </span>
                  <button className="ap-del" onClick={() => deleteAlert(a.id)}>×</button>
                </div>
              ))}
            </div>
          </>
        )}

        {alerts.length === 0 && (
          <div className="ap-empty">No hay alertas configuradas aún</div>
        )}
      </div>
    </div>
  );
}
