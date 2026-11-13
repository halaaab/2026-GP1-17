// Config: sites Darb never reads, from the Member 1 test plan (Task 4, "Already excluded") and the
// legal policy in the design (§5): public pages only, nothing behind a login, no site that forbids
// automated access, company facts only (never personal data).
//
//   linkedin.com     its User Agreement forbids automated access; mostly behind a login; personal data
//   crunchbase.com   its terms forbid AI use
//   google.com       Google Maps and search pages: terms forbid automated access
//   hungerstation.com, dealroom.co   excluded in the domain audit
export const EXCLUDED_SOURCES = ['linkedin.com', 'crunchbase.com', 'google.com', 'hungerstation.com', 'dealroom.co'];

export const isExcludedSite = (site: string) => EXCLUDED_SOURCES.some((d) => site === d || site.endsWith(`.${d}`));
