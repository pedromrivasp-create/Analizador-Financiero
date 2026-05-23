// api/anthropic.js — proxy seguro con rate limiting por IP
// Máximo 10 análisis por IP por día para proteger el saldo de Anthropic

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const DAILY_LIMIT = 10; // análisis por IP por día

async function checkRateLimit(ip) {
  try {
    const key = `rate:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const r = await fetch(`${UPSTASH_URL}/${["incr", key].map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const d = await r.json();
    const count = d.result || 0;

    if (count === 1) {
      await fetch(`${UPSTASH_URL}/${["expire", key, "86400"].map(encodeURIComponent).join("/")}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      });
    }

    return { allowed: count <= DAILY_LIMIT, count, limit: DAILY_LIMIT };
  } catch {
    return { allowed: true, count: 0, limit: DAILY_LIMIT };
  }
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  const body = req.body;
  const isAnalysis = !JSON.stringify(body).includes("web_search") && (body.max_tokens || 0) >= 500;

  if (isAnalysis) {
    const ip = getClientIp(req);
    const { allowed, count, limit } = await checkRateLimit(ip);

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));

    if (!allowed) {
      console.log(`[rate-limit] IP ${ip} bloqueada — ${count}/${limit} análisis hoy`);
      return res.status(429).json({
        error: `Límite diario alcanzado (${limit} análisis/día). Vuelve mañana o suscríbete para acceso ilimitado.`,
        limit,
        count,
        resetAt: "mañana a medianoche UTC"
      });
    }
    console.log(`[anthropic] IP ${ip} — análisis ${count}/${limit} hoy`);
  }

  try {
    const hasWebSearch = JSON.stringify(body).includes("web_search");

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(hasWebSearch ? { "anthropic-beta": "web-search-2025-03-05" } : {}),
    };

    let cleanBody = { ...body };
    if (Array.isArray(body.system)) {
      cleanBody.system = body.system.map(({ cache_control, ...block }) => block);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(cleanBody),
    });

    const data = await response.json();

    if (data.usage) {
      const { input_tokens, output_tokens } = data.usage;
      console.log(`[anthropic] in:${input_tokens} out:${output_tokens}`);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
