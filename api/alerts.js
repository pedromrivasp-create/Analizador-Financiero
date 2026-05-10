const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(...args) {
  const r = await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const keys = await redisCmd("keys", "alert:*");
      if (!keys.result?.length) return res.status(200).json([]);
      const alerts = [];
      for (const key of keys.result) {
        const val = await redisCmd("get", key);
        if (val.result) alerts.push(JSON.parse(val.result));
      }
      return res.status(200).json(alerts);
    }

    if (req.method === "POST") {
      const body = req.body;
      const id = `${body.ticker}-${Date.now()}`;
      const alert = {
        id, ticker: body.ticker.toUpperCase(), email: body.email,
        entryPrice: body.entryPrice, stopLoss: body.stopLoss,
        objetivo1: body.objetivo1, objetivo2: body.objetivo2,
        triggered: false, createdAt: new Date().toISOString(),
      };
      await redisCmd("set", `alert:${id}`, JSON.stringify(alert), "ex", "2592000");
      return res.status(200).json({ ok: true, alert });
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      await redisCmd("del", `alert:${id}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
