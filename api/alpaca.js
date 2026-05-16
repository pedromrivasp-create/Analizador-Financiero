// api/alpaca.js — proxy para Alpaca Trading API
// Las keys del usuario vienen en los headers, nunca se guardan en el servidor

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, APCA-API-KEY-ID, APCA-API-SECRET-KEY, X-Alpaca-Mode");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Keys del usuario vienen en headers
  const apiKey    = req.headers["apca-api-key-id"];
  const apiSecret = req.headers["apca-api-secret-key"];
  const mode      = req.headers["x-alpaca-mode"] || "paper"; // paper | live

  if (!apiKey || !apiSecret) {
    return res.status(401).json({ error: "API keys requeridas" });
  }

  // Base URL según modo
  const BASE = mode === "live"
    ? "https://api.alpaca.markets/v2"
    : "https://paper-api.alpaca.markets/v2";

  const { action } = req.query;

  try {
    const alpacaHeaders = {
      "Content-Type": "application/json",
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
    };

    // ── GET account — obtener balance y estado de cuenta
    if (action === "account") {
      const r = await fetch(`${BASE}/account`, { headers: alpacaHeaders });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({
        id: d.id,
        status: d.status,
        cash: parseFloat(d.cash),
        buyingPower: parseFloat(d.buying_power),
        portfolioValue: parseFloat(d.portfolio_value),
        equity: parseFloat(d.equity),
        mode,
      });
    }

    // ── GET positions — obtener posiciones abiertas
    if (action === "positions") {
      const r = await fetch(`${BASE}/positions`, { headers: alpacaHeaders });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json(d.map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        avgEntryPrice: parseFloat(p.avg_entry_price),
        currentPrice: parseFloat(p.current_price),
        marketValue: parseFloat(p.market_value),
        unrealizedPl: parseFloat(p.unrealized_pl),
        unrealizedPlpc: parseFloat(p.unrealized_plpc) * 100,
        side: p.side,
      })));
    }

    // ── GET orders — obtener órdenes recientes
    if (action === "orders") {
      const r = await fetch(`${BASE}/orders?status=all&limit=20`, { headers: alpacaHeaders });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json(d.map(o => ({
        id: o.id,
        symbol: o.symbol,
        qty: parseFloat(o.qty),
        side: o.side,
        type: o.type,
        status: o.status,
        filledAvgPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
        createdAt: o.created_at,
      })));
    }

    // ── POST order — ejecutar orden de compra/venta
    if (action === "order" && req.method === "POST") {
      const { symbol, qty, side, type = "market", time_in_force = "day" } = req.body;
      if (!symbol || !qty || !side) {
        return res.status(400).json({ error: "symbol, qty y side son requeridos" });
      }
      const r = await fetch(`${BASE}/orders`, {
        method: "POST",
        headers: alpacaHeaders,
        body: JSON.stringify({ symbol, qty: String(qty), side, type, time_in_force }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({
        id: d.id,
        symbol: d.symbol,
        qty: d.qty,
        side: d.side,
        status: d.status,
        type: d.type,
        createdAt: d.created_at,
      });
    }

    // ── POST close-all — cerrar todas las posiciones
    if (action === "close-all" && req.method === "DELETE") {
      const r = await fetch(`${BASE}/positions`, {
        method: "DELETE",
        headers: alpacaHeaders,
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({ closed: d.length || 0, orders: d });
    }

    // ── GET clock — verificar si el mercado está abierto
    if (action === "clock") {
      const r = await fetch(`${BASE}/clock`, { headers: alpacaHeaders });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({
        isOpen: d.is_open,
        nextOpen: d.next_open,
        nextClose: d.next_close,
      });
    }

    return res.status(400).json({ error: "Acción no válida" });

  } catch (err) {
    console.error("[alpaca] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
