# Darb Competitor Agent: Source and Legal Policy (Member 1, Task 10)

Version: 15 Nov 2026. Covers what the Competitor Agent reads, what it stores, what it never uses, and the limits it
keeps. Design: Darb_Competitor_Agent_Design, Version 4, §5 (discovery and source policy), §7, §8, §12.

## 1. What Darb reads

| Source | What is read | How | Used for |
|---|---|---|---|
| Darb's startup list (EcosystemSA, 513 startups) | Name, description, website, EcosystemSA profile link | Supabase `startups` table | Finding similar startups (Task 2) |
| Ministry of Commerce open data, 2026 Q3 active commercial registrations | CR numbers (1,905,704 unified, 1,455,420 old), plus fingerprints of company names (412,695; companies only, main registrations only, never sole proprietorships or branches) and their city | Prepared files, held in server memory; no database table; no name is ever stored, only its hash | Checking a CR number or a legal name found on a company's own pages (Tasks 3 and 8) |
| The open web, through Tavily Search | Page titles, links and short snippets | Up to 10 searches per idea, country Saudi Arabia | Finding companies outside Darb's list (Task 5) |
| Companies' own pages, read directly by Darb's server (first) | Homepage, Arabic page (`/ar`), About page, and a VAT or CR certificate linked on the site (PDF), as visible text | Free; only when the site's robots.txt allows it; one request per page (two if the site does not answer) | The four validity checks (Task 8). The same page gives the same text every run, so the same company gets the same result. Never saved |
| Companies' own pages, through Tavily Extract (backup) | Only the pages Darb could not read itself: blocked, a site built by JavaScript with almost no text, or a certificate that could not be downloaded; the App Store or Google Play page only when the site could not be read at all | Up to 5 reading calls per idea | The four validity checks (Tasks 6 and 8) |
| Apple's public app lookup (itunes.apple.com/lookup, Saudi store) and Google Play app pages | Whether the app is listed, its last update date, and its description and release notes | Free; Google Play's robots.txt allows app pages | Real offering (the app can be downloaded now), Active (its last update), and the app's own text, read like a page (Task 8) |

Rules for every web page:
- Only public pages: nothing behind a login or a paywall.
- No site whose terms forbid automated access (section 3).
- Only company facts. A company email or phone number is checked in the page and never stored. No personal data is collected.
- Page text is used during the run only and never saved (Tavily terms; design §5).

## 2. What Darb stores

| Where | What | Why |
|---|---|---|
| `startups.validation_status`, `startups.validated_at` | `pass`, `fail` or empty, and the date of the check | The monthly re-check (Task 9). A startup that fails is left out of the search |
| `startup_ideas.profile_text`, `startup_ideas.embedding` | The idea's structured profile (Darb's own words) and its vector | The same idea gives the same result (design §4, §12) |
| `similar_startup_results` (saved by Member 2's part) | Name, link, label, Darb's own one-line description and reason, dates, source links | The result screen |
| Server log, one line per run | IDs, codes, counts and timings only | Observability (design §12). Never the founder's idea text |

Never stored: page text, search snippets, any name from the CR file (only a one-way fingerprint), owners, capital, and the founder's own sentence in any query.

## 3. Sites never used (`config/excluded-sources.ts`)

These are exact hostnames: `google.com` is excluded, but `play.google.com` is not.

| Site | Reason |
|---|---|
| linkedin.com | The User Agreement forbids automated access. Mostly behind a login. Personal data |
| crunchbase.com | The terms forbid use for AI |
| dealroom.co, magnitt.com, tracxn.com, wellfound.com, producthunt.com | Startup databases: paywalls, logins or bot blocking |
| hungerstation.com | Excluded in the domain audit (Hala to add the exact reason) |
| google.com, maps.google.com | The terms of Google Search and Maps forbid automated access |

The list is applied twice: Tavily is told never to search these sites, and code removes any link to them again before a page is read (TC-6.5, TC-10.5).

**Directories and classifieds** (`DIRECTORY_SITES`, 16 Nov 2026): haraj.com.sa, bluepages.com.sa and tripadvisor.com list other businesses or people's ads. They are allowed sites, but they do not offer the product themselves, so they are never taken as companies from the web search. In the D6 run, Haraj (people reselling their gym subscriptions) and Bluepages (a business directory) passed the four checks and came out as Confirmed gym competitors.

## 4. Preferred Saudi sources (boosted, not required)

ecosystemsa.com, startupblink.com, apps.apple.com, play.google.com, apps.salla.sa, apps.zid.sa,
sian.monshaat.gov.sa, fintechsaudi.sa.

These are Saudi startup directories, the app stores and government startup programmes. They are listed first in results, but other sites are not shut out. The earlier list of "approved domains" was removed on 14 Nov 2026, in favour of one open, Saudi-focused mode with the exclusion list above.

## 5. Idea privacy

- The AI writes the search queries from the idea's profile only. It never sees the founder's own sentence.
- Code drops a query that is longer than 8 words, or that shares 5 or more words in a row with the founder's sentence (TC-5.3, TC-10.1).
- The run log never contains the idea text.

## 6. Limits per idea

- At most 15 Tavily calls, searching and reading together: 10 for searching, 5 for reading (TC-10.2, TC-11.5). The step that finds competitors (Task 11) counts calls across every step and stops before 15.
- At most 25 companies passed to the judge: the 15 closest from Darb's list plus up to 10 new ones from the web.
- The monthly re-check is not one founder's idea, so it is not bound by the 15 calls. It reads about 3 pages per 10 startups.
- When a site gives almost no text (under 500 characters, usually a site built by JavaScript), the result carries the note `page_mostly_empty`. In the monthly re-check only, Darb makes one Tavily news search on the company's name (last 12 months) whenever no date was found (Active unknown, for example a thin site, or a footer whose year is added by JavaScript, as on Aajil's site), or when Active fails only because of an old copyright year. A news item counts only when its title names the company and it is about Saudi Arabia.

