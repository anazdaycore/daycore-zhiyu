import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MoodCheckin, MoodKind, OperationLog, Proposal, TimeBlock } from '@daycore/core';
import { Icon } from './icons';
import { useStore } from './store';
import { toHM, toMin, fmtHM } from './stream';

// 顺流 — 零件：条目 / 菜单 / 提案便签 / 小账行 / 心情 / 撤销条。

function UndoBar() {
  const s = useStore();
  const t = s.t;
  if (!s.undo && !s.flash) return null;
  return (
    <div className="fl-snack">
      <span>{s.undo ? s.undo.label : s.flash}</span>
      {s.undo && (
        <button className="u" onClick={() => void s.takeBack()}>
          {t('undo.take')}
        </button>
      )}
      <button onClick={() => { s.clearUndo(); }}>✕</button>
    </div>
  );
}

function BlockEntry({ b, date }: { b: TimeBlock; date: string }) {
  const s = useStore();
  const t = s.t;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(b.note ?? '');
  const phase = s.phaseOf(b, date);
  const tone =
    phase === 'stone'
      ? 'mute'
      : b.completed
        ? 'ok'
        : phase === 'now'
          ? 'acc'
          : phase === 'recon'
            ? 'warn'
            : date > s.today
              ? 'mute'
              : 'acc';
  const cls =
    'fl-en tone-' +
    tone +
    ' ' +
    (phase === 'stone' ? 'stone' : phase === 'future' ? (date > s.today ? 'preview' : 'future') : phase === 'now' ? 'now-blk' : '');
  const end = toHM(toMin(b.time ?? '00:00') + (b.duration_min ?? 0));
  const bc =
    'var(--dc-' +
    (b.type === 'appointment' ? 'accent-2' : b.type === 'relax' ? 'ok' : b.type === 'meal' ? 'warn' : 'accent') +
    ')';
  return (
    <div className={cls} id={'fl-b-' + b.id}>
      <span className="gut">{b.time ?? ''}</span>
      <span className="dot"></span>
      <div
        className={
          'fl-card' +
          (b.origin === 'auto' ? ' auto' : '') +
          (b.lock_level === 'hard' ? ' lk-hard' : b.lock_level === 'soft' ? ' lk-soft' : '')
        }
        title={b.lock_reason || undefined}
        style={{ '--bc': bc } as CSSProperties}
      >
        {b.lock_level === 'hard' && <span className="fl-pin" aria-hidden="true"></span>}
        <button
          className="menu dc4-iconbtn"
          style={{ width: 30, height: 30 }}
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        >
          <Icon n="dots" size={16} />
        </button>
        <div className="tt">
          {b.completed && (
            <span className="ok">
              <Icon n="check" size={14} />
            </span>
          )}
          <span style={b.completed ? { color: 'var(--dc-ink-2)' } : undefined}>{b.title}</span>
        </div>
        <div className="meta">
          {phase === 'now' && <span className="fl-chip-now">{t('entry.now')}</span>}
          {phase === 'stone' && <span className="fl-tag">{t('entry.record')}</span>}
          <span>
            {b.time}–{end} · {t('entry.minutes', { n: b.duration_min ?? 0 })}
          </span>
          <span>{b.origin === 'auto' ? t('entry.auto') : t('entry.mine')}</span>
        </div>
        {b.note && !noting && <div className="note">“{b.note}”</div>}
        {noting && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              className="dc4-input"
              style={{ height: 32, fontSize: 12.5 }}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void s.setNote(b, date, note);
                  setNoting(false);
                }
                if (e.key === 'Escape') setNoting(false);
              }}
              placeholder={t('entry.notePlaceholder')}
            />
          </div>
        )}
        {phase === 'now' && !b.completed && (
          <div className="fl-doneb">
            <button className="dc4-btn sm" onClick={() => void s.complete(b, date)}>
              <Icon n="check" size={14} />
              {t('entry.done')}
            </button>
          </div>
        )}
        {phase === 'recon' && !b.completed && (
          <div className="fl-rechip">
            <button onClick={() => void s.complete(b, date)}>{t('entry.done')}</button>
          </div>
        )}
      </div>
      {menu && <EntryMenu b={b} date={date} at={menu} onClose={() => setMenu(null)} onNote={() => setNoting(true)} />}
    </div>
  );
}

