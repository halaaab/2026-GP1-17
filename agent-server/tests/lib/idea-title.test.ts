// Tests for the conversation's formal name: only a short, clean name is used.
import { describe, expect, it } from 'vitest';
import { cleanPart, cleanTitle } from '../../src/mastra/lib/idea-title';

describe('cleanTitle', () => {
  it('keeps one short line without quotes or a full stop', () => {
    expect(cleanTitle('"بنك رقمي للتسوق الإلكتروني".')).toBe('بنك رقمي للتسوق الإلكتروني');
    expect(cleanTitle('Commercial law firm in Riyadh\nextra line')).toBe('Commercial law firm in Riyadh');
  });
  it('drops an empty or too long answer, so the founder’s first words stay', () => {
    expect(cleanTitle('  ')).toBeNull();
    expect(cleanTitle('x'.repeat(61))).toBeNull();
  });
});

describe('cleanPart', () => {
  it('keeps one short line, and drops an empty or too long part', () => {
    expect(cleanPart('  توصيل الطعام   إلى المنازل ')).toBe('توصيل الطعام إلى المنازل');
    expect(cleanPart('')).toBeNull();
    expect(cleanPart('x'.repeat(201))).toBeNull();
  });
});
