/* ============================================================
   /api/create-checkout-session   (Vercel Serverless Function)
   Vercel format: module.exports = (req, res). Place this file at
   api/create-checkout-session.js in the ROOT of your repo.

   Environment variables (set in the Vercel dashboard):
     STRIPE_SECRET_KEY   your Stripe secret key (sk_live_… / sk_test_…)
     SITE_URL            your site origin, e.g. https://asadiqbal.site
   ============================================================ */

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  // CORS — the store is served from a different origin (GitHub Pages)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!process.env.STRIPE_SECRET_KEY || !SITE_URL) {
    return res.status(500).json({ error: "Server not configured (STRIPE_SECRET_KEY / SITE_URL)." });
  }

  // Vercel usually parses JSON bodies automatically; handle the string case too.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch (e) { return res.status(400).json({ error: "Invalid request body" }); }
  }
  body = body || {};

  const requested = Array.isArray(body.items) ? body.items : [];
  if (!requested.length) return res.status(400).json({ error: "Cart is empty" });

  // Load the authoritative catalog from the live site
  let catalog;
  try {
    const r = await fetch(SITE_URL + "/Store/products.json", { cache: "no-store" });
    catalog = await r.json();
  } catch (e) {
    return res.status(500).json({ error: "Could not load product catalog" });
  }

  const currency = (catalog.currency || "gbp").toLowerCase();
  const byId = {};
  (catalog.products || []).forEach(function (p) { byId[String(p.id)] = p; });

  const line_items = [];
  let hasPhysical = false;
  for (const it of requested) {
    const p = byId[String(it.id)];
    const qty = Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1));
    if (!p) continue;
    if (p.stock != null && Number(p.stock) <= 0) continue;
    if (!p.digital) hasPhysical = true; // anything not marked digital needs posting
    line_items.push({
      quantity: qty,
      price_data: {
        currency: currency,
        unit_amount: Math.round(Number(p.price) * 100), // minor units
        product_data: {
          name: p.name,
          description: p.description ? String(p.description).slice(0, 300) : undefined,
          images: p.image ? [SITE_URL + "/Store/" + p.image] : undefined
        }
      }
    });
  }

  if (!line_items.length) return res.status(400).json({ error: "No purchasable items in cart" });

  const sessionConfig = {
    mode: "payment",
    line_items,
    phone_number_collection: { enabled: true },
    automatic_tax: { enabled: false }, // turn on once Stripe Tax is set up
    success_url: SITE_URL + "/Store/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: SITE_URL + "/Store/cancel.html"
  };

  // Only collect an address and charge shipping if something physical is in the cart.
  if (hasPhysical) {
    sessionConfig.shipping_address_collection = {
      allowed_countries: ["GB", "US", "CA", "IE", "FR", "DE", "AU"]
    };
    sessionConfig.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 499, currency: currency }, // £4.99 — amount is in pence
          display_name: "Standard (3–5 days)",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 3 },
            maximum: { unit: "business_day", value: 5 }
          }
        }
      }
    ];
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Stripe error" });
  }
};
