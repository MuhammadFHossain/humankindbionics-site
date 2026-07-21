/* Shared landing-page runtime
 * Price and copy variants by URL parameter, attribution capture, deposit and
 * email wiring, and event tracking to GA4, Plausible, and Meta.
 *
 * Each page defines window.HKB_CONFIG before loading this script. See README.md.
 * No build step, no dependencies.
 */
(function () {
  "use strict";

  var CFG = window.HKB_CONFIG || {};
  var QS = new URLSearchParams(window.location.search);

  // ---- helpers ---------------------------------------------------------
  function isPlaceholder(v) {
    return !v || /XXXX|EXAMPLE|YOUR_/i.test(String(v));
  }
  function pick(obj, key, fallback) {
    return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
  }

  // ---- resolve active variants ----------------------------------------
  var prices = CFG.prices || { "399": { label: "$399", monthly: "$34/mo", amount: 399 } };
  var priceKeys = Object.keys(prices);
  var priceVar = QS.get("p");
  if (priceKeys.indexOf(priceVar) === -1) priceVar = CFG.defaultPrice || priceKeys[0];

  var copyVar = (QS.get("v") || CFG.defaultCopy || "a").toLowerCase();

  // ---- capture attribution (persist for this visit) -------------------
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
  var attribution = {};
  try {
    var stored = JSON.parse(sessionStorage.getItem("hkb_attr") || "{}");
    attribution = stored || {};
  } catch (e) { attribution = {}; }
  UTM_KEYS.forEach(function (k) {
    var val = QS.get(k);
    if (val) attribution[k] = val;
  });
  if (!attribution.first_referrer) {
    attribution.first_referrer = document.referrer || "direct";
  }
  // Landing pages own the stored brand; shared pages (support, legal, thanks)
  // must not overwrite it, or we lose the record of which brand the visitor
  // came from and can no longer offer them a way back.
  var isLanding = !!document.querySelector('[data-section="reserve"]');
  if (isLanding) {
    attribution.brand = CFG.brand || "unknown";
    // Persist the active variants too, so /thanks/ can recover what the visitor
    // actually saw after Stripe redirects them back (sessionStorage survives the round-trip).
    attribution.price_variant = priceVar;
    attribution.copy_variant = copyVar;
  }
  try { sessionStorage.setItem("hkb_attr", JSON.stringify(attribution)); } catch (e) {}

  function context() {
    var c = { brand: CFG.brand || "unknown", price_variant: priceVar, copy_variant: copyVar };
    UTM_KEYS.forEach(function (k) { if (attribution[k]) c[k] = attribution[k]; });
    c.referrer = attribution.first_referrer;
    return c;
  }

  // ---- event tracking -------------------------------------------------
  window.HKB_EVENTS = window.HKB_EVENTS || [];
  function track(name, extra) {
    var payload = context();
    if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    window.HKB_EVENTS.push({ event: name, at: Date.now(), data: payload });
    // GA4
    if (typeof window.gtag === "function") {
      try { window.gtag("event", name, payload); } catch (e) {}
    }
    // Plausible (custom events + props)
    if (typeof window.plausible === "function") {
      try { window.plausible(name, { props: payload }); } catch (e) {}
    }
    // Meta Pixel: map to standard events for IG/Facebook ad optimization, plus a custom event
    if (typeof window.fbq === "function") {
      try {
        var stdMap = { email_submit: "Lead", deposit_click: "InitiateCheckout" };
        if (stdMap[name]) {
          window.fbq("track", stdMap[name], { content_category: payload.brand, content_name: payload.copy_variant, currency: "USD", value: 0 });
        }
        window.fbq("trackCustom", "hkb_" + name, payload);
      } catch (e) {}
    }
    if (window.HKB_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug("[HKB]", name, payload);
    }
  }
  window.HKB_track = track;

  // ---- load analytics libs if configured ------------------------------
  function loadGA4(id) {
    if (isPlaceholder(id)) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
  }
  function loadPlausible(domain) {
    if (isPlaceholder(domain)) return;
    var s = document.createElement("script");
    s.defer = true;
    s.setAttribute("data-domain", domain);
    s.src = "https://plausible.io/js/script.manual.js";
    document.head.appendChild(s);
    window.plausible = window.plausible || function () {
      (window.plausible.q = window.plausible.q || []).push(arguments);
    };
  }
  function loadMetaPixel(id) {
    if (isPlaceholder(id)) return;
    if (window.fbq) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }
  loadGA4(CFG.ga4Id);
  loadPlausible(CFG.plausibleDomain);
  loadMetaPixel(CFG.metaPixelId);

  // ---- apply price + copy variants to the DOM -------------------------
  function applyVariants() {
    var p = prices[priceVar] || {};
    document.querySelectorAll("[data-price]").forEach(function (el) {
      el.textContent = p.label || ("$" + (p.amount || ""));
    });
    document.querySelectorAll("[data-price-monthly]").forEach(function (el) {
      el.textContent = p.monthly || "";
    });
    document.querySelectorAll("[data-price-amount]").forEach(function (el) {
      el.textContent = String(p.amount || "");
    });
    // copy variants: show the active one, hide the rest
    document.querySelectorAll("[data-copy]").forEach(function (el) {
      el.style.display = (el.getAttribute("data-copy") === copyVar) ? "" : "none";
    });
    // reflect variant on <body> for optional CSS hooks
    document.body.setAttribute("data-active-price", priceVar);
    document.body.setAttribute("data-active-copy", copyVar);
  }

  // ---- deposit buttons ------------------------------------------------
  function wireDeposit() {
    var base = CFG.stripeDeposit || "#";
    document.querySelectorAll("[data-deposit]").forEach(function (el) {
      var url = base;
      if (!isPlaceholder(base)) {
        var join = base.indexOf("?") === -1 ? "?" : "&";
        var params = new URLSearchParams();
        params.set("client_reference_id", (CFG.brand || "x") + "_" + priceVar + "_" + copyVar);
        UTM_KEYS.forEach(function (k) { if (attribution[k]) params.set(k, attribution[k]); });
        url = base + join + params.toString();
      }
      el.setAttribute("href", url);
      el.addEventListener("click", function () {
        track("deposit_click", { location: el.getAttribute("data-deposit") || "cta" });
      });
    });
  }

  // ---- email capture (Formspree AJAX) ---------------------------------
  function wireEmail() {
    var forms = document.querySelectorAll("form[data-email-form]");
    forms.forEach(function (form) {
      // inject hidden context fields so every lead carries its attribution
      var ctx = context();
      Object.keys(ctx).forEach(function (k) {
        if (form.querySelector('[name="' + k + '"]')) return;
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = ctx[k];
        form.appendChild(input);
      });

      var endpoint = form.getAttribute("action");
      var status = form.querySelector("[data-form-status]");

      form.addEventListener("submit", function (e) {
        var emailField = form.querySelector('input[type="email"]');
        if (!emailField || !emailField.value) return; // let native validation handle it
        track("email_submit", { location: form.getAttribute("data-email-form") || "form" });

        // If endpoint isn't wired yet, don't block — allow default (or show note)
        if (isPlaceholder(endpoint)) {
          e.preventDefault();
          if (status) { status.textContent = "Thanks. We'll be in touch."; status.hidden = false; }
          form.reset();
          return;
        }
        // AJAX submit to keep the visitor on-page
        e.preventDefault();
        var data = new FormData(form);
        fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (status) {
              status.textContent = r.ok ? "Thanks. You're on the list." : "Something went wrong. Try again.";
              status.hidden = false;
            }
            if (r.ok) form.reset();
          })
          .catch(function () {
            if (status) { status.textContent = "Network error. Try again."; status.hidden = false; }
          });
      });
    });
  }

  // ---- engagement tracking -------------------------------------------
  function wireScroll() {
    var marks = [25, 50, 75, 100];
    var hit = {};
    function onScroll() {
      var h = document.documentElement;
      var scrolled = (h.scrollTop || document.body.scrollTop);
      var height = (h.scrollHeight - h.clientHeight) || 1;
      var pct = Math.min(100, Math.round((scrolled / height) * 100));
      marks.forEach(function (m) {
        if (pct >= m && !hit[m]) { hit[m] = true; track("scroll_depth", { depth: m }); }
      });
    }
    window.addEventListener("scroll", throttle(onScroll, 400), { passive: true });
  }

  function wireSections() {
    if (!("IntersectionObserver" in window)) return;
    var seen = {};
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.getAttribute("data-section");
          if (id && !seen[id]) { seen[id] = true; track("section_view", { section: id }); }
        }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll("[data-section]").forEach(function (el) { obs.observe(el); });
  }

  function wireExitIntent() {
    var fired = false;
    document.addEventListener("mouseout", function (e) {
      if (fired) return;
      if (!e.relatedTarget && e.clientY <= 0) { fired = true; track("exit_intent"); }
    });
  }

  function wireTimeOnPage() {
    var start = Date.now();
    var sent = false;
    function send() {
      if (sent) return; sent = true;
      track("time_on_page", { seconds: Math.round((Date.now() - start) / 1000) });
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") send();
    });
    window.addEventListener("pagehide", send);
  }

  function throttle(fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now();
      if (now - last >= ms) { last = now; fn(); }
      else { clearTimeout(timer); timer = setTimeout(function () { last = Date.now(); fn(); }, ms); }
    };
  }

  // ---- year + misc niceties ------------------------------------------
  function misc() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  // ---- injected trust components (prelaunch best practice) -----------
  function makeEl(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function reservationSection(ship) {
    return '' +
    '<section class="section" data-section="reservation"><div class="wrap">' +
      '<p class="eyebrow center" style="text-align:center">How the reservation works</p>' +
      '<h2 class="center">Reserve now. Pay the rest later.</h2>' +
      '<div class="steps" style="margin-top:2.5rem">' +
        '<div class="step"><div class="step__n">1</div><h3>Pay a $100 deposit</h3><p>It holds your place in the first batch and comes off the price. It is fully refundable, any time.</p></div>' +
        '<div class="step"><div class="step__n">2</div><h3>We email you first</h3><p>When your glove is ready, we email you before we charge the rest. There is no surprise charge.</p></div>' +
        '<div class="step"><div class="step__n">3</div><h3>It ships</h3><p>We expect the first gloves to ship in ' + ship + '. If that changes, we email you a new date and you can cancel for a full refund.</p></div>' +
      '</div>' +
      '<div class="promise">' +
        '<p><b>Our promise.</b> Before it ships, your $100 deposit is fully refundable, any time, for any reason. Email us and we return it within 5 business days. After it arrives, try it for 30 days. If it does not help, send it back in usable condition and we refund what you paid.</p>' +
        '<p><b>You are not charged the full price today.</b> Today you pay only the $100 refundable deposit. We charge the rest only when your glove is ready to ship, and we email you first.</p>' +
        '<p><b>Honest about the risks.</b> This is real hardware. The most likely risk is a delay, because parts and manufacturing can slip. If the date moves, we email you a new one and you can cancel for a full refund. We are also still doing sizing and durability testing. Because your deposit is refundable, you are never locked in while we finish the work.</p>' +
        '<p><b>Secure checkout.</b> Payments are handled by Stripe, the same system used by millions of businesses. We never see or store your full card number.</p>' +
      '</div>' +
    '</div></section>';
  }
  function injectTrust() {
    // only on landing pages (those with a reserve/offer section)
    if (!document.querySelector('[data-section="reserve"]')) return;
    var ship = CFG.shipWindow || "the first half of 2027";
    var base = CFG.legalBase || "../";

    var hero = document.querySelector(".hero");
    if (hero && !document.querySelector(".trustbar")) {
      var tb = makeEl('<div class="trustbar"><div class="trustbar__inner">' +
        '<span><b>Fully refundable</b> deposit</span>' +
        '<span>You are <b>not charged the full price</b> today</span>' +
        '<span>Secure checkout by <b>Stripe</b></span>' +
        '</div></div>');
      hero.parentNode.insertBefore(tb, hero.nextSibling);
    }

    var sec = makeEl(reservationSection(ship));
    var faq = document.querySelector('[data-section="faq"]');
    var footer = document.querySelector(".footer");
    if (faq) faq.parentNode.insertBefore(sec, faq);
    else if (footer) footer.parentNode.insertBefore(sec, footer);

    var fwrap = document.querySelector(".footer .wrap");
    if (fwrap && !fwrap.querySelector(".legal-links")) {
      fwrap.appendChild(makeEl('<p class="legal-links">' +
        '<a href="' + base + 'guarantee/">Money-back guarantee</a>' +
        '<a href="' + base + 'privacy/">Privacy</a>' +
        '<a href="' + base + 'terms/">Terms</a>' +
        '<a href="' + base + 'support/">Support</a>' +
        '</p>'));
    }
  }

  // ---- shared-page footer --------------------------------------------
  // support / guarantee / privacy / terms / thanks each hand-rolled their own
  // footer, and four of the five were dead ends: no way back to the brand the
  // visitor arrived from, and no way across to the other shared pages. Two of
  // them promised "email us" in the body while offering no address. One footer,
  // built here, keeps all five consistent.
  var SHARED_NAV = [
    { slug: "support",   label: "Support" },
    { slug: "guarantee", label: "Money-back guarantee" },
    { slug: "privacy",   label: "Privacy" },
    { slug: "terms",     label: "Terms" }
  ];
  var BRAND_NAMES = {
    capstan: "Capstan", reclaim: "Reclaim", easygrip: "EasyGrip",
    workgrip: "WorkGrip", golfgrip: "GolfGrip", picklegrip: "PickleGrip",
    tennisgrip: "TennisGrip", liftgrip: "LiftGrip", gripgift: "GripGift"
  };

  function injectSharedFooter() {
    if (isLanding) return;
    var foot = document.querySelector(".footer");
    if (!foot) return;

    var base = CFG.legalBase || "../";
    var email = CFG.contactEmail || "contact@farhanhossain.com";
    var here = CFG.brand;
    var from = attribution.brand;
    var backName = BRAND_NAMES[from];

    var h = '<div class="wrap">';
    // Only offer the way back if we actually know where they came from.
    // A visitor who opened this page directly has no origin to return to.
    if (backName) {
      h += '<p class="sfoot__back"><a href="' + base + from + '/">' +
           '<span aria-hidden="true">←</span> Back to ' + backName + '</a></p>';
    }
    h += '<ul class="sfoot__nav">';
    SHARED_NAV.forEach(function (p) {
      h += p.slug === here
        ? '<li><span aria-current="page">' + p.label + '</span></li>'
        : '<li><a href="' + base + p.slug + '/">' + p.label + '</a></li>';
    });
    h += '</ul>';
    h += '<p class="sfoot__contact">Questions? <a href="mailto:' + email + '">' +
         email + '</a>. A real person reads and answers.</p>';
    h += '<p class="sfoot__fine">© <span data-year></span> · A grip aid, not a ' +
         'medical device. Not intended to diagnose, treat, cure, or prevent any disease ' +
         'or condition. Your deposit is fully refundable at any time before your order ships.</p>';
    h += '</div>';
    foot.innerHTML = h;
  }

  // ---- boot -----------------------------------------------------------
  function boot() {
    injectTrust();
    injectSharedFooter();
    applyVariants();
    wireDeposit();
    wireEmail();
    wireScroll();
    wireSections();
    wireExitIntent();
    wireTimeOnPage();
    misc();
    track("page_view", { title: document.title });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