function EntryMenu({
  b,
  date,
  at,
  onClose,
  onNote,
}: {
  b: TimeBlock;
  date: string;
  at: { x: number; y: number };
  onClose: () => void;
  onNote: () => void;
}) {
  const s = useStore();
  const t = s.t;
  const phase = s.phaseOf(b, date);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ code: string; reason?: string; confirmable: boolean } | null>(null);
  const style = {
    left: Math.max(8, Math.min(at.x - 170, window.innerWidth - 200)),
    top: Math.min(at.y + 6, window.innerHeight - 320),
  };
  const move1 = async (confirmed: boolean) => {
    const r = await s.moveToTomorrow(b, date, confirmed);
    if (r.ok) {
      onClose();
      return;
    }
    const blocked = r.blocked;
    if (blocked.code === 'petrified') {
      setRefused({ code: 'petrified', confirmable: false });
      return;
    }
    if (blocked.code === 'refish_capped') {
      setRefused({ code: 'refish_capped', confirmable: false });
      return;
    }
    if (blocked.code === 'locked') {
      if (blocked.confirmable) {
        setConfirm(blocked.lockReason ?? t('menu.softReason'));
        return;
      }
      setRefused({ code: 'locked', reason: blocked.lockReason, confirmable: false });
      return;
    }
    setRefused({ code: 'error', confirmable: false });
  };

  const remove1 = async () => {
    const r = await s.removeBlock(b, date);
    onClose();
    if (!r.ok && r.blocked.code === 'locked') setRefused({ code: 'locked', reason: r.blocked.lockReason, confirmable: false });
  };

  const cap =
    phase === 'stone'
      ? t('menu.capStone')
      : phase === 'recon'
        ? t('menu.capRecon')
        : b.origin === 'auto'
          ? t('menu.capAuto')
          : t('menu.capMine');

  return (
    <>
      <div className="fl-veil" style={{ background: 'transparent' }} onClick={onClose}></div>
      <div className="fl-menu" style={style}>
        <div className="cap">{cap}</div>

        {phase !== 'stone' && !b.completed && (
          <button
            onClick={() => {
              void s.complete(b, date);
              onClose();
            }}
          >
            <Icon n="check" />
            {t('menu.done')}
          </button>
        )}

        {refused && refused.code === 'petrified' && (
          <div className="fl-menu-lock">{t('menu.petrified')}</div>
        )}
        {refused && refused.code === 'refish_capped' && (
          <div className="fl-menu-lock">{t('menu.refishCapped')}</div>
        )}
        {refused && refused.code === 'locked' && !refused.confirmable && (
          <div className="fl-menu-lock">
            <span className="fl-pin sm" aria-hidden="true"></span>
            {refused.reason || t('menu.hardLock')}——{t('menu.timeNotYours')}
          </div>
        )}

        {phase !== 'stone' && b.lock_level === 'hard' && (
          <>
            <div className="fl-menu-lock">
              <span className="fl-pin sm" aria-hidden="true"></span>
              {b.lock_reason || t('menu.hardLock')}——{t('menu.timeNotYours')}
            </div>
            <button
              onClick={() => {
                onClose();
                void s.removeBlock(b, date);
              }}
            >
              <Icon n="minus" />
              {t('menu.leave')}
            </button>
            <button
              onClick={() => {
                void s.markConflict(b, date);
                onClose();
              }}
            >
              <Icon n="sparkle" />
              {t('menu.conflict')}
            </button>
          </>
        )}

        {confirm
          ? (
            <div className="fl-menu-confirm">
              <div className="q">{confirm}</div>
              <div className="row">
                <button className="y" onClick={() => void move1(true)}>{t('menu.confirmStill')}</button>
                <button onClick={() => setConfirm(null)}>{t('menu.confirmCancel')}</button>
              </div>
            </div>
          )
          : phase !== 'stone' && b.lock_level !== 'hard' && (
            <>
              <button onClick={() => void move1(false)}>
                <Icon n="arrow-right" />
                {t('menu.moveTomorrow')}
                {b.lock_level === 'soft' && <span className="fl-lk-dot" title={b.lock_reason}></span>}
              </button>
              {refused && refused.code === 'locked' && !refused.confirmable && (
                <button
                  onClick={() => {
                    void s.markConflict(b, date);
                    onClose();
                  }}
                >
                  <Icon n="sparkle" />
                  {t('menu.conflict')}
                </button>
              )}
            </>
          )}

        <button
          onClick={() => {
            onNote();
            onClose();
          }}
        >
          <Icon n="file" />
          {t('menu.note')}
        </button>

        {phase === 'stone' ? (
          <button
            onClick={() => {
              void s.refish(b, date);
              onClose();
            }}
          >
            <Icon n="refresh" />
            {t('menu.reschedule')}
          </button>
        ) : (
          b.lock_level === 'hard' ? null : (
            <button className="warn" onClick={() => void remove1()}>
              <Icon n="trash" />
              {t('menu.remove')}
            </button>
          )
        )}
      </div>
    </>
  );
}

