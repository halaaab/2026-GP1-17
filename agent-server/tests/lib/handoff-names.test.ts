// Tests for the handoff's name lists: "like Mrsool" must exclude Mrsool.
import { describe, expect, it } from 'vitest';
import { analogiesIn, referenceName, withNamesCleaned } from '../../src/mastra/lib/competitor-delegation';

describe('referenceName', () => {
  it('removes analogy words in English and Arabic', () => {
    expect(referenceName('like Mrsool')).toBe('Mrsool');
    expect(referenceName('similar to Talabat')).toBe('Talabat');
    expect(referenceName('مثل طلبات')).toBe('طلبات');
    expect(referenceName('زي جاهز')).toBe('جاهز');
    expect(referenceName('Mrsool')).toBe('Mrsool');
    // a name that only starts like an analogy word is never cut
    expect(referenceName('Asdaf')).toBe('Asdaf');
    expect(referenceName('كريم')).toBe('كريم');
    expect(referenceName('Likewise')).toBe('Likewise');
  });
});

describe('withNamesCleaned', () => {
  it('turns a single name into a list, cleans references, and never checks an analogy as a named competitor', () => {
    expect(withNamesCleaned({ mode: 'new', named_competitors: 'Mrsool', references: 'like Mrsool' })).toEqual({ mode: 'new', references: ['Mrsool'] });
    expect(withNamesCleaned({ named_competitors: ['Careem', 'Uber'], references: ['like Talabat'] })).toEqual({ named_competitors: ['Careem', 'Uber'], references: ['Talabat'] });
  });

  it("takes the analogy from the founder's own words, even when the model leaves it out (K3 re-runs)", () => {
    const said = 'My startup is Nana. We deliver groceries to homes in Riyadh within an hour, like Mrsool but only for groceries.';
    // the model rewrote the idea without "like Mrsool" and listed Mrsool only as a named competitor
    expect(withNamesCleaned({ idea_text: 'Deliver groceries to homes in Riyadh within an hour.', named_competitors: ['Mrsool'] }, said))
      .toEqual({ idea_text: 'Deliver groceries to homes in Riyadh within an hour.', references: ['Mrsool'] });
    expect(analogiesIn('تطبيق مثل طلبات بس للصيدليات')).toEqual(['طلبات']);
    expect(analogiesIn('Like Talabat, but for pharmacies')).toEqual(['Talabat']);
    // a founder naming competitors without an analogy word: nothing changes
    expect(withNamesCleaned({ named_competitors: ['Careem'] }, 'I think my competitors are Careem and Uber')).toEqual({ named_competitors: ['Careem'] });
  });
});
