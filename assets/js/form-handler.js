/* Arise Dothan — form-handler.js
   Handles contact / prayer / connect forms.
   Posts JSON to the form's data-endpoint (Supabase Edge Function or
   email relay). If no endpoint is configured yet, it validates and
   shows a friendly confirmation so the page is testable pre-wiring.
   PLACEHOLDER: set data-endpoint on the <form> (injected from config). */
(function () {
  "use strict";

  function param(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function bind(form) {
    var statusEl = form.querySelector(".form-status");
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Honeypot — silently drop bots
      var trap = form.querySelector('input[name="company"]');
      if (trap && trap.value) return;

      if (!form.checkValidity()) { form.reportValidity(); return; }

      var data = Object.fromEntries(new FormData(form).entries());
      delete data.company;
      data.source_page = window.location.pathname;
      data.utm_source = param("utm_source");
      data.utm_medium = param("utm_medium");
      data.utm_campaign = param("utm_campaign");

      var endpoint = form.getAttribute("data-endpoint");
      var say = function (msg, ok) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = "form-status " + (ok ? "is-ok" : "is-err");
      };

      if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = "Sending…"; }

      var done = function (ok, msg) {
        say(msg, ok);
        if (button) { button.disabled = false; button.textContent = button.dataset.label || "Send"; }
        if (ok) form.reset();
      };

      if (!endpoint || endpoint.indexOf("PLACEHOLDER") !== -1) {
        // Not wired yet — confirm locally so the form is testable.
        setTimeout(function () { done(true, "Thank you! We'll be in touch soon. (Form backend not yet connected.)"); }, 500);
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var body = null;
            try { body = text ? JSON.parse(text) : null; } catch (e) {}
            // Some relays (e.g. FormSubmit's AJAX endpoint) return HTTP 200
            // with a JSON { success, message } body even on logical failure,
            // so check that field when present instead of trusting r.ok alone.
            var ok = r.ok;
            if (body && typeof body.success !== "undefined") {
              ok = body.success === true || body.success === "true";
              // FormSubmit's one-time activation gate: a brand-new destination
              // inbox returns success:"false" with an "Activation" message and
              // emails the inbox owner an activation link — the submission was
              // still received, so treat this as success for the visitor. Once
              // the owner clicks the link, later submissions return success
              // normally and never hit this branch again.
              if (!ok && /activation/i.test(body.message || "")) ok = true;
            }
            if (!ok) throw new Error((body && body.message) || ("HTTP " + r.status));
            done(true, "Thank you! We received your message and will reach out soon.");
          });
        })
        .catch(function () {
          done(false, "Sorry — something went wrong. Please call us at " + (form.getAttribute("data-phone") || "334-216-1587") + ".");
        });
    });
  }

  document.querySelectorAll("form[data-arise-form]").forEach(bind);
})();
