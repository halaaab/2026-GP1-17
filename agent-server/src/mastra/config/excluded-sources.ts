// Config: sites Darb never searches or reads, from the legal policy:
// public pages only, nothing behind a login or paywall, no site that forbids automated access, company
// facts only (never personal data).
//
// These are EXACT hostnames ("www." is ignored): excluding google.com does not exclude play.google.com.
//   linkedin.com       User Agreement forbids automated access; mostly behind a login; personal data
//   crunchbase.com     terms forbid AI use
//   dealroom.co, magnitt.com, tracxn.com, wellfound.com, producthunt.com
//                      startup databases: paywalls, logins or bot blocking
//   hungerstation.com  excluded in the domain audit
//   google.com, maps.google.com   Google search and Maps: terms forbid automated access
export const EXCLUDED_SOURCES = [
  'linkedin.com',
  'crunchbase.com',
  'dealroom.co',
  'magnitt.com',
  'tracxn.com',
  'wellfound.com',
  'producthunt.com',
  'hungerstation.com',
  'google.com',
  'maps.google.com',
];

export const isExcludedSite = (site: string) => EXCLUDED_SOURCES.includes(site.toLowerCase().replace(/^www\./, ''));

// Directories and classifieds: Saudi sites that list other businesses or people's ads, so they
// pass the four checks but do not offer the product themselves. They are never taken as companies from the web
// search. Seen: Haraj (people reselling gym subscriptions) and Bluepages (a business directory)
// came out as Confirmed gym competitors (D6). Exact hostnames, like the list above.
export const DIRECTORY_SITES = ['haraj.com.sa', 'bluepages.com.sa', 'tripadvisor.com'];

export const isDirectorySite = (site: string) => DIRECTORY_SITES.includes(site.toLowerCase().replace(/^www\./, ''));
