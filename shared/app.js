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
  // priceVar is validated against the available keys above; copyVar was not, so
  // a stray ?v= in an ad URL hid every copy block and served an empty hero.
  (function () {
    var seen = Array.prototype.map.call(document.querySelectorAll("[data-copy]"),
      function (el) { return el.getAttribute("data-copy"); });
    if (seen.length && seen.indexOf(copyVar) === -1) {
      copyVar = (CFG.defaultCopy || "a").toLowerCase();
      if (seen.indexOf(copyVar) === -1) copyVar = seen[0];
    }
  })();

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
    // Store the brand's own display name so shared pages can render a back-link
    // without a lookup table of every brand.
    var navBrand = document.querySelector(".nav .brand");
    if (navBrand) attribution.brand_label = (navBrand.textContent || "").trim();
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

  // ---- waitlist CTAs ---------------------------------------------------
  // Phase one is email only, so these scroll to the form rather than leaving
  // for a checkout. Tracked separately from deposit_click so the two phases
  // stay comparable rather than blurring into one funnel metric.
  function wireCta() {
    document.querySelectorAll("[data-cta]").forEach(function (el) {
      el.addEventListener("click", function () {
        track("waitlist_click", { location: el.getAttribute("data-cta") || "cta" });
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
      // Sibling, not descendant, on every page. Fall back to the section so a
      // future layout change does not silently mute all feedback again.
      var status = form.querySelector("[data-form-status]") ||
                   (form.parentNode && form.parentNode.querySelector("[data-form-status]")) ||
                   (form.closest("section") && form.closest("section").querySelector("[data-form-status]"));

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
        // AJAX submit to keep the visitor on-page.
        //
        // Body is URLSearchParams, not FormData, for two reasons. FormData sends
        // multipart/form-data, and Google Apps Script does not populate
        // e.parameter from multipart bodies, so every field would arrive empty.
        // And both encodings are CORS-safelisted, so neither triggers a preflight
        // OPTIONS, which Apps Script does not answer at all.
        e.preventDefault();
        var body = new URLSearchParams();
        new FormData(form).forEach(function (v, k) { body.append(k, v); });

        function say(msg) {
          if (status) { status.textContent = msg; status.hidden = false; }
        }

        fetch(endpoint, { method: "POST", body: body, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            // Apps Script answers 200 with {ok:false} on its own failures, so the
            // HTTP status alone is not enough to claim the address was saved.
            return r.text().then(function (txt) {
              var payload = null;
              try { payload = JSON.parse(txt); } catch (err) { /* Formspree may not return JSON */ }
              if (payload && payload.ok === false) throw new Error(payload.error || "rejected");
              return true;
            });
          })
          .then(function () {
            say("Thanks. You're on the list.");
            form.reset();
          })
          .catch(function () {
            // Never claim success we cannot verify. Someone who thinks they are on
            // the list and is not will not come back a second time.
            say("That did not save. Try again, or email us and we will add you.");
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
      '<p class="eyebrow center" style="text-align:center">Where this actually is</p>' +
      '<h2 class="center">A concept, being tested honestly.</h2>' +
      '<div class="steps" style="margin-top:2.5rem">' +
        '<div class="step"><div class="step__n">1</div><h3>You join the waitlist</h3><p>No payment, no card, no commitment. You are telling us this is worth building, which is the thing we are trying to find out.</p></div>' +
        '<div class="step"><div class="step__n">2</div><h3>We show you the real one</h3><p>When there is a finished glove and a real price, you see it before anyone else, with photographs of the actual product rather than concept images.</p></div>' +
        '<div class="step"><div class="step__n">3</div><h3>Then you decide</h3><p>Only at that point does anyone ask you for anything. We expect the first gloves in ' + ship + '. If that moves, we tell you.</p></div>' +
      '</div>' +
      '<div class="promise">' +
        '<p><b>Being straight with you about the stage.</b> This is a working prototype with a filed patent, not a finished product on a shelf. The images on this page are concept renders. We are running this page to learn whether people with this specific problem want it enough to build it for them first.</p>' +
        '<p><b>Nothing is being sold here today.</b> There is no checkout, no deposit, and no card field. Joining the waitlist costs you an email address and tells us which of these problems is the one worth solving.</p>' +
        '<p><b>Honest about the risks.</b> This is real hardware. The most likely risk is a delay, because parts and manufacturing slip. We are also still doing sizing and durability testing. Because we are not taking your money, you are risking nothing while we finish the work.</p>' +
        '<p><b>Your email, plainly.</b> We use it to tell you about this product and nothing else. We do not sell it. One click unsubscribes you.</p>' +
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
        '<span><b>No payment</b> today</span>' +
        '<span>A <b>concept in development</b>, not yet shipping</span>' +
        '<span>We show you the <b>real thing first</b></span>' +
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
  // Deliberately not a roster. An object listing all nine brands here would be
  // served to every brand page, so view-source on one would expose the set.
  // The visitor's own brand is the only one this page ever needs to name, and
  // the nav already carries it.
  function originBrandLabel() {
    var el = document.querySelector(".nav .brand");
    if (!el) return "";
    return (el.textContent || "").trim();
  }

  function injectSharedFooter() {
    if (isLanding) return;
    var foot = document.querySelector(".footer");
    if (!foot) return;

    var base = CFG.legalBase || "../";
    // No hardcoded fallback address. wire.sh rewrites HTML only, so a default
    // buried in this file would survive --contact and quietly outlive it.
    var email = CFG.contactEmail || "";
    var here = CFG.brand;
    var from = attribution.brand;
    // Only offer the way back when the stored brand looks like a plain slug and
    // is not one of the shared pages. The label comes from sessionStorage, set by
    // the landing page itself, so no page needs to know any other brand's name.
    var backName = (from && /^[a-z]{3,20}$/.test(from) &&
                    SHARED_NAV.every(function (p) { return p.slug !== from; }) &&
                    from !== "thanks") ? (attribution.brand_label || from) : "";

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
    // Omit the line entirely rather than render an empty mailto:, which would
    // read as a broken promise on pages that say a real person answers.
    if (email) {
      h += '<p class="sfoot__contact">Questions? <a href="mailto:' + email + '">' +
           email + '</a>. A real person reads and answers.</p>';
    }
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
    wireCta();
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
