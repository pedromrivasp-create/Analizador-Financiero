// api/trending.js — obtiene trending stocks via Claude web_search
// Se cachea en Upstash Redis por 7 días
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const r = await fetch(`${UPSTASH_URL}/${["get", key].map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ttlSeconds) {
  try {
    await fetch(`${UPSTASH_URL}/${["set", key, JSON.stringify(value), "ex", ttlSeconds].map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

async function fetchTrendingFromClaude() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
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
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `Hoy es ${dateStr}. Eres un analista financiero. 
Busca las 8 acciones/activos más trending esta semana (combinando: más buscados en Google Trends + mayor volumen de trading en mercados).
Incluye una mezcla de: acciones de bolsa (NYSE/NASDAQ), cryptos y materias primas si están trending.
Responde SOLO con JSON válido sin markdown:
{
  "generatedAt": "fecha actual",
  "items": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "price": 195.50,
      "change24h": 2.3,
      "changeWeek": 5.1,
      "volume": "98.5M",
      "type": "stock",
      "reason": "Por qué está trending esta semana (1 frase corta)",
      "sparkline": [190, 192, 189, 194, 193, 196, 195]
    }
  ]
}
El campo "type" puede ser: "stock", "crypto" o "commodity".
El campo "sparkline" son 7 valores de precio (lun-dom) estimados.
Sin texto extra, solo el JSON.`,
      messages: [{
        role: "user",
        content: `Dame los 8 activos más trending esta semana ${dateStr}. Busca en Google Trends, Reddit WallStreetBets, y volumen de mercados. Solo JSON.`
      }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .map(b => b.type === "text" ? b.text : "")
    .join("").trim()
    .replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const CACHE_KEY = "trending:weekly";
    const forceRefresh = req.query?.refresh === "true";
    const cached = await redisGet(CACHE_KEY);
    if (cached && !forceRefresh) {
      return res.status(200).json({ ...cached, cached: true });
    }
    const trending = await fetchTrendingFromClaude();
    await redisSet(CACHE_KEY, trending, 604800);
    return res.status(200).json({ ...trending, cached: false });
  } catch (err) {
    console.error("[trending] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
