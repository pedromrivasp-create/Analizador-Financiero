const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

async function redisCmd(...args) {
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return r.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    // GET — obtener todas las alertas
    if (event.httpMethod === "GET") {
      const keys = await redisCmd("keys", "alert:*");
      if (!keys.result?.length) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify([]) };
      const alerts = [];
      for (const key of keys.result) {
        const val = await redisCmd("get", key);
        if (val.result) alerts.push(JSON.parse(val.result));
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(alerts) };
    }

    // POST — crear alerta
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);
      const id = `${body.ticker}-${Date.now()}`;
      const alert = {
        id,
        ticker: body.ticker.toUpperCase(),
        email: body.email,
        entryPrice: body.entryPrice,
        stopLoss: body.stopLoss,
        objetivo1: body.objetivo1,
        objetivo2: body.objetivo2,
        triggered: false,
        createdAt: new Date().toISOString(),
      };
      // Guardar con TTL de 30 días
      await redisCmd("set", `alert:${id}`, JSON.stringify(alert), "ex", "2592000");
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, alert }) };
    }

    // DELETE — eliminar alerta
    if (event.httpMethod === "DELETE") {
      const { id } = JSON.parse(event.body);
      await redisCmd("del", `alert:${id}`);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