function PropInsert({ p, onFollow }: { p: Proposal; onFollow?: () => void }) {
  const s = useStore();
  const t = s.t;
  if (p.state !== 'pending') return null;
  const policy = (p as Proposal & { ttlPolicy?: string }).ttlPolicy;
  const left = Math.max(0, (new Date(p.expiresAt ?? Date.now() + 3600e3).getTime() - Date.now()) / 3600e3);
  const ttl =
    (policy === 'silence_accepts' ? t('prop.ttlAccept') : t('prop.ttlReject')) +
    ' · ' +
    (left >= 1 ? t('prop.ttlHour', { n: Math.round(left) }) : t('prop.ttlMin', { n: Math.max(5, Math.round(left * 60)) }));
  const timed = p.kind === 'timed';
  const kindLabel = timed
    ? t('prop.timed', { time: p.start ?? '' })
    : p.kind === 'decision'
      ? t('prop.decision')
      : t('prop.note');
  return (
    <div className={'fl-prop' + (timed ? ' ghosty' : '')}>
      <div className="kind">
        <Icon n="sparkle" size={12} />
        {kindLabel}
        <span className="ttl">{ttl}</span>
      </div>
      <h4>{p.title}</h4>
      {p.summary && <div className="why">{p.summary}{p.reason ? '——' + p.reason : ''}</div>}
      {p.rows && p.rows.length > 0 && (
        <div className="rows">
          {p.rows.map((r) => (
            <div key={r.id} className={'row ' + (r.state === 'accepted' ? 'acc' : r.state === 'rejected' ? 'rej' : '')}>
              <span className="lb">{r.label}</span>
              {r.state === 'pending' ? (
                <>
                  <button className="rb y" onClick={() => void s.take(p, r.id)}>
                    <Icon n="check" size={13} />
                  </button>
                  <button className="rb n" onClick={() => void s.answer(p, false)}>
                    <Icon n="x" size={12} />
                  </button>
                </>
              ) : (
                <Icon n={r.state === 'accepted' ? 'check' : 'x'} size={13} style={{ color: r.state === 'accepted' ? 'var(--dc-ok)' : 'var(--dc-ink-3)' }} />
              )}
            </div>
          ))}
        </div>
      )}
      {p.evidence && (
        <div className="ev">
          <Icon n="eye" size={12} />
          {p.evidence}
        </div>
      )}
      <div className="acts">
        {p.rows && p.rows.length > 0 ? (
          <button className="dc4-btn sm" onClick={() => void s.answer(p, true)}>
            <Icon n="check" size={14} />
            {t('prop.allAccept')}
          </button>
        ) : (
          <button className="dc4-btn sm" onClick={() => void s.answer(p, true)}>
            <Icon n="check" size={14} />
            {timed ? t('prop.putIn') : t('prop.accept')}
          </button>
        )}
        <button className="dc4-btn sm sec" onClick={() => void s.answer(p, false)}>
          {t('prop.reject')}
        </button>
        {onFollow && (
          <button className="dc4-btn sm ghost" onClick={onFollow}>
            {t('prop.followUp')}
          </button>
        )}
      </div>
    </div>
  );
}

