// Consent Mode v2 defaults. Loaded before the Google tag on every page of the marketing site.
// The CMP calls gtag('consent', 'update', ...) when the visitor chooses.
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

// EEA, UK and Switzerland: everything denied until the banner choice.
gtag('consent', 'default', {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500,
  region: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE',
    'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'GB', 'CH',
  ],
});

// Rest of the world: analytics granted, ads still need a choice.
gtag('consent', 'default', {
  ad_storage: 'denied',
  analytics_storage: 'granted',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
});

// Strip ad click ids from URLs when ad_storage is denied.
gtag('set', 'url_passthrough', false);
gtag('set', 'ads_data_redaction', true);

// Send hits to the first-party server container instead of Google's endpoints.
gtag('js', new Date());
gtag('config', 'G-XXXXXXXXXX', { server_container_url: 'https://collect.tallymoor.example' });

// Called by the CMP callback (example mapping of CMP categories to consent types).
window.tallymoorConsentUpdate = function (choice) {
  gtag('consent', 'update', {
    analytics_storage: choice.statistics ? 'granted' : 'denied',
    ad_storage: choice.marketing ? 'granted' : 'denied',
    ad_user_data: choice.marketing ? 'granted' : 'denied',
    ad_personalization: choice.marketing ? 'granted' : 'denied',
  });
};
