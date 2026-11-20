import { sopSchema } from '@nodedr-restaurant/types';
import { STARTER_SOPS, STARTER_CHECKLISTS, STARTER_PLAYBOOKS } from './sop-library';
import { isAudioSignature } from './audio-upload.config';
import {
  daysUntil,
  isoWeekKey,
  itemDone,
  localNow,
  outOfRange,
  periodKeyFor,
  quizResult,
} from './sop.service';
import { checklistTemplateSchema, playbookSchema } from '@nodedr-restaurant/types';

describe('RasoiOS helpers', () => {
  const quiz = [
    { q: { en: 'a' }, options: [{ en: 'x' }, { en: 'y' }], answer: 1 },
    { q: { en: 'b' }, options: [{ en: 'x' }, { en: 'y' }], answer: 0 },
  ];

  it('passes the quiz only at 80% or more and lists wrong answers', () => {
    expect(quizResult(quiz, [1, 0])).toMatchObject({ score: 2, total: 2, passed: true, wrong: [] });
    expect(quizResult(quiz, [1, 1])).toMatchObject({ score: 1, passed: false, wrong: [1] });
    expect(quizResult([], [])).toMatchObject({ passed: true, total: 0 });
  });

  it('computes branch-local date/time and ISO week keys', () => {
    // 2026-11-20 20:00 UTC is 21 Nov 01:30 in India.
    const n = localNow('Asia/Kolkata', new Date('2026-11-20T20:00:00Z'));
    expect(n).toEqual({ date: '2026-11-21', time: '01:30', weekday: 6 });
    expect(isoWeekKey('2026-11-20')).toBe('2026-W47');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(periodKeyFor('DAILY', '2026-11-20')).toBe('2026-11-20');
    expect(periodKeyFor('WEEKLY', '2026-11-20')).toBe('2026-W47');
  });

  it('knows when a checklist item is done or out of range', () => {
    const temp = { id: 'f', label: { en: 'Fridge' }, kind: 'TEMP' as const, min: 1, max: 5 };
    const check = { id: 'g', label: { en: 'Gas' }, kind: 'CHECK' as const };
    expect(itemDone(check, { ok: true, by: 'a', at: '' })).toBe(true);
    expect(itemDone(check, { ok: false, by: 'a', at: '' })).toBe(false);
    expect(itemDone(temp, { value: 0, by: 'a', at: '' })).toBe(true);
    expect(outOfRange(temp, { value: 9, by: 'a', at: '' })).toBe(true);
    expect(outOfRange(temp, { value: 4, by: 'a', at: '' })).toBe(false);
    expect(outOfRange(temp, undefined)).toBe(false);
  });

  it('counts days to expiry', () => {
    expect(daysUntil('2026-11-20', new Date('2026-12-20T00:00:00Z'))).toBe(30);
    expect(daysUntil('2026-11-20', new Date('2026-11-18T00:00:00Z'))).toBe(-2);
    expect(daysUntil('2026-11-20', null)).toBeNull();
  });

  it('recognises real audio and rejects other files', () => {
    expect(isAudioSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
    expect(isAudioSignature(Buffer.from('OggS00000000'))).toBe(true);
    expect(isAudioSignature(Buffer.from('\0\0\0\x20ftypM4A '))).toBe(true);
    expect(isAudioSignature(Buffer.from('<html><body>'))).toBe(false);
  });

  it('starter library is valid content', () => {
    for (const { key: _k, ...s } of STARTER_SOPS) expect(sopSchema.safeParse(s).success).toBe(true);
    for (const { key: _k, ...c } of STARTER_CHECKLISTS) expect(checklistTemplateSchema.safeParse(c).success).toBe(true);
    for (const p of STARTER_PLAYBOOKS) expect(playbookSchema.safeParse(p).success).toBe(true);
    // Every Jain-capable starter dish actually changes something for Jain.
    for (const s of STARTER_SOPS.filter((x) => x.variants.includes('JAIN'))) {
      const touched = [...s.ingredients, ...s.steps].some((l) => l.variants?.JAIN);
      expect(touched).toBe(true);
    }
  });
});