function OpLine({ op }: { op: OperationLog }) {
  const s = useStore();
  const t = s.t;
  const verb = useMemo(() => opVerb(op.action, s.t), [op.action, s.t]);
  return (
    <div className="fl-line">
      <span className="ic" style={{ color: domainColor(op.domain) }}>
        <Icon n={opIcon(op.action)} size={13} />
      </span>
      <span className="lb">
        {verb}
        {op.summary && <span className="sb">{op.summary}</span>}
      </span>
      {op.actor === 'agent' && <span className="fl-tag">{t('op.agent')}</span>}
      <button className="un" onClick={() => void s.undoOp(op.id)}>
        {t('op.undo')}
      </button>
    </div>
  );
}

function L0Group({ rows }: { rows: OperationLog[] }) {
  const s = useStore();
  const t = s.t;
  const [open, setOpen] = useState(false);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  return (
    <div className="fl-l0">
      <button onClick={() => setOpen(!open)}>
        <Icon n={open ? 'chevron-down' : 'chevron-right'} size={13} />
        <span className="n">{rows.length}</span>
        {t('l0.count', { n: rows.length })}
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {fmtHM(new Date(first.createdAt).getTime())}–{fmtHM(new Date(last.createdAt).getTime())}
        </span>
      </button>
      {open && (
        <div className="rows">
          {rows.map((o) => (
            <div key={o.id} className="fl-line">
              <span className="ic">
                <Icon n="zap" size={12} />
              </span>
              <span className="lb">
                {opVerb(o.action, s.t)}
                <span className="sb">{fmtHM(new Date(o.createdAt).getTime())} · {t('op.agent')}</span>
              </span>
              <button className="un" onClick={() => void s.undoOp(o.id)}>
                {t('op.undo')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoodEntry({ m }: { m: MoodCheckin }) {
  const s = useStore();
  const kind = s.moodLabel(m.mood);
  return (
    <div className="fl-mood">
      <span className="e">{kind?.emoji ?? '·'}</span>
      <div className="bd">
        <b>{kind?.name ?? m.mood}</b>
        {m.note && <span className="nt">　{m.note}</span>}
      </div>
    </div>
  );
}

function MoodCheck({ onMore }: { onMore: () => void }) {
  const s = useStore();
  const t = s.t;
  // 原型 flow-parts.jsx 的 quick 是 [0,1,3,5,6,8] —— 不是前 6 个，是一组刻意挑的。
  const kinds = [0, 1, 3, 5, 6, 8].map((i) => s.moodKinds[i]).filter((k): k is MoodKind => !!k);
  return (
    <div className="fl-moodcheck" data-screen-label="mood">
      <span className="q">
        <Icon n="smile" size={15} style={{ color: 'var(--dc-accent)' }} />
        {t('mood.q')}
      </span>
      <div className="faces">
        {kinds.map((k) => (
          <button key={k.id} title={k.name} onClick={() => void s.recordMood(k.id, '')}>
            {k.emoji}
          </button>
        ))}
        <button className="more" title={t('mood.more')} onClick={onMore}>
          {t('mood.more')}
        </button>
      </div>
    </div>
  );
}

function MoodSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <>
      <div className="fl-veil" style={{ background: 'transparent' }} onClick={onClose}></div>
      <div className="fl-moodsheet">
        <b style={{ fontSize: 13.5 }}>{t('mood.title')}</b>
        <div className="fl-moodgrid">
          {s.moodKinds.map((k) => (
            <button key={k.id} className={sel === k.id ? 'on' : ''} onClick={() => setSel(k.id)}>
              <span className="e">{k.emoji}</span>
              {k.name}
            </button>
          ))}
        </div>
        <input
          className="dc4-input"
          style={{ marginTop: 10, height: 34, fontSize: 12.5 }}
          placeholder={t('mood.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="dc4-btn sm ghost" onClick={onClose}>
            {t('mood.cancel')}
          </button>
          <button
            className="dc4-btn sm"
            disabled={!sel}
            onClick={() => {
              if (sel) void s.recordMood(sel, note);
              onClose();
            }}
          >
            {t('mood.save')}
          </button>
        </div>
      </div>
    </>
  );
}

function NoticeOverlay({ title, onClose }: { title: string; onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  return (
    <div className="fl-over" onClick={onClose}>
      <div className="fl-ocard" onClick={(e) => e.stopPropagation()}>
        <h4>
          <Icon n="search" size={15} style={{ color: 'var(--dc-accent)' }} />
          {t('notice.title')}
        </h4>
        <ul>
          <li>{title}</li>
        </ul>
        <div className="acts">
          <button className="dc4-btn sm sec" onClick={onClose}>
            {t('notice.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidatesOverlay({ blocks, onClose }: { blocks: TimeBlock[]; onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [added, setAdded] = useState<Set<number>>(new Set());
  return (
    <div className="fl-over" onClick={onClose}>
      <div className="fl-ocard" onClick={(e) => e.stopPropagation()}>
        <h4>
          <Icon n="sparkle" size={15} style={{ color: 'var(--dc-accent)' }} />
          {t('cand.title')}
        </h4>
        <ul>
          {blocks.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>
                {b.time ? b.time + ' · ' : ''}
                {b.title}
                {b.duration_min ? ' · ' + t('cand.minutes', { n: b.duration_min }) : ''}
              </span>
              {added.has(i) ? (
                <Icon n="check" size={14} style={{ color: 'var(--dc-ok)' }} />
              ) : (
                <button
                  className="fl-btn sm"
                  onClick={() => {
                    setAdded((prev) => new Set(prev).add(i));
                    void s.addCandidate(b);
                  }}
                >
                  {t('cand.add')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="acts">
          <button className="dc4-btn sm sec" onClick={onClose}>
            {t('cand.cancel')}
          </button>
          <button
            className="dc4-btn sm"
            onClick={() => {
              blocks.forEach((b) => void s.addCandidate(b));
              onClose();
            }}
          >
            {t('cand.all')}
          </button>
        </div>
      </div>
    </div>
  );
}

// The river colours its bands by domain — schedule/habit/archive/care/system.
function domainColor(domain?: string): string {
  if (domain === 'schedule') return 'var(--dc-accent)';
  if (domain === 'habit') return 'var(--dc-ok)';
  if (domain === 'archive') return 'var(--dc-warn)';
  if (domain === 'care') return 'var(--dc-accent-2)';
  return 'var(--dc-ink-3)';
}

const opIcon = (action: string): string => {
  if (action.startsWith('wish_')) return 'star';
  if (action.startsWith('material_')) return 'book';
  if (action.startsWith('memory_')) return 'sparkle';
  if (action.startsWith('mood_')) return 'smile';
  if (action.startsWith('rule_')) return 'refresh';
  if (action.startsWith('assignment_')) return 'clock';
  return 'pencil';
};

const opVerb = (action: string, t: (k: string, v?: Record<string, string | number>) => string): string => {
  if (action.startsWith('wish_')) return t('op.wish');
  if (action.startsWith('material_')) return t('op.material');
  if (action.startsWith('memory_')) return t('op.memory');
  if (action.startsWith('mood_')) return t('op.mood');
  if (action.startsWith('rule_')) return t('op.rule');
  if (action.startsWith('assignment_')) return t('op.assignment');
  return t('op.other');
};

export { UndoBar, BlockEntry, PropInsert, OpLine, L0Group, MoodEntry, MoodCheck, MoodSheet, NoticeOverlay, CandidatesOverlay };
