/* ============================================================
   STORE ENGINE
   - Loads products.json (your catalog)
   - Live search + category filter
   - Cart (persisted in localStorage on your own site)
   - Real checkout via Stripe (serverless function) with a
     Payment-Link fallback for single items.
   ============================================================ */
(function () {
  "use strict";

  /* ─────────────────────────────────────────────────────────
     CONFIG — set these two when you go live (see README.md)
     ───────────────────────────────────────────────────────── */
  var CONFIG = {
    // Your serverless endpoint that creates a Stripe Checkout Session.
    // The site is hosted on GitHub Pages (can't run functions), so this points
    // at the Netlify domain where the function actually runs. If your Netlify
    // URL is different, change it to match (Netlify → Project overview shows it).
    // Leave "" to fall back to per-product Stripe Payment Links.
    CHECKOUT_ENDPOINT: "https://personal-website-v2-ashy.vercel.app/api/create-checkout-session",

    // Your Stripe *publishable* key (starts with pk_). Safe in the browser.
    // Only needed if the endpoint returns a session id instead of a url.
    STRIPE_PUBLISHABLE_KEY: ""
  };

  var CART_KEY = "store_cart_v1";
  var state = { products: [], currency: "gbp", symbol: "£", filter: "all", query: "", cart: {} };

  /* ── Currency helpers ── */
  var SYMBOLS = { gbp: "£", usd: "$", eur: "€", cad: "$", aud: "$" };
  function money(n) { return state.symbol + n.toFixed(2); }

  /* ── DOM refs ── */
  var $ = function (id) { return document.getElementById(id); };
  var grid, search, searchClear, chips, cartItems, cartEmpty, cartFooter,
      cartCount, cartTotal, drawer, overlay, checkoutBtn, checkoutStatus;

  /* ─────────────────────────────────────────────────────────
     THEME (mirrors the main site's 3-state toggle)
     ───────────────────────────────────────────────────────── */
  function initTheme() {
    var btn = $("theme-toggle"), icon = $("theme-icon"), label = $("theme-label");
    if (!btn) return;
    function apply(pref) {
      var eff = pref === "auto"
        ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : pref;
      document.documentElement.setAttribute("data-theme", eff);
      if (icon && label) {
        if (pref === "auto") { icon.className = "fas fa-circle-half-stroke"; label.textContent = "auto"; }
        else if (pref === "light") { icon.className = "fas fa-sun"; label.textContent = "light"; }
        else { icon.className = "fas fa-moon"; label.textContent = "dark"; }
      }
    }
    apply(localStorage.getItem("theme") || "auto");
    btn.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      var cur = localStorage.getItem("theme") || "auto";
      var next = order[(order.indexOf(cur) + 1) % order.length];
      localStorage.setItem("theme", next);
      apply(next);
    });
  }

  /* ─────────────────────────────────────────────────────────
     NAVBAR / MOBILE NAV
     ───────────────────────────────────────────────────────── */
  function initNav() {
    var burger = $("hamburger"), mobile = $("mobile-nav");
    if (burger && mobile) {
      burger.addEventListener("click", function () {
        burger.classList.toggle("open");
        mobile.classList.toggle("open");
      });
    }
    window.closeMobileNav = function () {
      if (burger) burger.classList.remove("open");
      if (mobile) mobile.classList.remove("open");
    };
  }

  /* ─────────────────────────────────────────────────────────
     LOAD CATALOG
     ───────────────────────────────────────────────────────── */
  function loadProducts() {
    fetch("products.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        state.products = (data.products || []).map(function (p) {
          return {
            id: String(p.id),
            name: p.name || "Untitled",
            category: (p.category || "other").toLowerCase(),
            price: Number(p.price) || 0,
            description: p.description || "",
            image: p.image || "",
            stock: p.stock == null ? null : Number(p.stock),
            paymentLink: p.paymentLink || ""
          };
        });
        state.currency = (data.currency || "gbp").toLowerCase();
        state.symbol = SYMBOLS[state.currency] || "£";
        buildChips();
        render();
      })
      .catch(function (err) {
        grid.innerHTML =
          '<div class="store-msg"><span class="big">shelves empty</span>' +
          "Couldn't load <b>products.json</b> (" + err.message + ").<br>" +
          "Check the file exists in the Store folder and is valid JSON.</div>";
      });
  }

  /* ─────────────────────────────────────────────────────────
     RENDER GRID
     ───────────────────────────────────────────────────────── */
  function buildChips() {
    var cats = ["all"].concat(
      state.products.map(function (p) { return p.category; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; })
    );
    chips.innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === state.filter ? " active" : "") +
        '" data-cat="' + c + '">' + c + "</button>";
    }).join("");
    chips.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        state.filter = b.dataset.cat;
        chips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        render();
      });
    });
  }

  function visibleProducts() {
    var q = state.query.trim().toLowerCase();
    return state.products.filter(function (p) {
      var inCat = state.filter === "all" || p.category === state.filter;
      var inQuery = !q ||
        p.name.toLowerCase().indexOf(q) > -1 ||
        p.category.toLowerCase().indexOf(q) > -1 ||
        p.description.toLowerCase().indexOf(q) > -1;
      return inCat && inQuery;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function productCard(p) {
    var out = p.stock != null && p.stock <= 0;
    var media = p.image
      ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) +
        '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="media-fallback" style="display:none">' + escapeHtml(p.name.charAt(0)) + "</div>"
      : '<div class="media-fallback">' + escapeHtml(p.name.charAt(0)) + "</div>";
    var badge = out
      ? '<span class="product-badge out">sold out</span>'
      : (p.stock != null && p.stock <= 5 ? '<span class="product-badge">low stock</span>' : "");
    return '<article class="product-card">' +
      '<div class="product-media">' + media + badge + "</div>" +
      '<div class="product-body">' +
        '<span class="product-cat">' + escapeHtml(p.category) + "</span>" +
        '<h3 class="product-name">' + escapeHtml(p.name) + "</h3>" +
        '<p class="product-desc">' + escapeHtml(p.description) + "</p>" +
        '<div class="product-foot">' +
          '<span class="product-price"><span class="cur">' + state.symbol + "</span>" + p.price.toFixed(2) + "</span>" +
          '<button class="add-btn" data-add="' + escapeHtml(p.id) + '"' + (out ? " disabled" : "") + ">" +
            (out ? "sold out" : "add to cart") + "</button>" +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function render() {
    var list = visibleProducts();
    if (!list.length) {
      grid.innerHTML =
        '<div class="store-msg"><span class="big">nothing here</span>' +
        "No products match <b>" + (escapeHtml(state.query) || "that filter") + "</b>.</div>";
      return;
    }
    grid.innerHTML = list.map(productCard).join("");
    grid.querySelectorAll("[data-add]").forEach(function (b) {
      b.addEventListener("click", function () { addToCart(b.dataset.add); });
    });
  }

  /* ─────────────────────────────────────────────────────────
     CART
     ───────────────────────────────────────────────────────── */
  function loadCart() {
    try { state.cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
    catch (e) { state.cart = {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) {}
  }
  function product(id) {
    return state.products.filter(function (p) { return p.id === id; })[0];
  }
  function cartArray() {
    return Object.keys(state.cart).map(function (id) {
      var p = product(id);
      return p ? { p: p, qty: state.cart[id] } : null;
    }).filter(Boolean);
  }
  function cartCountNum() {
    return cartArray().reduce(function (n, i) { return n + i.qty; }, 0);
  }
  function cartTotalNum() {
    return cartArray().reduce(function (n, i) { return n + i.p.price * i.qty; }, 0);
  }

  function addToCart(id) {
    var p = product(id);
    if (!p) return;
    var have = state.cart[id] || 0;
    if (p.stock != null && have >= p.stock) return; // respect stock
    state.cart[id] = have + 1;
    saveCart();
    updateCartUI();
    openCart();
  }
  function setQty(id, qty) {
    var p = product(id);
    if (qty <= 0) { delete state.cart[id]; }
    else if (p && p.stock != null && qty > p.stock) { state.cart[id] = p.stock; }
    else { state.cart[id] = qty; }
    saveCart();
    updateCartUI();
  }

  function updateCartUI() {
    var count = cartCountNum();
    cartCount.textContent = count;
    cartCount.classList.toggle("show", count > 0);

    var items = cartArray();
    if (!items.length) {
      cartEmpty.hidden = false;
      cartItems.querySelectorAll(".cart-item").forEach(function (n) { n.remove(); });
      cartFooter.hidden = true;
      return;
    }
    cartEmpty.hidden = true;
    cartFooter.hidden = false;
    cartItems.querySelectorAll(".cart-item").forEach(function (n) { n.remove(); });

    items.forEach(function (i) {
      var row = document.createElement("div");
      row.className = "cart-item";
      var media = i.p.image
        ? '<img src="' + escapeHtml(i.p.image) + '" alt="" onerror="this.style.display=\'none\'">'
        : "";
      row.innerHTML =
        '<div class="cart-item-media">' + media + "</div>" +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + escapeHtml(i.p.name) + "</div>" +
          '<div class="cart-item-price">' + money(i.p.price) + " each</div>" +
          '<div class="cart-qty">' +
            '<button class="qty-btn" data-dec="' + escapeHtml(i.p.id) + '" aria-label="Decrease">−</button>' +
            '<span class="qty-val">' + i.qty + "</span>" +
            '<button class="qty-btn" data-inc="' + escapeHtml(i.p.id) + '" aria-label="Increase">+</button>' +
          "</div>" +
        "</div>" +
        '<button class="cart-item-remove" data-rm="' + escapeHtml(i.p.id) + '" aria-label="Remove"><i class="fas fa-trash-can"></i></button>';
      cartItems.appendChild(row);
    });

    cartItems.querySelectorAll("[data-inc]").forEach(function (b) {
      b.onclick = function () { setQty(b.dataset.inc, (state.cart[b.dataset.inc] || 0) + 1); };
    });
    cartItems.querySelectorAll("[data-dec]").forEach(function (b) {
      b.onclick = function () { setQty(b.dataset.dec, (state.cart[b.dataset.dec] || 0) - 1); };
    });
    cartItems.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () { setQty(b.dataset.rm, 0); };
    });

    cartTotal.innerHTML = '<span class="cur">' + state.symbol + "</span>" + cartTotalNum().toFixed(2);
  }

  function openCart() {
    drawer.classList.add("open");
    overlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeCart() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }

  /* ─────────────────────────────────────────────────────────
     CHECKOUT (real Stripe)
     ───────────────────────────────────────────────────────── */
  function setStatus(msg, kind) {
    checkoutStatus.textContent = msg || "";
    checkoutStatus.className = "checkout-status" + (kind ? " " + kind : "");
  }

  function checkout() {
    var items = cartArray();
    if (!items.length) return;

    // Path A — serverless Stripe Checkout Session (supports full cart)
    if (CONFIG.CHECKOUT_ENDPOINT) {
      checkoutBtn.disabled = true;
      setStatus("redirecting to secure checkout…", "working");
      fetch(CONFIG.CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(function (i) { return { id: i.p.id, quantity: i.qty }; })
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d && res.d.error ? res.d.error : "checkout failed");
          if (res.d.url) { window.location.href = res.d.url; return; }
          if (res.d.id && CONFIG.STRIPE_PUBLISHABLE_KEY && window.Stripe) {
            return window.Stripe(CONFIG.STRIPE_PUBLISHABLE_KEY)
              .redirectToCheckout({ sessionId: res.d.id });
          }
          throw new Error("no checkout url returned");
        })
        .catch(function (err) {
          checkoutBtn.disabled = false;
          setStatus(err.message + " — see README setup.", "error");
        });
      return;
    }

    // Path B — single-item Stripe Payment Link fallback (no server)
    if (items.length === 1 && items[0].p.paymentLink) {
      window.location.href = items[0].p.paymentLink;
      return;
    }
    if (items.every(function (i) { return i.p.paymentLink; })) {
      setStatus("Multiple items need the serverless checkout. Opening the first item…", "error");
      setTimeout(function () { window.location.href = items[0].p.paymentLink; }, 1400);
      return;
    }
    setStatus("Checkout isn't configured yet — see README.md.", "error");
  }

  /* ─────────────────────────────────────────────────────────
     INIT
     ───────────────────────────────────────────────────────── */
  function init() {
    grid = $("product-grid"); search = $("search"); searchClear = $("search-clear");
    chips = $("filter-chips"); cartItems = $("cart-items"); cartEmpty = $("cart-empty");
    cartFooter = $("cart-footer"); cartCount = $("cart-count"); cartTotal = $("cart-total-val");
    drawer = $("cart-drawer"); overlay = $("cart-overlay");
    checkoutBtn = $("checkout-btn"); checkoutStatus = $("checkout-status");

    initTheme();
    initNav();
    loadCart();
    loadProducts();
    updateCartUI();

    // search
    search.addEventListener("input", function () {
      state.query = search.value;
      searchClear.hidden = !search.value;
      render();
    });
    searchClear.addEventListener("click", function () {
      search.value = ""; state.query = ""; searchClear.hidden = true; render(); search.focus();
    });

    // cart open/close
    $("cart-toggle").addEventListener("click", openCart);
    $("cart-close").addEventListener("click", closeCart);
    overlay.addEventListener("click", closeCart);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });

    // checkout
    checkoutBtn.addEventListener("click", checkout);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
