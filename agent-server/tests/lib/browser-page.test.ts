// Tests for the real-browser page reader when the browser cannot start.
// On Render, Chromium was missing: opening it failed, and the timer that closes the browser after a minute
// failed again with no handler, which stopped the whole server (502 for every founder until it restarted).
// Here Playwright is a fake whose browser never starts: nothing is downloaded or opened.
import { afterEach, describe, expect, it, vi } from 'vitest';

let launches = 0;
vi.mock('playwright', () => ({
  chromium: {
    launch: async () => {
      launches += 1;
      throw new Error("browserType.launch: Executable doesn't exist");
    },
  },
}));
vi.mock('../../src/mastra/lib/raw-page', () => ({ robotsAllowUrl: async () => true, htmlToText: (html: string) => html }));

const { readWithBrowser, closeBrowser } = await import('../../src/mastra/lib/browser-page');

afterEach(() => vi.useRealTimers());

describe('readWithBrowser without a browser', () => {
  it('skips the page, tries to start the browser only once, and never stops the server', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // only the close timer
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const first = await readWithBrowser('https://aajil.sa/');
      const second = await readWithBrowser('https://aajil.sa/en');
      expect(first).toMatchObject({ status: 'skipped', reason: expect.stringContaining('browser') });
      expect(second.status).toBe('skipped');
      expect(launches).toBe(1); // not one failed start per page

      // The minute without use passes: the close timer runs. Before the fix, its error had no handler.
      await vi.advanceTimersByTimeAsync(61_000);
      await closeBrowser();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
