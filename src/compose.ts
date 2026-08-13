import type { MoodCheckin, OperationLog, Proposal, TimeBlock } from '@daycore/core';
import { addDays, dayOf, dayStartMs, toMin } from './stream';

// The narrative stream: yesterday · today · tomorrow folded into ONE ordered
// ledger, plus the non-block records (moods, ops) and the structural lines
// (day dividers, the now line, the mood check-in dock).
//
// ⚠️ This is NOT buildStream in stream.ts. buildStream folds one day's plan and
// proposals into an ordered list and answers "where is the now line"; THIS
// module is the ledger itself — the three days, the moods, the audit rows, the
// day dividers. Two different questions, two different layers.

export interface RiverDay {
  date: string;
  count: number;
  mood?: string;
}

export type Item =
  | { kind: 'river'; key: string; at: number; date: string; count: number; mood?: string }
  | { kind: 'head'; key: string; at: number; date: string }
  | { kind: 'block'; key: string; at: number; date: string; block: TimeBlock }
  | { kind: 'prop'; key: string; at: number; date: string; proposal: Proposal }
  | { kind: 'wither'; key: string; at: number; proposal: Proposal }
  | { kind: 'mood'; key: string; at: number; mood: MoodCheckin }
  | { kind: 'op'; key: string; at: number; op: OperationLog }
  | { kind: 'l0'; key: string; at: number; rows: OperationLog[] }
  | { kind: 'now'; key: string; at: number }
  | { kind: 'moodcheck'; key: string; at: number };

export interface ComposeInput {
  plans: Record<string, { blocks: TimeBlock[] } | undefined>;
  proposals: Proposal[];
  moods: MoodCheckin[];
  ops: OperationLog[];
  earlierDays: RiverDay[];
  today: string;
  nowMs: number;
}

// The 5-hour petrify line: a block more than this far behind today's now is a
// record, not something you can still nudge (HANDOFF 03 §6).
export const PETRIFY_MIN = 5 * 60;

export type Phase = 'stone' | 'recon' | 'now' | 'future';

/** Which phase a block is in, from the ledger's point of view. */
export function phaseOf(
  b: TimeBlock,
  planDate: string,
  today: string,
  nowMin: number,
): Phase {
  if (planDate < today) return 'stone';
  if (planDate > today) return 'future';
  if (b.completed) return 'stone';
  if (b.time === null) return 'future';
  const start = toMin(b.time);
  const end = start + (b.duration_min ?? 0);
  if (nowMin >= end + PETRIFY_MIN) return 'stone';
  if (nowMin >= end) return 'recon';
  if (nowMin >= start) return 'now';
  return 'future';
}

/** One earlier day's summary: how many visible blocks it held. */
export function riverDay(blocks: TimeBlock[], date: string): RiverDay {
  return { date, count: blocks.filter((b) => !b.hidden).length };
}

const HIDDEN_OP = new Set(['plan_add', 'plan_update', 'plan_remove', 'plan_upsert', 'mood_record']);

/** Fold moods/ops/proposals into the three-day ledger, ordered by time. */
export function compose(input: ComposeInput): Item[] {
  const { today, nowMs } = input;
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const items: Item[] = [];

  for (const r of input.earlierDays) {
    items.push({ kind: 'river', key: 'r' + r.date, at: dayStartMs(r.date) + 12 * 3600e3, ...r });
  }

  for (const d of [yesterday, today, tomorrow]) {
    items.push({ kind: 'head', key: 'h' + d, at: dayStartMs(d), date: d });
    const blocks = input.plans[d]?.blocks ?? [];
    for (const b of blocks) {
      if (b.hidden) continue;
      // ⚠️ Untimed blocks sit at the END of their day, not at midnight — the
      // top of the ledger means "earliest today", and a "someday" task is the
      // opposite of that.
      const atMin = b.time === null ? 24 * 60 - 1 : toMin(b.time);
      items.push({
        kind: 'block',
        key: 'b' + b.id,
        at: dayStartMs(d) + atMin * 60e3,
        date: d,
        block: b,
      });
    }
  }

  for (const p of input.proposals) {
    if (p.state === 'pending') {
      let at = nowMs + 90e3;
      if (p.date && p.date >= yesterday && p.start) {
        at = Math.max(at, dayStartMs(p.date) + toMin(p.start) * 60e3 - 1);
      }
      items.push({ kind: 'prop', key: 'p' + p.id, at, date: p.date ?? today, proposal: p });
    } else if (p.state === 'expired' && p.expiresAt) {
      const exp = new Date(p.expiresAt).getTime();
      if (exp >= dayStartMs(yesterday)) {
        items.push({ kind: 'wither', key: 'w' + p.id, at: Math.min(exp, nowMs - 1), proposal: p });
      }
    }
  }

  for (const m of input.moods) {
    const at = new Date(m.createdAt).getTime();
    if (!Number.isNaN(at) && at >= dayStartMs(yesterday)) {
      items.push({ kind: 'mood', key: 'm' + m.id, at, mood: m });
    }
  }

  // Audit rows. Block edits are already the blocks themselves, so they are not
  // re-narrated; the filing-cabinet and care rows are. Consecutive agent rows
  // collapse into one L0 group so the stream stays a ledger, not a log.
  const visible = input.ops.filter((o) => !HIDDEN_OP.has(o.action));
  const groups: OperationLog[][] = [];
  let cur: OperationLog[] = [];
  for (const o of visible) {
    const at = new Date(o.createdAt).getTime();
    if (Number.isNaN(at) || at < dayStartMs(yesterday)) continue;
    if (cur.length) {
      const prev = new Date(cur[cur.length - 1]!.createdAt).getTime();
      if (o.actor === 'agent' && at - prev <= 150 * 60e3 && dayOf(at) === dayOf(prev)) {
        cur.push(o);
        continue;
      }
      groups.push(cur);
      cur = [];
    }
    cur.push(o);
  }
  if (cur.length) groups.push(cur);
  for (const g of groups) {
    const first = new Date(g[0]!.createdAt).getTime();
    if (g.length > 1) items.push({ kind: 'l0', key: 'l0' + first, at: first, rows: g });
    else items.push({ kind: 'op', key: 'o' + g[0]!.id, at: first, op: g[0]! });
  }

  items.push({ kind: 'now', key: 'now', at: nowMs });
  items.push({ kind: 'moodcheck', key: 'moodcheck', at: nowMs + 1 });

  items.sort((a, b) => a.at - b.at);
  return items;
}
