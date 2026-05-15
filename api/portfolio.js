// api/portfolio.js — Portfolio simulator virtual
// Crea, consulta y cierra portfolios virtuales usando Redis

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

async function redisSet(key, value, ttlSeconds = 2592000) {
  try {
    await fetch(`${UPSTASH_URL}/${["set", key, JSON.stringify(value), "ex", ttlSeconds].map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

async function redisDel(key) {
  try {
    await fetch(`${UPSTASH_URL}/${["del", key].map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

// Obtiene precio actual via Claude
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
  const text = (data.content || []).map(b => b.type === "text" ? b.text : "").join("").trim()
    .replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  try { const p = JSON.parse(text); return p.price || null; } catch { return null; }
}

// Claude decide cómo distribuir el dinero según trending + big investors
async function getAllocations(amount, trendingData, bigInvestorsData) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

  const trendingList = (trendingData?.items || [])
    .slice(0, 6)
    .map(i => `${i.ticker} (${i.name}, trending ${i.changeWeek > 0 ? "+" : ""}${i.changeWeek}% semana)`)
    .join(", ");

  const bigList = (bigInvestorsData?.investors || [])
    .flatMap(inv => (inv.topPositions || []).slice(0, 2).map(p => p.ticker))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8)
    .join(", ");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: `Hoy es ${dateStr}. Eres un gestor de portafolio virtual educativo.
Distribuye $${amount} USD virtuales en 3-5 activos seleccionados de las listas proporcionadas.
Elige los más prometedores combinando momentum (trending) con respaldo institucional (big investors).
Responde SOLO con JSON válido sin markdown:
{
  "strategy": "Descripción breve de la estrategia elegida (1-2 frases)",
  "allocations": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "amount": 40.00,
      "percentage": 40,
      "reason": "Por qué este activo (1 frase simple)"
    }
  ]
}
Los porcentajes deben sumar exactamente 100. Montos deben sumar exactamente ${amount}.`,
      messages: [{
        role: "user",
        content: `Distribuye $${amount} virtuales.
Trending esta semana: ${trendingList || "BTC, AAPL, NVDA, TSLA, ETH"}.
Top posiciones grandes inversores: ${bigList || "AAPL, AMZN, NVDA, GOOGL, META"}.
Solo JSON.`
      }],
    }),
  });

  const data = await res.json();
  const text = (data.content || []).map(b => b.type === "text" ? b.text : "").join("").trim()
    .replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, portfolioId } = req.query;

  try {
    // POST /api/portfolio?action=create — Crear portfolio nuevo
    if (req.method === "POST" && action === "create") {
      const { amount, trendingData, bigInvestorsData } = req.body;
      if (!amount || amount < 1) return res.status(400).json({ error: "Monto inválido" });

      // Claude distribuye el dinero
      const allocation = await getAllocations(amount, trendingData, bigInvestorsData);

      // Obtener precios reales para cada posición
      const positions = [];
      for (const alloc of allocation.allocations) {
        const price = await getPrice(alloc.ticker);
        if (price) {
          const shares = alloc.amount / price;
          positions.push({
            ticker: alloc.ticker,
            name: alloc.name,
            amount: alloc.amount,
            percentage: alloc.percentage,
            reason: alloc.reason,
            entryPrice: price,
            currentPrice: price,
            shares: shares,
            pnl: 0,
            pnlPct: 0,
          });
        }
      }

      const portfolio = {
        id: `pf-${Date.now()}`,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        initialAmount: amount,
        currentValue: amount,
        totalPnl: 0,
        totalPnlPct: 0,
        strategy: allocation.strategy,
        positions,
        history: [{ time: new Date().toISOString(), value: amount }],
        status: "active",
      };

      await redisSet(`portfolio:${portfolio.id}`, portfolio, 2592000); // 30 días
      return res.status(200).json(portfolio);
    }

    // POST /api/portfolio?action=refresh&portfolioId=xxx — Actualizar precios
    if (req.method === "POST" && action === "refresh") {
      if (!portfolioId) return res.status(400).json({ error: "portfolioId requerido" });

      const portfolio = await redisGet(`portfolio:${portfolioId}`);
      if (!portfolio) return res.status(404).json({ error: "Portfolio no encontrado" });
      if (portfolio.status === "closed") return res.status(200).json(portfolio);

      // Actualizar precio de cada posición
      let currentValue = 0;
      for (const pos of portfolio.positions) {
        const price = await getPrice(pos.ticker);
        if (price) {
          pos.currentPrice = price;
          pos.pnl = (price - pos.entryPrice) * pos.shares;
          pos.pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
        }
        currentValue += pos.currentPrice * pos.shares;
      }

      portfolio.currentValue = currentValue;
      portfolio.totalPnl = currentValue - portfolio.initialAmount;
      portfolio.totalPnlPct = ((currentValue - portfolio.initialAmount) / portfolio.initialAmount) * 100;
      portfolio.lastUpdated = new Date().toISOString();
      portfolio.history.push({ time: new Date().toISOString(), value: currentValue });

      // Mantener solo últimas 48 entradas del historial
      if (portfolio.history.length > 48) portfolio.history = portfolio.history.slice(-48);

      await redisSet(`portfolio:${portfolioId}`, portfolio, 2592000);
      return res.status(200).json(portfolio);
    }

    // GET /api/portfolio?portfolioId=xxx — Obtener portfolio
    if (req.method === "GET" && portfolioId) {
      const portfolio = await redisGet(`portfolio:${portfolioId}`);
      if (!portfolio) return res.status(404).json({ error: "Portfolio no encontrado" });
      return res.status(200).json(portfolio);
    }

    // DELETE /api/portfolio?portfolioId=xxx — Cerrar/retirar portfolio
    if (req.method === "DELETE" && portfolioId) {
      const portfolio = await redisGet(`portfolio:${portfolioId}`);
      if (!portfolio) return res.status(404).json({ error: "Portfolio no encontrado" });

      portfolio.status = "closed";
      portfolio.closedAt = new Date().toISOString();
      await redisSet(`portfolio:${portfolioId}`, portfolio, 2592000);
      return res.status(200).json(portfolio);
    }

    return res.status(400).json({ error: "Acción no válida" });
  } catch (err) {
    console.error("[portfolio] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
