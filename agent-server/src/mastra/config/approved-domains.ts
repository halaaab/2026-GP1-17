// Config: the websites the Competitor Agent may search. This file is the list: change it here.
//   domain    the site Tavily may search; results from any other site are dropped
//   name      the site's name, for people reading this file
//   method    extract: open the full page; snippet: use only the search snippet (paywall, login,
//             bot blocking or terms); none: never searched or opened
//   sections  ISIC4 section letters (the founder's sector) this site is searched for; empty means every idea

export type ApprovedDomain = {
  domain: string;
  name: string;
  method: 'extract' | 'snippet' | 'none';
  sections: string[];
};

export const APPROVED_DOMAINS: ApprovedDomain[] = [
  // Saudi startup directory
  { domain: "ecosystemsa.com", name: "EcosystemSA", method: 'snippet', sections: [] },
  { domain: "sian.monshaat.gov.sa", name: "Monsha'at – Saudi Incubators & Accelerators Network (SIAN)", method: 'snippet', sections: [] },

  // Startup database (MENA)
  // Most data is behind a paywall.
  { domain: "magnitt.com", name: "MAGNiTT", method: 'snippet', sections: [] },

  // Startup database (global)
  // Blocks most crawlers.
  { domain: "producthunt.com", name: "Product Hunt", method: 'snippet', sections: [] },
  { domain: "ycombinator.com", name: "Y Combinator – Companies", method: 'snippet', sections: [] },
  // Its terms forbid scraping and AI training, so only the snippet, to confirm names.
  { domain: "crunchbase.com", name: "Crunchbase", method: 'snippet', sections: [] },
  { domain: "dealroom.co", name: "Dealroom", method: 'extract', sections: [] },
  { domain: "tracxn.com", name: "Tracxn", method: 'extract', sections: [] },
  { domain: "wellfound.com", name: "Wellfound (AngelList)", method: 'extract', sections: [] },
  // Scraping is against LinkedIn's terms.
  { domain: "linkedin.com", name: "LinkedIn Company Pages", method: 'none', sections: [] },
  { domain: "startup.google.com", name: "Google for Startups – Alumni Directory", method: 'extract', sections: [] },

  // Government / regulator
  { domain: "monshaat.gov.sa", name: "Monsha'at (main portal)", method: 'snippet', sections: [] },
  { domain: "sama.gov.sa", name: "SAMA – Licensed & permitted entities / SAMA – News (sandbox permits)", method: 'extract', sections: ["K"] },
  { domain: "cma.gov.sa", name: "Capital Market Authority (CMA) – FinTech Lab", method: 'extract', sections: ["K"] },
  { domain: "sdaia.gov.sa", name: "SDAIA", method: 'snippet', sections: ["J"] },
  { domain: "mcit.gov.sa", name: "Ministry of Communications & IT (MCIT)", method: 'extract', sections: ["J"] },
  { domain: "cst.gov.sa", name: "Communications, Space & Technology Commission (CST)", method: 'extract', sections: ["J"] },
  { domain: "sfda.gov.sa", name: "Saudi Food & Drug Authority (SFDA)", method: 'extract', sections: ["C", "I", "Q"] },
  { domain: "saudiexchange.sa", name: "Saudi Exchange (Tadawul & Nomu)", method: 'extract', sections: [] },

  // Sector-specific (FinTech)
  { domain: "fintechsaudi.sa", name: "Fintech Saudi", method: 'extract', sections: ["K"] },

  // Investor / VC portfolio
  { domain: "svc.com.sa", name: "Saudi Venture Capital Company (SVC)", method: 'extract', sections: [] },
  { domain: "stv.vc", name: "STV", method: 'extract', sections: [] },
  { domain: "raed.vc", name: "Raed Ventures", method: 'extract', sections: [] },
  { domain: "sanabil.com", name: "Sanabil Investments", method: 'snippet', sections: [] },
  { domain: "halaventures.com", name: "Hala Ventures", method: 'snippet', sections: [] },
  { domain: "500.co", name: "500 Global", method: 'extract', sections: [] },
  { domain: "endeavor.org", name: "Endeavor", method: 'extract', sections: [] },

  // Incubator / accelerator
  { domain: "flat6labs.com", name: "Flat6Labs", method: 'extract', sections: [] },
  { domain: "thegarage.sa", name: "The Garage", method: 'snippet', sections: [] },
  { domain: "misk.org.sa", name: "Misk Foundation", method: 'extract', sections: [] },
  { domain: "kaust.edu.sa", name: "KAUST Innovation", method: 'extract', sections: [] },

  // App store / marketplace
  { domain: "apps.apple.com", name: "Apple App Store (Saudi)", method: 'extract', sections: [] },
  { domain: "play.google.com", name: "Google Play", method: 'extract', sections: [] },
  { domain: "apps.salla.sa", name: "Salla App Store", method: 'snippet', sections: ["G", "J"] },
  { domain: "apps.zid.sa", name: "Zid App Market", method: 'snippet', sections: ["G", "J"] },
  { domain: "hungerstation.com", name: "HungerStation", method: 'extract', sections: ["I"] },
  // Not reachable through Tavily, and allowing google.com would allow all of Google.
  { domain: "google.com", name: "Google Maps", method: 'none', sections: [] },

  // Software review / alternatives
  // Blocks crawlers.
  { domain: "g2.com", name: "G2", method: 'snippet', sections: ["J", "M"] },
  { domain: "capterra.com", name: "Capterra", method: 'extract', sections: ["J", "M"] },
  { domain: "saashub.com", name: "SaaSHub", method: 'extract', sections: ["J", "M"] },
  // Cloudflare blocks extraction.
  { domain: "alternativeto.net", name: "AlternativeTo", method: 'snippet', sections: ["J", "M"] },
  { domain: "theresanaiforthat.com", name: "There's An AI For That", method: 'extract', sections: ["J", "M"] },
  { domain: "futurepedia.io", name: "Futurepedia", method: 'extract', sections: ["J", "M"] },

  // Startup news & media
  { domain: "spa.gov.sa", name: "Saudi Press Agency (SPA)", method: 'extract', sections: [] },
  { domain: "wamda.com", name: "Wamda", method: 'extract', sections: [] },
  { domain: "menabytes.com", name: "MENAbytes", method: 'extract', sections: [] },
  { domain: "menastartupdigest.com", name: "MENA Startup Digest", method: 'extract', sections: [] },
  { domain: "arabnews.com", name: "Arab News – Business", method: 'extract', sections: [] },
  { domain: "argaam.com", name: "Argaam", method: 'extract', sections: [] },
  { domain: "sharikatmubasher.com", name: "Sharikat Mubasher", method: 'extract', sections: [] },
  { domain: "forbesmiddleeast.com", name: "Forbes Middle East", method: 'extract', sections: [] },
  { domain: "entrepreneur.com", name: "Entrepreneur Middle East", method: 'extract', sections: [] },
  { domain: "enterpriseam.com", name: "Enterprise AM – KSA", method: 'extract', sections: [] },
  { domain: "saudigazette.com.sa", name: "Saudi Gazette", method: 'extract', sections: [] },
  { domain: "aitnews.com", name: "Aitnews (البوابة العربية للأخبار التقنية)", method: 'extract', sections: [] },

  // Events & exhibitions
  { domain: "biban.com.sa", name: "Biban (Monsha'at)", method: 'extract', sections: [] },
  { domain: "onegiantleap.com", name: "LEAP", method: 'extract', sections: [] },
];

// The sites web_search may use for an idea in this ISIC4 section: every searchable site for all ideas,
// plus the sector-specific ones for that section. Sites with method 'none' are never included.
export function domainsForSection(section: string | null | undefined): ApprovedDomain[] {
  return APPROVED_DOMAINS.filter((d) => d.method !== 'none' && (d.sections.length === 0 || (!!section && d.sections.includes(section))));
}

// The approved site a web address belongs to: the exact domain or a real subdomain of it,
// so a lookalike such as wamda.com.evil.io is never accepted.
export function approvedDomainOf(url: string): ApprovedDomain | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  const matches = APPROVED_DOMAINS.filter((d) => d.method !== 'none' && (host === d.domain || host.endsWith(`.${d.domain}`)));
  // The most specific match wins (sian.monshaat.gov.sa over monshaat.gov.sa).
  return matches.sort((a, b) => b.domain.length - a.domain.length)[0] ?? null;
}
