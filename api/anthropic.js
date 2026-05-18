// api/anthropic.js — proxy seguro con Prompt Caching activado
// Reduce hasta 90% el costo en llamadas con system prompts repetidos

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
      // OPT 1: Activar prompt caching — reduce hasta 90% el costo en system prompts repetidos
      "anthropic-beta": hasWebSearch
        ? "web-search-2025-03-05,prompt-caching-2024-07-31"
        : "prompt-caching-2024-07-31",
    };

    // OPT 2: Inyectar cache_control en el system prompt si es string largo (>1024 tokens)
    let optimizedBody = { ...body };

    if (typeof body.system === "string" && body.system.length > 100) {
      // Convertir system string a array con cache_control para activar caché
      optimizedBody.system = [
        {
          type: "text",
          text: body.system,
          cache_control: { type: "ephemeral" }, // cachea por 5 minutos
        }
      ];
    }

    // OPT 3: Si el system ya es array, agregar cache_control al último bloque largo
    if (Array.isArray(body.system)) {
      optimizedBody.system = body.system.map((block, i) => {
        if (i === body.system.length - 1 && block.type === "text" && block.text?.length > 100) {
          return { ...block, cache_control: { type: "ephemeral" } };
        }
        return block;
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(optimizedBody),
    });

    const data = await response.json();

    // Log de uso para monitoreo (visible en Vercel logs)
    if (data.usage) {
      const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } = data.usage;
      const saved = cache_read_input_tokens || 0;
      const pct = input_tokens > 0 ? Math.round((saved / (input_tokens + saved)) * 100) : 0;
      console.log(`[anthropic] in:${input_tokens} out:${output_tokens} cache_write:${cache_creation_input_tokens||0} cache_read:${saved} saved:${pct}%`);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
