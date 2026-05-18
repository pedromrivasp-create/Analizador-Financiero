// api/price.js — obtiene precio real con caché en Redis por 5 minutos
// Evita búsquedas web repetidas del mismo ticker → ahorra tokens y costo

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

async function fetchPriceFromClaude(ticker, dateStr) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `Responde SOLO con JSON: {"price":123.45,"change24h":-1.2,"source":"fuente"}`,
      messages: [{ role: "user", content: `Precio USD actual de ${ticker} hoy ${dateStr}. Solo JSON.` }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .map(b => b.type === "text" ? b.text : "")
    .join("").trim()
    .replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(text);
  if (!parsed.price || parsed.price <= 0) throw new Error("Precio inválido");
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker requerido" });

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const CACHE_KEY = `price:${ticker.toUpperCase()}`;

  try {
    // Intentar obtener del caché primero
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      console.log(`[price] ${ticker} desde caché`);
      return res.status(200).json({ ...cached, cached: true });
    }

    // Si no hay caché, buscar con Claude
    console.log(`[price] ${ticker} buscando precio real…`);
    const priceData = await fetchPriceFromClaude(ticker.toUpperCase(), dateStr);

    // Guardar en caché por 5 minutos (300 segundos)
    await redisSet(CACHE_KEY, priceData, 300);

    return res.status(200).json({ ...priceData, cached: false });
  } catch (err) {
    console.error(`[price] Error ${ticker}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