## 7. Decisions that differ from the design document (to update design §5, §7, §8)

1. **Confirmed** only through the Ministry of Commerce list: a CR number on the company's own pages that matches, or the legal name on its own pages (VAT certificate, footer) that is exactly one active company once Arabic spelling differences are cleaned, and whose city is not contradicted by the company's own address (head office on its VAT certificate, or an address on its pages). A city the company only mentions is where it serves, never a conflict (1pass is registered in Jeddah and lists gyms in Riyadh). Names shared by two or more companies never count. The "two independent sources" route is not used (Hala, 14 Nov 2026). A VAT certificate linked on a site is read, never trusted by its link name.
2. **Active** uses every date that can help: an App Store or Google Play update, news articles naming the company, dated content on its own site, and the copyright year. The copyright year counts only together with a working offering, because many sites update it by themselves (Hala, 14 Nov 2026). The design said "copyright year alone does not count", and that still holds: on its own, it is never enough. A founding year ("founded in 2022", "سنة التأسيس") is never a date of activity. With a current copyright year, older dates make Active unknown, never fail: a current copyright year is not proof of activity, but it is not a sign of being closed either.
3. **Web search rule, until the judge is connected:** the web is searched when Darb's list gives fewer than 3 valid startups with a closeness of at least 0.75. The design says "web only when the corpus results are weak". Once the judge exists, "weak" will mean fewer than 3 valid competitors or none Direct. **Startups from Darb's list less close than 0.55 are not checked or passed on (16 Nov 2026):** N1 (falcon photography) checked Unifonic, SDM and ZORY at 0.40 to 0.45 and took 283 s; in the Task 10 and 11 runs every relevant startup was above 0.55 (1pass 0.80, OTO 0.79, Supermile 0.63, Bayut and 5050 0.87).
5. **Same product:** for a startup from Darb's list, the AI compares its description in the list with what its website sells. A site that clearly sells something else (another business with the same name) fails Real entity, with the note `different_company` (abwaab.sa belongs to "شركة موقع ابواب", a used-goods marketplace, not the e-learning app Abwaab). The design's "the name matches" is not enough on its own.
6. An app store page's copyright line belongs to the store (Apple), never to the company; the app's own update date counts instead. A "Saudi address" from the AI needs a city, district, street, building or postal code, not just a company name or "in Saudi Arabia".
7. **Site down:** a website whose domain is not found, or that gives a server error (such as Cloudflare's 530) twice, and that Tavily could not read either, fails Active ("its website no longer works"), unless a recent app update or news shows activity (Shgardi). **A site that does not answer in time, or refuses the connection, twice is not down (15 and 16 Nov 2026):** Active stays unknown and nothing is saved, so its old status stays and the next check tries again. Dinar did not answer once and loaded normally two minutes later; before this rule, that one slow moment saved it as fail for 90 days.
8. **Old copyright only:** when Active fails only because of an old copyright year, the result is saved with no status, unless a news search found nothing recent. Only the monthly re-check makes that search, so only it can remove a startup for this reason (Dinar's footer still says © 2024, but its app was updated in November 2026).
9. **Darb reads the company's pages itself first (15 Nov 2026).** Tavily's reads changed from run to run: 1pass's VAT certificate was read at 19:00 and failed at 21:04, so the same company was Confirmed, then Unconfirmed. Darb's server now downloads the homepage, the Arabic page, the About page and a linked certificate (PDF) itself, and Tavily reads only what it could not get. In a test of 14 companies, 3 runs each, every company got the same result all 3 times, and the reading used 24 Tavily calls for 42 checks.
10. **A server's error page is not the company's page** (Shgardi: Cloudflare's "Origin DNS error" page). **A Saudi address must name a Saudi city or Saudi Arabia** (Yourparts' Cairo office was given as one). **One quote counts for one signal of a check** (Aajil's price was also given as a review).
11. **The legal name must be the company's own (15 Nov 2026).** A "شركة …" name counts only next to legal words (©, جميع الحقوق محفوظة, السجل التجاري, الرقم الضريبي, a certificate, "registered", "trademark of", علامة تجارية لـ). Aajil's homepage names a customer, "شركة منصات الطاقة للمقاولات العامة", in a testimonial, which matched one active company and wrongly made Aajil Confirmed. **A Saudi address must be an address** (district, street, building or postal code); a city alone ("Jeddah, Saudi Arabia") only counts as "Saudi city mentioned", a weak signal. The Arabic address words count only as whole words: "حي" was found inside "الحين" in Aajil's slogan. **JavaScript sites** (Aajil) are opened in a real browser on Darb's server (Playwright, Chromium), only when the plain read gets almost no text; robots.txt is respected, and Darb's honest robot name is kept (Bayut blocks it, and that is not worked around). **The AI reads each page on its own**: given 4 long pages at once, the small model missed what it found on one.
12. **The App Store seller name counts for Real entity (15 Nov 2026).** For a company's developer account, Apple shows the legal entity's name as the seller, after checking the company's identity and legal status through its D-U-N-S number (Dun & Bradstreet). It accepts no trade names, DBAs or branches, and a one-person account can only show the person's own name ([Apple: enrollment](https://developer.apple.com/support/enrollment/), [Apple: D-U-N-S](https://developer.apple.com/support/D-U-N-S/)). So the seller name is evidence that a legal company stands behind the app. It counts only when (1) the app is the company's own (linked on its site, or saved for it in Darb's list), (2) the seller is a company, not a person (a word such as LLC, Ltd, Co., Company, SPC, Est. or شركة), and (3) it contains the company's name (an agency that published a client's app does not count). It is not the Ministry of Commerce list, so it never makes a company Confirmed, and a word like "ALSAUDIAH" in the name is not Saudi presence. Bayut's site blocks Darb's robot; its seller is "BAYUT WEB ALSAUDIAH FOR TECHNOLOGY COMMUNICATION SPC". Google Play is not used for this yet.
4. A stored check is valid for 90 days. A check that finds nothing definite (for example, the site could not be read) is saved with no status. The startup stays in the search but is not shown, and it is checked again after 90 days.

## 8. Written confirmation from Tavily (TC-10.6)

Draft email to Tavily support. Hala sends it and saves the answer for the report appendix:

> Subject: Permission to store short descriptions derived from Tavily results
>
> Hello, we are a university graduation project (King Saud University) building a startup-analysis assistant for
> founders in Saudi Arabia. We use Tavily Search and Extract to find companies and check that they are active.
> We do not store page text or snippets. We store only: the company's name, its link, and a one-line description
> written by our own system, plus the date we checked it. Could you confirm in writing that this use is allowed
> under your terms of service? Thank you.

## 9. Datasets used (full Dataset Descriptions are in the data design document)

- EcosystemSA startup list (Darb's list): already described.
- Ministry of Commerce 2026 Q3 active commercial registrations: the Dataset Description is still to be written (source, date, columns used, size, licence, refresh: quarterly).

## 10. How each check is tested (Task 10)

| Case | How |
|---|---|
| TC-10.1 | In 3 Competitor Agent traces (D1, D3, D6), open `find_competitors` and read `web.queries`: none contains the founder's sentence |
| TC-10.2 | In the same traces, `tavily_calls` is 15 or fewer |
| TC-10.3 | Open 5 rows of `similar_startup_results`: only Darb's outputs, no page text. This needs Member 2's saving step |
| TC-10.4 | Search the stored descriptions for names, phone numbers and emails (SQL in the test cases): none found |
| TC-10.5 | TC-6.5: a LinkedIn link is skipped as `excluded_source` |
| TC-10.6 | Send the email in section 8 and save the answer |
