// What Darb is doing right now, for the founder's screen (Hala, 18 Nov 2026): "Understanding your idea…",
// "Checking the companies…". Each step of the Competitor Agent reports here when it really starts, and the website's
// chat route (server/chat-route.ts) passes it on to that founder's open conversation. Nothing is saved.
export const PROGRESS_STEPS = ['understanding', 'searching_list', 'checking_companies', 'searching_web', 'comparing', 'finishing'] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

// One listener per conversation (assessment), while its chat request is open.
const listeners = new Map<string, (step: ProgressStep) => void>();

// Called by the chat route: returns the function that stops listening.
export function listenToProgress(assessmentId: string, listener: (step: ProgressStep) => void): () => void {
  listeners.set(assessmentId, listener);
  return () => {
    if (listeners.get(assessmentId) === listener) listeners.delete(assessmentId);
  };
}

// Called by the steps. Nobody listening (Studio, a script, a closed page): nothing happens.
export function reportProgress(assessmentId: string | null | undefined, step: ProgressStep): void {
  if (!assessmentId) return;
  try {
    listeners.get(assessmentId)?.(step);
  } catch {
    // the founder's screen is never a reason for the analysis to fail
  }
}
