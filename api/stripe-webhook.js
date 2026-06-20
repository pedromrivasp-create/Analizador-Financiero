// api/stripe-webhook.js — recibe eventos de Stripe, verifica firma real y guarda el
// estado de suscripción en Redis (Upstash)
// IMPORTANTE: este endpoint debe estar configurado en Stripe Dashboard → Developers → Webhooks
import crypto from "crypto";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const config = {
  api: { bodyParser: false }, // Stripe requiere el raw body para verificar la firma
};

// Verificación manual de la firma de Stripe (sin SDK).
// Algoritmo documentado por Stripe: HMAC-SHA256 de "timestamp.rawBody" con el
// webhook secret, comparado en tiempo constante contra el valor v1 del header.
function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Math.abs(age) > toleranceSeconds) return false; // protección anti-replay

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function redisSet(key, value, ttlSeconds) {
  try {
    const args = ["set", key, JSON.stringify(value)];
    if (ttlSeconds) args.push("ex", ttlSeconds);
    await fetch(`${UPSTASH_URL}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

// Para cancelaciones/pagos fallidos Stripe solo manda customerId, no email.
// Resolvemos el email pegándole directo a la API REST de Stripe (sin SDK).
async function getStripeCustomerEmail(customerId) {
  if (!customerId) return null;
  try {
    const r = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(STRIPE_SECRET_KEY + ":").toString("base64")}`,
      },
    });
    const d = await r.json();
    return d.email || null;
  } catch {
    return null;
  }
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

  if (!verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)) {
    console.warn("[stripe-webhook] Firma inválida o ausente — petición rechazada");
    return res.status(400).json({ error: "Invalid signature" });
  }

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
        const rawEmail = obj.customer_email || obj.customer_details?.email;
        const email = rawEmail ? rawEmail.toLowerCase().trim() : null;
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
        } else {
          console.warn("[stripe-webhook] checkout.session.completed sin email — no se activó Pro");
        }
        break;
      }
      case "customer.subscription.deleted":
      case "customer.subscription.canceled": {
        const customerId = obj.customer;
        const email = await getStripeCustomerEmail(customerId);
        if (email) {
          await redisSet(`subscription:${email.toLowerCase().trim()}`, {
            status: "canceled",
            customerId,
            updatedAt: new Date().toISOString(),
          }, 31536000);
          console.log(`[stripe-webhook] Suscripción cancelada: ${email}`);
        } else {
          console.warn(`[stripe-webhook] No se pudo resolver email para customer ${customerId} — cancelación no aplicada en Redis`);
        }
        break;
      }
      case "invoice.payment_failed": {
        const customerId = obj.customer;
        console.log(`[stripe-webhook] Pago fallido para customer: ${customerId}`);
        // No se baja el acceso automáticamente todavía — Stripe reintenta el cobro.
        // Si quieres revocar acceso en el primer fallo, dímelo y agrego la misma
        // lógica de getStripeCustomerEmail + redisSet con status "past_due".
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
