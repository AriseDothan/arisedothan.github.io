/* Arise Dothan, plan-visit.js
   The "Plan your visit" composer: the visitor enters their first name +
   what brings them, and this live-builds a friendly message and opens
   their phone's Messages app pre-filled to Pastor Brian's number.
   Direct, personal first contact, no form, no CRM.
   Config injected by the connect page: window.ARISE_PLAN = { pastorSms }. */
(function () {
  "use strict";
  var root = document.querySelector("[data-plan]");
  if (!root) return;
  var cfg = window.ARISE_PLAN || {};

  var nameEl = root.querySelector('[name="planName"]');
  var noteEl = root.querySelector('[name="planNote"]');
  var chips = [].slice.call(root.querySelectorAll("[data-plan-intent] .chip"));
  var preview = root.querySelector("[data-plan-preview]");
  var link = root.querySelector("[data-plan-send]");

  var INTENTS = {
    visit: "I'd love to plan a visit to a Sunday gathering",
    launch: "I'd love to hear about joining the launch team",
    meet: "I'd love to meet you before I come on a Sunday",
    question: "I have a question I was hoping you could help me with",
    prayer: "I have something I'd really appreciate prayer for"
  };
  var intent = "visit";

  function build() {
    var name = (nameEl && nameEl.value || "").trim();
    var who = name || "someone new to Arise";
    var note = (noteEl && noteEl.value || "").trim();
    var msg = "Hi Pastor Brian! This is " + who + ". I found Arise Dothan online and " + (INTENTS[intent] || INTENTS.visit) + ".";
    if (note) msg += " A little about me: " + note;
    msg += " Hope to connect soon!";

    if (preview) preview.textContent = msg;
    if (link) {
      var num = (cfg.pastorSms || "").replace(/\s+/g, "");
      link.setAttribute("href", "sms:" + num + "?&body=" + encodeURIComponent(msg));
      link.classList.toggle("is-disabled", !name);
      link.setAttribute("aria-disabled", name ? "false" : "true");
    }
    return msg;
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      intent = c.dataset.value;
      chips.forEach(function (x) {
        var on = x === c;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-pressed", String(on));
      });
      build();
    });
  });
  if (nameEl) nameEl.addEventListener("input", build);
  if (noteEl) noteEl.addEventListener("input", build);

  if (chips[0]) { chips[0].classList.add("is-active"); chips[0].setAttribute("aria-pressed", "true"); }
  build();
})();
