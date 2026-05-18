// api/anthropic.js — proxy seguro para Anthropic API
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  try {
    const body = req.body;
    const hasWebSearch = JSON.stringify(body).includes("web_search");

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(hasWebSearch ? { "anthropic-beta": "web-search-2025-03-05" } : {}),
    };

    // Limpiar cache_control del body si viene — no funciona en Vercel serverless
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

    // Log de uso
    if (data.usage) {
      const { input_tokens, output_tokens } = data.usage;
      console.log(`[anthropic] in:${input_tokens} out:${output_tokens}`);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

