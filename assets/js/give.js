/* Arise Dothan, give.js
   Front end for the Give page. Talks to Arise's existing Stripe +
   Supabase backend (AriseDothan/arise-giving-api on Render):
     POST {apiBase}/create-payment-intent   (one-time)
     POST {apiBase}/create-subscription     (weekly / monthly)
   Config is injected by the give page template into window.ARISE_GIVING:
     { apiBase, stripePk, funds:[...], amounts:[...] }
   PLACEHOLDER: apiBase + stripePk come from config.integrations and are
   placeholders until Christian confirms the live values. The UI is fully
   interactive without them; card entry + submission activate once a real
   Stripe publishable key is present. */
(function () {
  "use strict";

  var CFG = window.ARISE_GIVING || {};
  var root = document.querySelector("[data-give]");
  if (!root) return;

  var state = { fund: (CFG.funds && CFG.funds[0]) || "General Fund", amount: 50, freq: "once", coverFees: false };

  var els = {
    funds: root.querySelector("[data-give-funds]"),
    amounts: root.querySelector("[data-give-amounts]"),
    custom: root.querySelector("[data-give-custom]"),
    freq: root.querySelector("[data-give-freq]"),
    cover: root.querySelector("[data-give-cover]"),
    total: root.querySelector("[data-give-total]"),
    name: root.querySelector('[name="donorName"]'),
    email: root.querySelector('[name="donorEmail"]'),
    submit: root.querySelector("[data-give-submit]"),
    status: root.querySelector(".form-status"),
    cardMount: root.querySelector("[data-give-card]"),
    cardNotice: root.querySelector("[data-give-card-notice]")
  };

  var FEE_PCT = 0.029, FEE_FIXED = 0.30;
  function charged() {
    var base = Math.max(0, Number(state.amount) || 0);
    if (!state.coverFees || base <= 0) return base;
    return Math.round(((base + FEE_FIXED) / (1 - FEE_PCT)) * 100) / 100;
  }
  function money(n) { return "$" + (Number(n) || 0).toFixed(2); }

  function renderTotal() {
    if (!els.total) return;
    var label = state.freq === "once" ? "" : " / " + (state.freq === "weekly" ? "week" : "month");
    els.total.textContent = money(charged()) + label;
  }
  function setActive(container, val) {
    if (!container) return;
    container.querySelectorAll(".chip").forEach(function (c) {
      var on = c.dataset.value === String(val);
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", String(on));
    });
  }

  // Fund chips
  (CFG.funds || []).forEach(function (f) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.dataset.value = f; b.textContent = f;
    b.addEventListener("click", function () { state.fund = f; setActive(els.funds, f); });
    els.funds && els.funds.appendChild(b);
  });
  setActive(els.funds, state.fund);

  // Amount chips
  (CFG.amounts || [25, 50, 100, 250]).forEach(function (a) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.dataset.value = a; b.textContent = "$" + a;
    b.addEventListener("click", function () {
      state.amount = a; if (els.custom) els.custom.value = ""; setActive(els.amounts, a); renderTotal();
    });
    els.amounts && els.amounts.appendChild(b);
  });
  setActive(els.amounts, state.amount);

  if (els.custom) els.custom.addEventListener("input", function () {
    state.amount = els.custom.value; setActive(els.amounts, null); renderTotal();
  });

  // Frequency
  els.freq && els.freq.querySelectorAll(".chip").forEach(function (c) {
    c.addEventListener("click", function () { state.freq = c.dataset.value; setActive(els.freq, state.freq); renderTotal(); });
  });
  setActive(els.freq, state.freq);

  if (els.cover) els.cover.addEventListener("change", function () { state.coverFees = els.cover.checked; renderTotal(); });
  renderTotal();

  // ---- Stripe ----
  var stripe = null, card = null;
  var pkReady = CFG.stripePk && CFG.stripePk.indexOf("PLACEHOLDER") === -1 && typeof window.Stripe === "function";
  if (pkReady) {
    stripe = window.Stripe(CFG.stripePk);
    var elements = stripe.elements();
    card = elements.create("card", { style: { base: { fontSize: "16px", color: "#0e1726" } } });
    card.mount(els.cardMount);
    if (els.cardNotice) els.cardNotice.hidden = true;
  } else if (els.cardNotice) {
    els.cardNotice.hidden = false; // "Giving is being connected" message
  }

  function say(msg, ok) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = "form-status " + (ok ? "is-ok" : "is-err");
  }

  els.submit && els.submit.addEventListener("click", function () {
    var base = Number(state.amount) || 0;
    if (base < 1) return say("Please choose or enter an amount.", false);
    if (!els.name.value || !els.email.value) return say("Please add your name and email.", false);
    if (!pkReady) return say("Online giving is being connected, please check back soon, or give in person. Thank you!", false);

    els.submit.disabled = true; var label = els.submit.textContent; els.submit.textContent = "Processing…";
    var payload = {
      amount: charged(), giftAmount: base, fund: state.fund, freq: state.freq,
      donorName: els.name.value, donorEmail: els.email.value, coverFees: state.coverFees
    };
    var reset = function () { els.submit.disabled = false; els.submit.textContent = label; };

    if (state.freq === "once") {
      fetch(CFG.apiBase + "/create-payment-intent", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.clientSecret) throw new Error(d.error || "No client secret");
          return stripe.confirmCardPayment(d.clientSecret, { payment_method: { card: card, billing_details: { name: payload.donorName, email: payload.donorEmail } } });
        })
        .then(function (res) {
          if (res.error) throw res.error;
          say("Thank you for your generosity! Your gift to the " + state.fund + " was received.", true);
          reset();
        })
        .catch(function (err) { say(err.message || "Payment could not be completed.", false); reset(); });
    } else {
      stripe.createPaymentMethod({ type: "card", card: card, billing_details: { name: payload.donorName, email: payload.donorEmail } })
        .then(function (pm) {
          if (pm.error) throw pm.error;
          payload.paymentMethodId = pm.paymentMethod.id;
          return fetch(CFG.apiBase + "/create-subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.clientSecret) return stripe.confirmCardPayment(d.clientSecret);
          if (d.error) throw new Error(d.error);
        })
        .then(function () {
          say("Thank you! Your recurring gift to the " + state.fund + " is set up.", true);
          reset();
        })
        .catch(function (err) { say(err.message || "Could not set up recurring gift.", false); reset(); });
    }
  });
})();
