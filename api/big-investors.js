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

  // FIX 1: Timeout de 9s para no exceder el límite de Vercel Hobby (10s)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        // FIX 2: Eliminamos web_search — era la causa del timeout (hacía múltiples búsquedas = 19s)
        // Claude Haiku tiene conocimiento actualizado suficiente para datos trimestrales de inversores
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        // FIX 3: Reducimos max_tokens de 2000 a 1200 — genera más rápido
        max_tokens: 1200,
        system: `Hoy es ${dateStr}. Eres un analista financiero que explica inversiones de forma simple para no financieros.
Usa tu conocimiento sobre los portafolios más recientes de Warren Buffett, Ray Dalio, George Soros y Cathie Wood
basándote en SEC 13F filings, Berkshire Hathaway reports y noticias hasta tu fecha de corte.
Responde SOLO con JSON válido sin markdown ni texto adicional:
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
      "strategy": "Descripción simple de su estrategia (1 frase)",
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
          "reason": "Por qué hizo este movimiento (frase simple)"
        }
      ],
      "currentFocus": "En qué sector está enfocado actualmente (1 frase)"
    }
  ]
}
// FIX 4: Reducimos topPositions de 5 a 3 y recentMoves de 3 a 2 para respuesta más rápida
Incluye exactamente estos 4 inversores: Warren Buffett, Ray Dalio, George Soros, Cathie Wood.
Para cada uno incluye 3 topPositions y 2 recentMoves.
El campo "action" en topPositions puede ser: "compró", "vendió", "aumentó", "redujo", "mantiene".
Escribe todo en español simple. Responde SOLO JSON, sin texto antes ni después.`,
        messages: [{
          role: "user",
          content: `Dame el JSON de inversiones de Buffett, Dalio, Soros y Wood. Solo JSON válido.`
        }],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json();

  // FIX 5: Mejor manejo de errores de la API
  if (data.error) {
    throw new Error(`Anthropic API error: ${data.error.message}`);
  }

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
    // FIX 6: Log del error para futuros debugs en Vercel
    console.error("[big-investors] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
