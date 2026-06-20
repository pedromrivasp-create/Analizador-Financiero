// api/create-checkout.js — crea sesión de Stripe Checkout para suscripción Pro
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = "price_1TkRPV0L008coTPrwIXZA6Pj"; // Plan Pro $19/mes
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email } = req.body || {};
    const appUrl = "https://app.analizadoria.com";
    const params = new URLSearchParams({
      "mode": "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "success_url": `${appUrl}?checkout=success`,
      "cancel_url": `${appUrl}?checkout=cancel`,
      "allow_promotion_codes": "true",
    });
    if (email) params.append("customer_email", email);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await response.json();
    if (session.error) {
      console.error("[stripe] Error:", session.error.message);
      return res.status(400).json({ error: session.error.message });
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[create-checkout] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
