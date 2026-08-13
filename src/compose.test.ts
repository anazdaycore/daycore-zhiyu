import { describe, expect, it } from 'vitest';
import type { TimeBlock } from '@daycore/core';
import { compose, phaseOf, riverDay, PETRIFY_MIN } from './compose';

const b = (o: Partial<TimeBlock> & { id: string; time: string }): TimeBlock => ({
  title: o.id,
  type: 'task',
  duration_min: 30,
  ...o,
});

describe('phaseOf', () => {
  const today = '2026-08-13';
  const nowMin = 12 * 60;

  it('marks a past day as stone', () => {
    expect(phaseOf(b({ id: 'x', time: '09:00' }), '2026-08-12', today, nowMin)).toBe('stone');
  });

  it('marks a future day as future', () => {
    expect(phaseOf(b({ id: 'x', time: '09:00' }), '2026-08-14', today, nowMin)).toBe('future');
  });

  it('marks a completed block as stone even today', () => {
    expect(phaseOf(b({ id: 'x', time: '09:00', completed: true }), today, today, nowMin)).toBe('stone');
  });

  it('marks an untimed block as future', () => {
    expect(phaseOf(b({ id: 'x', time: null as unknown as string }), today, today, nowMin)).toBe('future');
  });

  it('marks a block more than the petrify line behind as stone', () => {
    expect(phaseOf(b({ id: 'x', time: '01:00', duration_min: 30 }), today, today, 60 + 30 + PETRIFY_MIN + 1)).toBe('stone');
  });

  it('marks a recently-passed block as recon', () => {
    expect(phaseOf(b({ id: 'x', time: '11:00', duration_min: 30 }), today, today, 11 * 60 + 40)).toBe('recon');
  });

  it('marks a block in progress as now', () => {
    expect(phaseOf(b({ id: 'x', time: '11:00', duration_min: 60 }), today, today, 11 * 60 + 10)).toBe('now');
  });

  it('marks an upcoming block as future', () => {
    expect(phaseOf(b({ id: 'x', time: '15:00' }), today, today, nowMin)).toBe('future');
  });
});

describe('riverDay', () => {
  it('counts only visible blocks', () => {
    expect(riverDay([b({ id: 'a', time: '09:00' }), b({ id: 'gone', time: '10:00', hidden: true })], '2026-08-10').count).toBe(1);
  });
});

describe('compose', () => {
  it('emits yesterday/today/tomorrow dividers in order', () => {
    const items = compose({
      plans: {},
      proposals: [],
      moods: [],
      ops: [],
      earlierDays: [],
      today: '2026-08-13',
      nowMs: new Date('2026-08-13T12:00:00').getTime(),
    });
    const heads = items.filter((i) => i.kind === 'head').map((i) => (i as { date: string }).date);
    expect(heads).toEqual(['2026-08-12', '2026-08-13', '2026-08-14']);
  });

  it('interleaves moods and now/moodcheck by time', () => {
    const items = compose({
      plans: {},
      proposals: [],
      moods: [{ id: 'm1', mood: 'calm', exerciseCompleted: false, createdAt: '2026-08-13T09:00:00Z' }],
      ops: [],
      earlierDays: [],
      today: '2026-08-13',
      nowMs: new Date('2026-08-13T12:00:00').getTime(),
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('mood');
    // now and moodcheck sit one millisecond apart, so they are always adjacent.
    expect(kinds.indexOf('moodcheck')).toBe(kinds.indexOf('now') + 1);
  });

  it('turns pending proposals into prop items and expired ones into wither', () => {
    const items = compose({
      plans: {},
      proposals: [
        { id: 'p1', state: 'pending', level: 'L2', kind: 'card', title: 'pending', start: '14:00', date: '2026-08-13' },
        { id: 'p2', state: 'expired', level: 'L2', kind: 'card', title: 'expired', expiresAt: '2026-08-13T10:00:00Z' },
      ],
      moods: [],
      ops: [],
      earlierDays: [],
      today: '2026-08-13',
      nowMs: new Date('2026-08-13T12:00:00').getTime(),
    });
    expect(items.some((i) => i.kind === 'prop')).toBe(true);
    expect(items.some((i) => i.kind === 'wither')).toBe(true);
  });
});
