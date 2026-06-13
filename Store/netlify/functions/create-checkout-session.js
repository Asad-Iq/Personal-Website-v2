/* ============================================================
   create-checkout-session  (Netlify Function)
   Creates a real Stripe Checkout Session from the cart.

   Prices are read from products.json on the server side, NOT from
   the browser — so a customer can't tamper with amounts.

   Required environment variables (set in Netlify dashboard):
     STRIPE_SECRET_KEY   your Stripe secret key (sk_live_… / sk_test_…)
     SITE_URL            your site origin, e.g. https://asadiqbal.site
   Install once:  npm install stripe
   ============================================================ */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  // CORS preflight — the store is served from a different origin (GitHub Pages)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
  if (!process.env.STRIPE_SECRET_KEY || !SITE_URL) {
    return json(500, { error: "Server not configured (STRIPE_SECRET_KEY / SITE_URL)." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return json(400, { error: "Invalid request body" }); }

  const requested = Array.isArray(body.items) ? body.items : [];
  if (!requested.length) return json(400, { error: "Cart is empty" });

  // Load the authoritative catalog from the live site
  let catalog;
  try {
    const res = await fetch(SITE_URL + "/Store/products.json", { cache: "no-store" });
    catalog = await res.json();
  } catch (e) {
    return json(500, { error: "Could not load product catalog" });
  }

  const currency = (catalog.currency || "gbp").toLowerCase();
  const byId = {};
  (catalog.products || []).forEach(function (p) { byId[String(p.id)] = p; });

  const line_items = [];
  for (const it of requested) {
    const p = byId[String(it.id)];
    const qty = Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1));
    if (!p) continue;
    if (p.stock != null && Number(p.stock) <= 0) continue;
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

  if (!line_items.length) return json(400, { error: "No purchasable items in cart" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      // Order confirmation email + receipt are sent by Stripe automatically.
      shipping_address_collection: { allowed_countries: ["GB", "US", "CA", "IE", "FR", "DE", "AU"] },
      phone_number_collection: { enabled: true },
      // Flat shipping example — edit or remove. Free over a threshold is also possible in Stripe.
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 499, currency: currency },
            display_name: "Standard (3–5 days)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 5 }
            }
          }
        }
      ],
      automatic_tax: { enabled: false }, // turn on once Stripe Tax is set up
      success_url: SITE_URL + "/Store/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE_URL + "/Store/cancel.html"
    });

    return json(200, { url: session.url, id: session.id });
  } catch (err) {
    return json(500, { error: err.message || "Stripe error" });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, cors()),
    body: JSON.stringify(obj)
  };
}
