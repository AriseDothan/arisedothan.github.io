/* Arise Dothan — motion.js
   The "rises like dawn" motion layer: scroll reveals, rising-ember
   particles, hero parallax, horizon scroll-beam, timeline glow-spine,
   CTA ignite, counters. All rAF-throttled and motion/touch-gated. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var narrow = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;

  /* ---- 1. Scroll reveals ---- */
  (function () {
    var els = [].slice.call(document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale"));
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("visible"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* ---- 2. Horizon scroll-beam ---- */
  (function () {
    if (reduce) return;
    var bar = document.createElement("div");
    bar.className = "scroll-beam";
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var total = document.documentElement.scrollHeight - window.innerHeight;
      var p = total > 0 ? window.pageYOffset / total : 0;
      bar.classList.toggle("visible", p > 0.02 && p < 0.99);
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
      ticking = false;
    }
    window.addEventListener("scroll", function () { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
  })();

  /* ---- 3. Rising-ember particles ---- */
  (function () {
    if (reduce) return;
    document.querySelectorAll(".ember-field").forEach(function (field) {
      var n = narrow ? 7 : 14;
      for (var i = 0; i < n; i++) {
        var e = document.createElement("span");
        e.className = "ember";
        e.style.left = (Math.random() * 100).toFixed(2) + "%";
        e.style.animationDuration = (7 + Math.random() * 11).toFixed(2) + "s";
        e.style.animationDelay = (Math.random() * 9).toFixed(2) + "s";
        var s = (2 + Math.random() * 3).toFixed(1);
        e.style.width = s + "px"; e.style.height = s + "px";
        e.style.setProperty("--drift", (Math.random() * 60 - 24).toFixed(0) + "px");
        field.appendChild(e);
      }
    });
  })();

  /* ---- 4. Hero parallax (desktop only) ---- */
  (function () {
    if (reduce || coarse || narrow) return;
    var bg = document.querySelector(".hero__bg[data-parallax]");
    if (!bg) return;
    var ticking = false;
    function update() {
      var y = window.pageYOffset;
      var h = bg.parentElement.offsetHeight || window.innerHeight;
      var shift = Math.min(y * 0.28, h * 0.22);
      bg.style.transform = "translateY(" + shift.toFixed(1) + "px)";
      ticking = false;
    }
    window.addEventListener("scroll", function () { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
  })();

  /* ---- 5. Timeline glow-spine (sequential reveal) ---- */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    document.querySelectorAll(".timeline").forEach(function (tl) {
      var items = [].slice.call(tl.querySelectorAll(".timeline-item"));
      var glow = tl.querySelector(".timeline-glow");
      if (!items.length) return;
      if (reduce) { items.forEach(function (it) { it.classList.add("visible"); }); if (glow) glow.style.height = "100%"; return; }
      var idx = 0;
      (function watchNext() {
        if (idx >= items.length) return;
        var item = items[idx];
        var obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            obs.disconnect();
            item.classList.add("visible");
            if (glow) glow.style.height = Math.min(((item.offsetTop + item.offsetHeight) / tl.scrollHeight) * 100, 100) + "%";
            idx++;
            setTimeout(watchNext, 320);
          });
        }, { threshold: 0.01, rootMargin: "0px 0px -22% 0px" });
        obs.observe(item);
      })();
    });
  })();

  /* ---- 6. CTA ignite (scroll-linked warm-up) ---- */
  (function () {
    if (reduce) return;
    var band = document.querySelector(".cta-band");
    var glow = band && band.querySelector(".cta-glow");
    if (!glow) return;
    var ticking = false;
    function update() {
      var r = band.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.75)));
      glow.style.opacity = (0.4 + p * 0.6).toFixed(3);
      glow.style.transform = "translate(-50%,-50%) scale(" + (0.85 + p * 0.25).toFixed(3) + ")";
      ticking = false;
    }
    window.addEventListener("scroll", function () { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
  })();

  /* ---- 7. Count-up stats ---- */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var nums = [].slice.call(document.querySelectorAll("[data-count]"));
    if (!nums.length) return;
    if (reduce) { nums.forEach(function (el) { el.textContent = (+el.dataset.count).toLocaleString() + (el.dataset.suffix || ""); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; io.unobserve(el);
        var target = +el.dataset.count, suffix = el.dataset.suffix || "", dur = 1800, start = null;
        requestAnimationFrame(function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(eased * target).toLocaleString() + suffix;
          if (p < 1) requestAnimationFrame(step);
        });
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io.observe(el); });
  })();
})();
