// Función que se ejecuta cada 15 minutos via cron (Upstash QStash)
// También puede llamarse manualmente desde el frontend

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const APP_URL       = process.env.URL || "https://joyful-pothos-0e4306.netlify.app";

// ── Redis helpers ──
async function redisCmd(...args) {
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return r.json();
}

async function getAllAlerts() {
  const keys = await redisCmd("keys", "alert:*");
  if (!keys.result?.length) return [];
  const alerts = [];
  for (const key of keys.result) {
    const val = await redisCmd("get", key);
    if (val.result) alerts.push(JSON.parse(val.result));
  }
  return alerts;
}

// ── Obtener precio real via Claude web_search ──
async function getPrice(ticker) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `Responde SOLO con JSON: {"price": 123.45}. Sin texto extra.`,
      messages: [{ role: "user", content: `Precio actual USD de ${ticker}. Solo JSON.` }],
    }),
  });
  const data = await res.json();
  const text = (data.content || []).map(b => b.type === "text" ? b.text : "").join("").trim()
    .replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  try {
    const p = JSON.parse(text);
    return p.price || null;
  } catch { return null; }
}

// ── Enviar email via Resend ──
async function sendEmail(to, subject, html) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: "Analizador IA <alertas@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
}

// ── Template email ──
function emailTemplate({ ticker, type, price, level, emoji, color }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#0c0d10;color:#f0f0f5;padding:40px 20px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#13141a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.07)">
    <div style="background:${color};padding:28px 32px">
      <div style="font-size:36px;margin-bottom:8px">${emoji}</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">${type}</h1>
      <p style="margin:6px 0 0;opacity:.8;font-size:14px;color:#fff">${ticker} · Alerta activada</p>
    </div>
    <div style="padding:28px 32px">
      <div style="display:flex;gap:24px;margin-bottom:24px">
        <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b6d7e;margin-bottom:8px">Precio actual</div>
          <div style="font-size:28px;font-weight:800;color:#f0f0f5">$${Number(price).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b6d7e;margin-bottom:8px">Nivel alerta</div>
          <div style="font-size:28px;font-weight:800;color:${color}">$${Number(level).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
      </div>
      <a href="${APP_URL}" style="display:block;background:#7c6bff;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px">Ver análisis completo →</a>
      <p style="margin:20px 0 0;font-size:11px;color:#6b6d7e;text-align:center">
        ${new Date().toLocaleString("es-MX")} · Analizador de Inversiones IA
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Procesar alertas ──
exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    const alerts = await getAllAlerts();
    if (!alerts.length) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ checked: 0 }) };

    const results = [];
    // Agrupar por ticker para no llamar el precio múltiples veces
    const tickers = [...new Set(alerts.map(a => a.ticker))];

    for (const ticker of tickers) {
      const price = await getPrice(ticker);
      if (!price) continue;

      const tickerAlerts = alerts.filter(a => a.ticker === ticker && !a.triggered);

      for (const alert of tickerAlerts) {
        let triggered = false;
        let type = "";
        let emoji = "";
        let color = "";

        // Stop Loss
        if (alert.stopLoss && price <= alert.stopLoss) {
          triggered = true;
          type = "⚠️ Stop Loss alcanzado";
          emoji = "🔴";
          color = "#ef4444";
        }
        // Objetivo 1
        else if (alert.objetivo1 && price >= alert.objetivo1 && !alert.obj1Triggered) {
          triggered = true;
          type = "🎯 Objetivo 1 alcanzado";
          emoji = "🟢";
          color = "#22c55e";
        }
        // Objetivo 2
        else if (alert.objetivo2 && price >= alert.objetivo2 && !alert.obj2Triggered) {
          triggered = true;
          type = "🚀 Objetivo 2 alcanzado";
          emoji = "🟡";
          color = "#f59e0b";
        }

        if (triggered && alert.email) {
          const level = alert.stopLoss && price <= alert.stopLoss ? alert.stopLoss :
                        alert.objetivo2 && price >= alert.objetivo2 ? alert.objetivo2 : alert.objetivo1;

          await sendEmail(
            alert.email,
            `${emoji} ${type} — ${ticker} a $${price}`,
            emailTemplate({ ticker, type, price, level, emoji, color })
          );

          // Marcar como triggered en Redis
          const updated = { ...alert, triggered: true, triggeredAt: new Date().toISOString(), triggeredPrice: price };
          await redisCmd("set", `alert:${alert.id}`, JSON.stringify(updated));
          results.push({ ticker, type, price });
        }
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ checked: tickers.length, triggered: results }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
