// Task 1: turns each startup's description into a structured profile and an embedding (its vector of meaning).
// Logic;.
//
//   1. The model reads the startup's English description only (no name, sector or tags).
// 2. It writes the profile with the same prompt as a founder's idea (lib/idea-profile.ts, the file,
//      used unchanged), so a startup and an idea are described the same way and compared fairly.
//   3. Code checks the profile has at least one English and one Arabic keyword (TC-1.4): one more try,
//      then the startup is reported as failed and nothing is saved for it.
//   4. profile_text (readable) and its embedding are saved. The description itself is never changed.
//   5. A startup that already has a profile is skipped, unless named on purpose (TC-1.6).
import type { IdeaProfile } from '../schemas/competitor';

export type StartupToProfile = { startup_id: string; startup_description: string | null };

export type ProfileResult =
  | { startup_id: string; status: 'saved'; profile_text: string; tries: number }
  | { startup_id: string; status: 'failed'; reason: string };

// What this step needs from the outside world. The script passes OpenAI and Supabase; tests pass fakes.
export type ProfileDeps = {
  buildProfile: (text: string) => Promise<IdeaProfile>;
  toText: (profile: IdeaProfile) => string;
  embed: (text: string) => Promise<number[]>;
  save: (startupId: string, row: { profile_text: string; embedding: number[] }) => Promise<void>;
};

// TC-1.4: at least one keyword in each language.
export function hasBothLanguages(profile: IdeaProfile): boolean {
  return profile.keywords_en.some((k) => k.trim()) && profile.keywords_ar.some((k) => /[؀-ۿ]/.test(k));
}

export const MAX_TRIES = 2;

export async function profileStartup(startup: StartupToProfile, deps: ProfileDeps): Promise<ProfileResult> {
  const description = startup.startup_description?.trim();
  if (!description) return { startup_id: startup.startup_id, status: 'failed', reason: 'no description' };

  let lastProblem = '';
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    try {
      const profile = await deps.buildProfile(description);
      if (!hasBothLanguages(profile)) {
        lastProblem = 'the profile has no English or no Arabic keyword';
        continue;
      }
      const profile_text = deps.toText(profile);
      const embedding = await deps.embed(profile_text);
      await deps.save(startup.startup_id, { profile_text, embedding });
      return { startup_id: startup.startup_id, status: 'saved', profile_text, tries };
    } catch (error) {
      lastProblem = (error as Error).message;
    }
  }
  return { startup_id: startup.startup_id, status: 'failed', reason: lastProblem };
}

// TC-1.6: which startups still need a profile. Named startups (--ids) are always redone on purpose.
export function startupsToDo<T extends StartupToProfile & { profile_text: string | null }>(
  startups: T[],
  options: { ids?: string[]; force?: boolean } = {},
): { todo: T[]; skipped: T[] } {
  const named = options.ids?.length ? new Set(options.ids) : null;
  const todo: T[] = [];
  const skipped: T[] = [];
  for (const s of startups) {
    if (named && !named.has(s.startup_id)) continue;
    if (named || options.force || !s.profile_text) todo.push(s);
    else skipped.push(s);
  }
  return { todo, skipped };
}

// Runs several startups at the same time (OpenAI allows it), keeping results in order.
export async function profileAll(startups: StartupToProfile[], deps: ProfileDeps, parallel = 6, onDone?: (r: ProfileResult) => void) {
  const results: ProfileResult[] = new Array(startups.length);
  let next = 0;
  const worker = async () => {
    while (next < startups.length) {
      const i = next++;
      results[i] = await profileStartup(startups[i], deps);
      onDone?.(results[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, startups.length) }, worker));
  return results;
}
