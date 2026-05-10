const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const APP_URL       = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://joyful-pothos-0e4306.netlify.app";

async function redisCmd(...args) {
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return r.json();
}

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
      system: `Responde SOLO con JSON: {"price": 123.45}`,
      messages: [{ role: "user", content: `Precio actual USD de ${ticker}. Solo JSON.` }],
    }),
  });
  const data = await res.json();
  const text = (data.content||[]).map(b=>b.type==="text"?b.text:"").join("").trim()
    .replace(/^```json\s*/,"").replace(/\s*```$/,"").trim();
  try { const p = JSON.parse(text); return p.price||null; } catch { return null; }
}

async function sendEmail(to, subject, html) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: "Analizador IA <alertas@resend.dev>", to: [to], subject, html }),
  });
}

function emailHtml({ ticker, type, price, level, color }) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0c0d10;color:#f0f0f5;padding:40px 20px">
  <div style="max-width:500px;margin:0 auto;background:#13141a;border-radius:16px;overflow:hidden">
    <div style="background:${color};padding:24px 28px">
      <h1 style="margin:0;color:#fff;font-size:20px">${type}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8)">${ticker} · Alerta activada</p>
    </div>
    <div style="padding:24px 28px">
      <div style="display:flex;gap:16px;margin-bottom:20px">
        <div style="flex:1;background:rgba(255,255,255,.05);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:11px;color:#6b6d7e;margin-bottom:6px">PRECIO ACTUAL</div>
          <div style="font-size:24px;font-weight:800">$${Number(price).toFixed(2)}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.05);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:11px;color:#6b6d7e;margin-bottom:6px">NIVEL ALERTA</div>
          <div style="font-size:24px;font-weight:800;color:${color}">$${Number(level).toFixed(2)}</div>
        </div>
      </div>
      <a href="${APP_URL}" style="display:block;background:#7c6bff;color:#fff;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:700">Ver análisis →</a>
    </div>
  </div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const keys = await redisCmd("keys", "alert:*");
    if (!keys.result?.length) return res.status(200).json({ checked: 0 });

    const alerts = [];
    for (const key of keys.result) {
      const val = await redisCmd("get", key);
      if (val.result) alerts.push(JSON.parse(val.result));
    }

    const tickers = [...new Set(alerts.map(a => a.ticker))];
    const results = [];

    for (const ticker of tickers) {
      const price = await getPrice(ticker);
      if (!price) continue;
      const tickerAlerts = alerts.filter(a => a.ticker === ticker && !a.triggered);

      for (const alert of tickerAlerts) {
        let type = "", color = "", level = 0, triggered = false;

        if (alert.stopLoss && price <= alert.stopLoss) {
          triggered = true; type = "🔴 Stop Loss alcanzado"; color = "#ef4444"; level = alert.stopLoss;
        } else if (alert.objetivo2 && price >= alert.objetivo2) {
          triggered = true; type = "🚀 Objetivo 2 alcanzado"; color = "#f59e0b"; level = alert.objetivo2;
        } else if (alert.objetivo1 && price >= alert.objetivo1) {
          triggered = true; type = "🟢 Objetivo 1 alcanzado"; color = "#22c55e"; level = alert.objetivo1;
        }

        if (triggered && alert.email) {
          await sendEmail(alert.email, `${type} — ${ticker} a $${price}`, emailHtml({ ticker, type, price, level, color }));
          await redisCmd("set", `alert:${alert.id}`, JSON.stringify({ ...alert, triggered: true, triggeredAt: new Date().toISOString(), triggeredPrice: price }), "ex", "2592000");
          results.push({ ticker, type, price });
        }
      }
    }

    return res.status(200).json({ checked: tickers.length, triggered: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
