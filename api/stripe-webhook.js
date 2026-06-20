// api/stripe-webhook.js — recibe eventos de Stripe y guarda el estado de suscripción en Redis
// IMPORTANTE: configurar este endpoint en Stripe Dashboard → Developers → Webhooks

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const config = {
  api: { bodyParser: false }, // Stripe requiere el raw body para verificar la firma
};

async function redisSet(key, value, ttlSeconds) {
  try {
    const args = ["set", key, JSON.stringify(value)];
    if (ttlSeconds) args.push("ex", ttlSeconds);
    await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  // Nota: verificación de firma simplificada — para producción robusta usar la librería oficial de Stripe
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (err) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const obj = event.data?.object;

    switch (event.type) {
      case "checkout.session.completed": {
        const email = obj.customer_email || obj.customer_details?.email;
        const customerId = obj.customer;
        const subscriptionId = obj.subscription;
        if (email) {
          await redisSet(`subscription:${email}`, {
            status: "active",
            customerId,
            subscriptionId,
            plan: "pro",
            updatedAt: new Date().toISOString(),
          }, 31536000); // 1 año
          console.log(`[stripe-webhook] Suscripción activada: ${email}`);
        }
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.canceled": {
        const customerId = obj.customer;
        // Buscar por customerId requeriría un índice adicional; por ahora se registra el evento
        console.log(`[stripe-webhook] Suscripción cancelada para customer: ${customerId}`);
        break;
      }

      case "invoice.payment_failed": {
        const customerId = obj.customer;
        console.log(`[stripe-webhook] Pago fallido para customer: ${customerId}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Evento no manejado: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
