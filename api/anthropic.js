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
      "anthropic-beta": hasWebSearch
        ? "web-search-2025-03-05,prompt-caching-2024-07-31"
        : "prompt-caching-2024-07-31",
    };

    // Verificar si el body ya tiene cache_control — si sí, no modificar
    const bodyStr = JSON.stringify(body);
    const alreadyHasCache = bodyStr.includes("cache_control");

    let optimizedBody = { ...body };

    if (!alreadyHasCache) {
      // Solo inyectar cache_control si no viene ya en el body
      if (typeof body.system === "string" && body.system.length > 100) {
        optimizedBody.system = [
          {
            type: "text",
            text: body.system,
            cache_control: { type: "ephemeral" },
          }
        ];
      }
      if (Array.isArray(body.system)) {
        optimizedBody.system = body.system.map((block, i) => {
          if (i === body.system.length - 1 && block.type === "text" && block.text?.length > 100) {
            return { ...block, cache_control: { type: "ephemeral" } };
          }
          return block;
        });
      }
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(optimizedBody),
    });

    const data = await response.json();

    // Log de uso para monitoreo
    if (data.usage) {
      const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } = data.usage;
      const saved = cache_read_input_tokens || 0;
      const total = (input_tokens || 0) + saved;
      const pct = total > 0 ? Math.round((saved / total) * 100) : 0;
      console.log(`[anthropic] in:${input_tokens} out:${output_tokens} cache_write:${cache_creation_input_tokens||0} cache_read:${saved} saved:${pct}%`);
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

