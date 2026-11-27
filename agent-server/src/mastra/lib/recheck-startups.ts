// Task 9: re-checks the startups in Darb's list once a month ("monthly batch; stored check valid 90 days").
// A startup that closes, or turns out not to serve Saudi Arabia, is saved as "fail", and the search (Task 2,
// search_startups_by_profile) leaves it out from then on, so it never appears as a competitor again.
//
//   1. Due: never checked (validated_at empty), or last checked more than 90 days ago. All others are skipped.
//   2. The due startups are checked 10 at a time with Task 8 (validate-candidate): their own pages are read,
//      the four checks run, and the outcome is saved with the date: pass, fail, or empty when nothing definite was
//      found (it stays in the search, but is not shown until a later check passes).
//   3. One startup failing to be read never stops the others.
import { MAX_COMPANIES_PER_RUN, validateCompanies, type CompanyResult, type ValidateDeps } from './validate-candidate';

// A stored check is valid for 90 days.
export const CHECK_VALID_DAYS = 90;

export type StartupToRecheck = {
  startup_id: string;
  startup_name: string;
  startup_name_ar: string | null;
  website: string | null;
  startup_description?: string | null;
  validated_at: string | null;
};

export function startupsDue(rows: StartupToRecheck[], now: Date, options: { ids?: string[] } = {}) {
  const chosen = options.ids?.length ? rows.filter((r) => options.ids!.includes(r.startup_id)) : rows;
  const oldest = now.getTime() - CHECK_VALID_DAYS * 86_400_000;
  const due = chosen.filter((r) => !r.validated_at || new Date(r.validated_at).getTime() < oldest);
  const skipped = chosen.filter((r) => !due.includes(r));
  return { due, skipped };
}

export type RecheckLine = { startup_id: string; name: string; evidence_status: CompanyResult['evidence_status']; saved_as: 'pass' | 'fail' | null | 'not saved'; why: string };

export async function recheckStartups(
  due: StartupToRecheck[],
  deps: ValidateDeps,
  onLine: (line: RecheckLine) => void = () => {},
  now = new Date(),
): Promise<{ lines: RecheckLine[]; tavily_calls: number }> {
  const lines: RecheckLine[] = [];
  let calls = 0;
  for (let i = 0; i < due.length; i += MAX_COMPANIES_PER_RUN) {
    const batch = due.slice(i, i + MAX_COMPANIES_PER_RUN);
    const out = await validateCompanies(
      batch.map((s) => ({ name: s.startup_name, aliases: s.startup_name_ar ? [s.startup_name_ar] : [], website: s.website, startup_id: s.startup_id, description: s.startup_description })),
      // A monthly batch is not one founder's idea, so the per-idea limit of 5 reading calls does not apply.
      { ...deps, maxCalls: Number.POSITIVE_INFINITY },
      now,
    );
    calls += out.tavily_calls;
    for (const r of out.results) {
      const outcomes = [r.real_entity, r.real_offering, r.active, r.saudi_reach];
      // A site that did not answer is not saved (validate-candidate.ts): it stays due and is tried again next run.
      const notSaved = r.notes.includes('site_not_answering');
      const saved_as = notSaved ? ('not saved' as const) : r.evidence_status !== 'unconfirmed' ? 'pass' : outcomes.includes('fail') ? 'fail' : null;
      const failed = (Object.keys(r.reasons) as (keyof typeof r.reasons)[]).filter((k) => r[k] !== 'pass');
      const line: RecheckLine = {
        startup_id: r.startup_id!,
        name: r.name,
        evidence_status: r.evidence_status,
        saved_as,
        why: failed.length ? failed.map((k) => `${k}: ${r[k]} — ${r.reasons[k]}`).join(' | ') : 'all four checks pass',
      };
      lines.push(line);
      onLine(line);
    }
  }
  return { lines, tavily_calls: calls };
}
