// Config: the websites the Competitor Agent may search, from the team's sheet
// "Darb_Competitor_Domain_List" (64 rows, 62 sites). Generated from the sheet: change the sheet, then this file.
//   status    official: government or official national programme, trusted as is
//             needs_checking: commercial, community or media source, verified before use
//   label     multiple: a page lists several companies; single: a page describes one company
//   method    extract: open the full page; snippet: use only the search snippet (paywall, login or bot
//             blocking); none: never searched or opened (terms forbid it, CAPTCHA, or not a profile source)
//   sections  only searched for ideas in these ISIC4 sections; empty means every idea

export type ApprovedDomain = {
  domain: string;
  name: string;
  category: string;
  status: 'official' | 'needs_checking';
  label: 'multiple' | 'single';
  method: 'extract' | 'snippet' | 'none';
  sections: string[];
  note?: string;
};

export const APPROVED_DOMAINS: ApprovedDomain[] = [
  { domain: "ecosystemsa.com", name: "EcosystemSA", category: "Saudi startup directory", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Source of your current 675-startup corpus; use web results to add startups not yet in it" },
  { domain: "sian.monshaat.gov.sa", name: "Monsha'at – Saudi Incubators & Accelerators Network (SIAN)", category: "Saudi startup directory", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "Has a Startups section; check if listings load without login" },
  { domain: "monshaat.gov.sa", name: "Monsha'at (main portal)", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "News pages name startups in programs and exhibitions" },
  { domain: "magnitt.com", name: "MAGNiTT", category: "Startup database (MENA)", status: 'needs_checking', label: 'single', method: 'snippet', sections: [], note: "Most data behind paywall; profile pages partly public" },
  { domain: "producthunt.com", name: "BuildSaudi / Product Hunt", category: "Saudi startup directory", status: 'needs_checking', label: 'multiple', method: 'snippet', sections: [], note: "New community directory (~140 startups); find its own site URL and replace this link Good for AI & Software ideas; blocks most crawlers" },
  { domain: "superscout.co", name: "SuperScout – Saudi Arabia", category: "Startup database (global)", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Unknown source quality; test before relying on it" },
  { domain: "sama.gov.sa", name: "SAMA – Licensed & permitted entities / SAMA – News (sandbox permits)", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: ["K"], note: "FinTech ideas: licensed and sandbox fintechs Each permit announcement names the companies" },
  { domain: "cma.org.sa", name: "Capital Market Authority (CMA) – FinTech Lab", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: ["K"], note: "Crowdfunding / investment fintechs" },
  { domain: "fintechsaudi.com", name: "Fintech Saudi", category: "Sector-specific (FinTech)", status: 'official', label: 'multiple', method: 'extract', sections: ["K"], note: "National initiative by SAMA & CMA; has an ecosystem directory" },
  { domain: "mc.gov.sa", name: "Ministry of Commerce", category: "Government / regulator", status: 'official', label: 'single', method: 'none', sections: [], note: "CR lookups have CAPTCHA; you already have the CR open data" },
  { domain: "business.sa", name: "Saudi Business Center – Business Platform", category: "Government / regulator", status: 'official', label: 'single', method: 'none', sections: [], note: "Replaced Maroof for e-store authentication (2023); lookup only" },
  { domain: "open.data.gov.sa", name: "Saudi Open Data Portal", category: "Government / regulator", status: 'official', label: 'multiple', method: 'none', sections: [], note: "Use for indicators, not competitor discovery" },
  { domain: "sdaia.gov.sa", name: "SDAIA", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: ["J"], note: "AI & Software ideas" },
  { domain: "mcit.gov.sa", name: "Ministry of Communications & IT (MCIT)", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: ["J"] },
  { domain: "cst.gov.sa", name: "Communications, Space & Technology Commission (CST)", category: "Government / regulator", status: 'official', label: 'multiple', method: 'extract', sections: ["J"], note: "Telecom, space, tech platforms" },
  { domain: "sfda.gov.sa", name: "Saudi Food & Drug Authority (SFDA)", category: "Government / regulator", status: 'official', label: 'multiple', method: 'snippet', sections: ["C", "I", "Q"], note: "F&B and health ideas; search is form-based" },
  { domain: "saudiexchange.sa", name: "Saudi Exchange (Tadawul & Nomu)", category: "Government / regulator", status: 'official', label: 'single', method: 'snippet', sections: [], note: "Mature listed competitors (e.g. Jahez); JS-heavy pages" },
  { domain: "spa.gov.sa", name: "Saudi Press Agency (SPA)", category: "Startup news & media", status: 'official', label: 'multiple', method: 'extract', sections: [] },
  { domain: "svc.com.sa", name: "Saudi Venture Capital Company (SVC)", category: "Investor / VC portfolio", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "Government-backed; mostly lists funds, follow them to startups" },
  { domain: "stv.vc", name: "STV", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "raed.vc", name: "Raed Ventures", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "sanabil.com", name: "Sanabil Investments", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "halaventures.com", name: "Hala Ventures", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "500.co", name: "500 Global", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Filter portfolio by Saudi / MENA" },
  { domain: "endeavor.org", name: "Endeavor", category: "Investor / VC portfolio", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Use the Saudi Arabia pages" },
  { domain: "flat6labs.com", name: "Flat6Labs", category: "Incubator / accelerator", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Has Riyadh programs" },
  { domain: "thegarage.sa", name: "The Garage", category: "Incubator / accelerator", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Riyadh startup hub" },
  { domain: "badir.com.sa", name: "Badir (KACST)", category: "Incubator / accelerator", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "Government technology incubator" },
  { domain: "misk.org.sa", name: "Misk Foundation", category: "Incubator / accelerator", status: 'official', label: 'multiple', method: 'extract', sections: [] },
  { domain: "innovation.kaust.edu.sa", name: "KAUST Innovation", category: "Incubator / accelerator", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "University-backed (Taqadam etc.)" },
  { domain: "ycombinator.com", name: "Y Combinator – Companies", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'extract', sections: [], note: "Very clean profiles; search with 'Saudi' or by idea" },
  { domain: "crunchbase.com", name: "Crunchbase", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'snippet', sections: [], note: "Their terms forbid scraping and AI training; use snippet only to confirm names" },
  { domain: "dealroom.co", name: "Dealroom", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'snippet', sections: [], note: "Paywall" },
  { domain: "tracxn.com", name: "Tracxn", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'snippet', sections: [], note: "Paywall; public pages give short profiles" },
  { domain: "wellfound.com", name: "Wellfound (AngelList)", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'snippet', sections: [], note: "Login-heavy" },
  { domain: "linkedin.com", name: "LinkedIn Company Pages", category: "Startup database (global)", status: 'needs_checking', label: 'single', method: 'none', sections: [], note: "Scraping is against LinkedIn's terms; confirm names only" },
  { domain: "apps.apple.com", name: "Apple App Store (Saudi)", category: "App store / marketplace", status: 'needs_checking', label: 'single', method: 'extract', sections: [], note: "Use /sa/ path for Saudi store" },
  { domain: "play.google.com", name: "Google Play", category: "App store / marketplace", status: 'needs_checking', label: 'single', method: 'extract', sections: [], note: "Add gl=SA to the link for Saudi store" },
  { domain: "apps.salla.sa", name: "Salla App Store", category: "App store / marketplace", status: 'needs_checking', label: 'multiple', method: 'extract', sections: ["G", "J"], note: "Competitors for SaaS ideas that serve online stores" },
  { domain: "apps.zid.sa", name: "Zid App Market", category: "App store / marketplace", status: 'needs_checking', label: 'multiple', method: 'extract', sections: ["G", "J"], note: "Zid is your partner; confirm link" },
  { domain: "hungerstation.com", name: "HungerStation", category: "App store / marketplace", status: 'needs_checking', label: 'multiple', method: 'snippet', sections: ["I"], note: "F&B ideas; JS-heavy pages" },
  { domain: "google.com", name: "Google Maps", category: "App store / marketplace", status: 'needs_checking', label: 'multiple', method: 'none', sections: [], note: "Google Maps is not reachable through Tavily, and allowing google.com would allow all of Google. Not reachable via Tavily; needs Google Places API (out of scope)" },
  { domain: "g2.com", name: "G2", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'snippet', sections: ["J", "M"], note: "Global SaaS competitors; blocks crawlers" },
  { domain: "capterra.com", name: "Capterra", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'snippet', sections: ["J", "M"] },
  { domain: "saashub.com", name: "SaaSHub", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'extract', sections: ["J", "M"], note: "'X alternatives' pages give many competitors at once" },
  { domain: "alternativeto.net", name: "AlternativeTo", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'snippet', sections: ["J", "M"], note: "Cloudflare may block extract" },
  { domain: "theresanaiforthat.com", name: "There's An AI For That", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'extract', sections: ["J", "M"], note: "AI & Software ideas" },
  { domain: "futurepedia.io", name: "Futurepedia", category: "Software review / alternatives", status: 'needs_checking', label: 'multiple', method: 'extract', sections: ["J", "M"] },
  { domain: "github.com", name: "GitHub", category: "Software review / alternatives", status: 'needs_checking', label: 'single', method: 'extract', sections: ["J", "M"], note: "Open-source competitors for technical ideas" },
  { domain: "wamda.com", name: "Wamda", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Main MENA startup news site" },
  { domain: "menabytes.com", name: "MENAbytes", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "menastartupdigest.com", name: "MENA Startup Digest", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "arabnews.com", name: "Arab News – Business", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "argaam.com", name: "Argaam", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Arabic + English financial news" },
  { domain: "sharikatmubasher.com", name: "Sharikat Mubasher", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "forbesmiddleeast.com", name: "Forbes Middle East", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Annual top-startup lists" },
  { domain: "entrepreneur.com", name: "Entrepreneur Middle East", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "enterpriseam.com", name: "Enterprise AM – KSA", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "saudigazette.com.sa", name: "Saudi Gazette", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [] },
  { domain: "aitnews.com", name: "Aitnews (البوابة العربية للأخبار التقنية)", category: "Startup news & media", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Arabic queries" },
  { domain: "biban.com.sa", name: "Biban (Monsha'at)", category: "Events & exhibitions", status: 'official', label: 'multiple', method: 'extract', sections: [], note: "Annual Monsha'at entrepreneurship forum; confirm link" },
  { domain: "onegiantleap.com", name: "LEAP", category: "Events & exhibitions", status: 'needs_checking', label: 'multiple', method: 'extract', sections: [], note: "Tech conference startup zone" },
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
