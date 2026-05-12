// api/big-investors.js — obtiene info de grandes inversores via Claude web_search
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

async function fetchInvestorsFromClaude() {
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
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `Hoy es ${dateStr}. Eres un analista financiero que explica inversiones de forma simple para no financieros.
Busca información actualizada sobre las inversiones actuales de Warren Buffett, Ray Dalio, George Soros y Cathie Wood.
Usa fuentes como SEC 13F filings, Berkshire Hathaway reports, Bridgewater reports, y noticias recientes.
Responde SOLO con JSON válido sin markdown:
{
  "generatedAt": "fecha",
  "investors": [
    {
      "id": "buffett",
      "name": "Warren Buffett",
      "title": "CEO de Berkshire Hathaway",
      "emoji": "🧙",
      "color": "#7c6bff",
      "quote": "Su frase célebre más conocida",
      "strategy": "Descripción simple de su estrategia de inversión (1-2 frases, sin tecnicismos)",
      "topPositions": [
        {
          "ticker": "AAPL",
          "name": "Apple",
          "allocation": 45.2,
          "action": "mantiene",
          "comment": "Por qué tiene esta posición (frase simple)"
        }
      ],
      "recentMoves": [
        {
          "ticker": "OXY",
          "name": "Occidental Petroleum",
          "action": "compró",
          "amount": "$500M",
          "date": "Q1 2025",
          "reason": "Por qué hizo este movimiento (frase simple, sin tecnicismos)"
        }
      ],
      "currentFocus": "En qué sector o tipo de inversión está enfocado actualmente (1 frase simple)"
    }
  ]
}
Incluye exactamente estos 4 inversores en este orden: Warren Buffett, Ray Dalio, George Soros, Cathie Wood.
Para cada uno incluye 5 topPositions y 3 recentMoves.
El campo "action" en topPositions puede ser: "compró", "vendió", "aumentó", "redujo", "mantiene".
Escribe todo en español simple, fácil de entender para alguien sin conocimientos financieros.`,
      messages: [{
        role: "user",
        content: `Dame información actualizada sobre las inversiones de Warren Buffett, Ray Dalio, George Soros y Cathie Wood. Fecha: ${dateStr}. Solo JSON.`
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
    const CACHE_KEY = "big-investors:weekly";
    const cached = await redisGet(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, cached: true });

    const data = await fetchInvestorsFromClaude();
    await redisSet(CACHE_KEY, data, 604800); // 7 días
    return res.status(200).json({ ...data, cached: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
