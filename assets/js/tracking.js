/**
 * Site Tracking
 * Google Ads conversion tracking, GA4 events, phone click tracking.
 */

(function () {
  var GA_CONVERSION_ID = '{{integrations.google_ads_conversion_id}}';
  var GA_CONVERSION_LABEL = '{{integrations.google_ads_conversion_label}}';
  var GA_ID = '{{integrations.google_analytics_id}}';

  // ── Google Ads Conversion ──
  window.fireGoogleAdsConversion = function () {
    if (typeof gtag !== 'undefined' && GA_CONVERSION_ID && GA_CONVERSION_ID !== 'AW-PLACEHOLDER') {
      gtag('event', 'conversion', {
        'send_to': GA_CONVERSION_ID + '/' + GA_CONVERSION_LABEL
      });
    }
  };

  // ── GA4 Event Helper ──
  window.fireGA4Event = function (eventName, params) {
    if (typeof gtag !== 'undefined' && GA_ID && GA_ID !== 'G-PLACEHOLDER') {
      gtag('event', eventName, params || {});
    }
  };

  // ── Track Phone Clicks ──
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="tel:"]');
    if (link) {
      window.fireGA4Event('phone_click', {
        event_category: 'engagement',
        event_label: link.href,
        page_url: window.location.href
      });
    }
  });

  // ── Track CTA Clicks ──
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-primary, .header-cta, .mm-book');
    if (btn) {
      window.fireGA4Event('cta_click', {
        event_category: 'engagement',
        event_label: btn.textContent.trim(),
        page_url: window.location.href
      });
    }
  });
})();
