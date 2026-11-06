// The comparison matrix: the founder's idea side by side with each competitor, field by field.
// Built in code from stored data only, so no cell can be invented by a model. A missing value stays null,
// and the agent or the website shows it as "not in Darb's data".
import { z } from 'zod';
import { ISIC_DIVISIONS } from '../config/isic-divisions';
import { ISIC_SECTIONS, isIsicSection } from '../config/sectors';
import type { Competitor } from '../contracts';
import { getSupabase } from './supabase';

const Cell = z.string().nullable();

export const ComparisonMatrix = z.object({
  columns: z.array(z.object({ key: z.string(), name: z.string(), name_ar: z.string().nullable() })),
  rows: z.array(
    z.object({
      field: z.enum(['what_it_does', 'activity', 'target_market', 'region', 'stage', 'similarity', 'website']),
      label: z.object({ en: z.string(), ar: z.string() }),
      values: z.record(z.string(), Cell), // column key → value
    }),
  ),
});
export type ComparisonMatrix = z.infer<typeof ComparisonMatrix>;

export type FounderInputs = { idea_text: string; sector: string; sub_sector: string; region: string };

const LABELS = {
  what_it_does: { en: 'What it does', ar: 'ماذا يقدّم' },
  activity: { en: 'Activity (ISIC4)', ar: 'النشاط (ISIC4)' },
  target_market: { en: 'Target market', ar: 'السوق المستهدف' },
  region: { en: 'Region', ar: 'المنطقة' },
  stage: { en: 'Stage', ar: 'المرحلة' },
  similarity: { en: 'Similarity to your idea', ar: 'التشابه مع فكرتك' },
  website: { en: 'Website', ar: 'الموقع' },
} as const;

function activityName(section: unknown, division: unknown): string | null {
  if (typeof section !== 'string' || !isIsicSection(section)) return null;
  const d = typeof division === 'string' ? ISIC_DIVISIONS[division] : undefined;
  return d && d.section === section ? `${section} ${division} · ${d.en}` : `${section} · ${ISIC_SECTIONS[section].en}`;
}

// Fields the analysis result does not carry are read from public.startups.
// select('*') keeps this working before and after the ISIC4 columns exist.
async function loadExtraFields(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getSupabase().from('startups').select('*').in('startup_id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.startup_id as string, row as Record<string, unknown>]));
}

export async function buildComparisonMatrix(founder: FounderInputs, competitors: Competitor[]): Promise<ComparisonMatrix> {
  const extra = await loadExtraFields(competitors.filter((c) => c.source === 'dataset').map((c) => c.startup_id));
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

  const columns = [
    { key: 'founder', name: 'Your idea', name_ar: 'فكرتك' },
    ...competitors.map((c) => ({ key: c.startup_id, name: c.name, name_ar: c.name_ar })),
  ];

  const row = (field: keyof typeof LABELS, founderValue: string | null, competitorValue: (c: Competitor, e: Record<string, unknown>) => string | null) => ({
    field,
    label: LABELS[field],
    values: Object.fromEntries([
      ['founder', founderValue],
      ...competitors.map((c) => [c.startup_id, competitorValue(c, extra.get(c.startup_id) ?? {})]),
    ]),
  });

  return {
    columns,
    rows: [
      row('what_it_does', founder.idea_text, (c) => text(c.description)),
      // Competitors are shown by their ISIC4 codes once classified, and by their old sector labels until then.
      row('activity', activityName(founder.sector, founder.sub_sector), (_c, e) => activityName(e.isic_section, e.isic_division) ?? text(e.sector)),
      row('target_market', null, (_c, e) => text(e.target_market)),
      row('region', founder.region, (c) => text(c.region)),
      row('stage', 'Idea', (c) => text(c.stage)),
      row('similarity', null, (c) => `${Math.round(c.similarity * 1000) / 10}%`),
      row('website', null, (c) => text(c.website)),
    ],
  };
}
