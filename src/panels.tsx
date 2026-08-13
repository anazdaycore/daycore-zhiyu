import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomTheme, DecisionCardFrame, ToolResultFrame, ToolStartFrame } from '@daycore/core';
import * as api from '@daycore/core';
import { Icon } from './icons';
import { useStore } from './store';
import { MoodCheck } from './parts';
import { BUILTIN } from './theme';

// 顺流 — 侧入口面板：伙伴 / 资料 / 展望 / 设置，加桌面常驻边栏。

function Panel({
  title,
  icon,
  onClose,
  label,
  children,
  footer,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="fl-veil" onClick={onClose}></div>
      <div className="fl-panel" data-screen-label={label}>
        <div className="fl-phead">
          <h3>
            <Icon n={icon} size={16} style={{ color: 'var(--dc-accent)' }} />
            {title}
          </h3>
          <button className="dc4-iconbtn" onClick={onClose}>
            <Icon n="x" size={16} />
          </button>
        </div>
        <div className="fl-pbody">{children}</div>
        {footer && <div className="fl-pfoot">{footer}</div>}
      </div>
    </>
  );
}

function Materials({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);
  const catName = (id: string) => s.categories.find((c) => c.id === id)?.name ?? id;
  return (
    <Panel title={t('mat.title')} icon="book" onClose={onClose} label="materials">
      <div className="fl-sec">
        {t('mat.lib')}
        <span className="n">{s.materials.length}</span>
      </div>
      {s.materials.length === 0 && <div className="fl-line"><span className="lb">{t('mat.empty')}</span></div>}
      {s.materials.map((m) => (
        <div key={m.id} className="fl-it">
          <span className="fl-tag" style={{ marginTop: 2 }}>{catName(m.category)}</span>
          <div className="bd">
            <div className="t">{m.title}</div>
            {m.summary && <div className="s">{m.summary}</div>}
          </div>
          <button className="x" onClick={() => void s.deleteMaterial(m.id)}>
            <Icon n="trash" size={14} />
          </button>
        </div>
      ))}
    </Panel>
  );
}

function dueLabel(due: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const d = new Date(due).getTime();
  if (Number.isNaN(d)) return '';
  const days = Math.ceil((d - Date.now()) / 86400e3);
  if (days < 0) return t('out.overdue', { n: -days });
  if (days === 0) return t('out.today');
  if (days === 1) return t('out.tomorrow');
  return t('out.days', { n: days });
}

function Outlook({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [wish, setWish] = useState('');
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);
  const active = s.wishes.filter((w) => w.status === 'active');
  const addWish = () => {
    const title = wish.trim();
    if (!title) return;
    void s.createWish(title, '', null);
    setWish('');
  };
  return (
    <Panel
      title={t('out.title')}
      icon="zap"
      onClose={onClose}
      label="outlook"
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="dc4-input"
            style={{ height: 40, fontSize: 13 }}
            placeholder={t('out.wishPlaceholder')}
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWish()}
          />
          <button className="dc4-btn" style={{ flex: 'none' }} onClick={addWish}>
            <Icon n="plus" size={15} />
            {t('out.add')}
          </button>
        </div>
      }
    >
      <div className="fl-sec">
        {t('out.deadlines')}
        <span className="n">{s.assignments.filter((a) => a.status === 'pending').length}</span>
      </div>
      {s.assignments.filter((a) => a.status === 'pending').length === 0 && (
        <div className="fl-line"><span className="lb">{t('out.noDeadlines')}</span></div>
      )}
      {s.assignments.filter((a) => a.status === 'pending').map((a) => (
        <div key={a.id} className="fl-it" style={{ alignItems: 'center' }}>
          <span className="fl-u" data-u="1"></span>
          <div className="bd">
            <div className="t">{a.title}</div>
          </div>
          {a.dueAt && <span className="fl-dl">{dueLabel(a.dueAt, s.t)}</span>}
        </div>
      ))}
      <div className="fl-sec">
        {t('out.wishes')}
        <span className="n">{active.length}</span>
      </div>
      {active.map((w) => (
        <div key={w.id} className="fl-it">
          <Icon n="star" size={14} style={{ color: 'var(--dc-warn)', marginTop: 3 }} />
          <div className="bd">
            <div className="t">{w.title}</div>
            <div className="s">
              {w.effortMin ? t('out.wishEffort', { n: w.effortMin }) : t('out.wishHint')}
            </div>
          </div>
          <button className="x" title={t('out.wishDone')} style={{ color: 'var(--dc-ok)' }} onClick={() => void s.updateWish(w.id, { status: 'done' })}>
            <Icon n="check" size={14} />
          </button>
          <button className="x" title={t('out.wishDrop')} onClick={() => void s.updateWish(w.id, { status: 'archived' })}>
            <Icon n="x" size={13} />
          </button>
        </div>
      ))}
    </Panel>
  );
}

interface ToolChip {
  callId: string;
  tool: string;
  ok?: boolean;
  summary?: string;
  opId?: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  tools: ToolChip[];
  error?: string;
}

type Tr = (k: string, v?: Record<string, string | number>) => string;

function toolLabel(tool: string, t: Tr): string {
  if (tool === 'plan_add' || tool === 'plan_update' || tool === 'plan_remove') return t('tool.plan');
  if (tool === 'rule_upsert' || tool === 'rule_remove') return t('tool.rule');
  if (tool === 'memory_add' || tool === 'memory_remove') return t('tool.memory');
  if (tool === 'wish_add') return t('tool.wish');
  if (tool === 'material_add') return t('tool.material');
  if (tool === 'mood_record') return t('tool.mood');
  if (tool === 'assignment_upsert') return t('tool.assignment');
  if (tool === 'get_weather') return t('tool.weather');
  if (tool === 'web_search') return t('tool.search');
  if (tool === 'list_upcoming') return t('tool.upcoming');
  return t('tool.other');
}

function Companion({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [streaming, setStreaming] = useState<{ text: string; reasoning: string; tools: ToolChip[] } | null>(null);
  const [decision, setDecision] = useState<DecisionCardFrame | null>(null);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, streaming, typing]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    setInput('');
    setError('');
    const history = msgs.map((m) => ({ role: m.role, content: m.content })).slice(-8);
    setMsgs((m) => [...m, { role: 'user', content: text, tools: [] }]);
    setTyping(true);
    setStreaming({ text: '', reasoning: '', tools: [] });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await api.streamCompanion(
        {
          message: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          assistantName: s.assistantName,
          conversationHistory: history,
        },
        {
          onDelta: (t) => setStreaming((cur) => cur ? { ...cur, text: cur.text + t } : { text: t, reasoning: '', tools: [] }),
          onReasoning: (t) => setStreaming((cur) => cur ? { ...cur, reasoning: cur.reasoning + t } : { text: '', reasoning: t, tools: [] }),
          onToolStart: (f: ToolStartFrame) =>
            setStreaming((cur) => ({
              text: cur?.text ?? '',
              reasoning: cur?.reasoning ?? '',
              tools: [...(cur?.tools ?? []), { callId: f.callId, tool: f.tool }],
            })),
          onToolResult: (f: ToolResultFrame) =>
            setStreaming((cur) => ({
              text: cur?.text ?? '',
              reasoning: cur?.reasoning ?? '',
              tools: (cur?.tools ?? []).map((t) => (t.callId === f.callId ? { ...t, ok: f.ok, summary: f.summary, opId: f.opId } : t)),
            })),
          onDecisionCard: (f: DecisionCardFrame) => setDecision(f),
          onError: (code: string, message: string) => setError(message || code),
          onDone: () => {
            setStreaming((cur) => {
              if (cur) {
                setMsgs((m) => [
                  ...m,
                  { role: 'assistant', content: cur.text, reasoning: cur.reasoning, tools: cur.tools },
                ]);
              }
              return null;
            });
            setTyping(false);
            void s.refresh();
          },
        },
        ac.signal,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setStreaming(null);
      setTyping(false);
    }
  };

  const decide = (choice: string) => {
    if (!decision) return;
    const id = decision.id;
    setDecision(null);
    void api.respondToDecision(id, choice);
  };

  const toolchip = (chip: ToolChip, j: number) => (
    <span key={j} className="fl-toolchip">
      <Icon n="wand" size={11} />
      {chip.summary ?? toolLabel(chip.tool, t)}
      {chip.opId && (
        <button onClick={() => void s.undoOp(chip.opId!)}>{t('tool.undo')}</button>
      )}
    </span>
  );

  return (
    <>
      <div className="fl-veil" onClick={onClose}></div>
      <div className="fl-panel" data-screen-label="companion">
        <div className="fl-phead">
          <h3>
            <Icon n="chat" size={16} style={{ color: 'var(--dc-accent)' }} />
            {t('comp.title', { name: s.assistantName })}
          </h3>
          <button className="dc4-iconbtn" onClick={onClose}>
            <Icon n="x" size={16} />
          </button>
        </div>
        <div className="fl-pbody" ref={bodyRef}>
          <div className="fl-chat">
            {msgs.map((m, i) => (
              <div key={i} className={'fl-msg ' + (m.role === 'user' ? 'user' : 'ai')}>
                {m.content}
                {m.reasoning && <div className="fl-reason">{m.reasoning}</div>}
                {m.tools.length > 0 && <div className="fl-toolrow">{m.tools.map(toolchip)}</div>}
              </div>
            ))}
            {streaming && (
              <div className="fl-msg ai">
                {streaming.text}
                {streaming.reasoning && <div className="fl-reason">{streaming.reasoning}</div>}
                {streaming.tools.length > 0 && <div className="fl-toolrow">{streaming.tools.map(toolchip)}</div>}
              </div>
            )}
            {typing && !streaming && (
              <div className="fl-msg ai" style={{ color: 'var(--dc-ink-3)' }}>
                {t('comp.thinking', { name: s.assistantName })}
              </div>
            )}
            {error && <div className="fl-msg ai" style={{ color: 'var(--dc-err)' }}>{error}</div>}
          </div>
          {decision && (
            <div className="dc4-decision">
              <div style={{ fontWeight: 650, marginBottom: 6 }}>{decision.title}</div>
              {decision.summary && <div style={{ fontSize: 12.5, color: 'var(--dc-ink-2)', marginBottom: 8 }}>{decision.summary}</div>}
              <div className="fl-acts">
                {decision.options.map((o) => (
                  <button key={o.id} className="dc4-btn sm" onClick={() => decide(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="fl-pfoot" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="dc4-input"
            style={{ borderRadius: 999 }}
            placeholder={t('comp.placeholder', { name: s.assistantName })}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
          />
          <button className="dc4-btn" style={{ borderRadius: 999, width: 44, padding: 0, flex: 'none' }} onClick={() => void send()}>
            <Icon n="send" size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

const PREFS: { key: keyof api.SessionPrefs; icon: string }[] = [
  { key: 'morningBrief', icon: 'sun' },
  { key: 'eveningReview', icon: 'moon' },
  { key: 'deadlineAlerts', icon: 'bell' },
  { key: 'rollingReplan', icon: 'refresh' },
  { key: 'gapSuggestions', icon: 'sparkle' },
  { key: 'autoPlan', icon: 'zap' },
  { key: 'doNotDisturb', icon: 'eye-off' },
];

function prefTitle(key: string, t: Tr): string {
  if (key === 'morningBrief') return t('prefs.morningBrief');
  if (key === 'eveningReview') return t('prefs.eveningReview');
  if (key === 'deadlineAlerts') return t('prefs.deadlineAlerts');
  if (key === 'rollingReplan') return t('prefs.rollingReplan');
  if (key === 'gapSuggestions') return t('prefs.gapSuggestions');
  if (key === 'autoPlan') return t('prefs.autoPlan');
  return t('prefs.doNotDisturb');
}

function prefSub(key: string, t: Tr): string {
  if (key === 'morningBrief') return t('prefs.morningBriefSub');
  if (key === 'eveningReview') return t('prefs.eveningReviewSub');
  if (key === 'deadlineAlerts') return t('prefs.deadlineAlertsSub');
  if (key === 'rollingReplan') return t('prefs.rollingReplanSub');
  if (key === 'gapSuggestions') return t('prefs.gapSuggestionsSub');
  if (key === 'autoPlan') return t('prefs.autoPlanSub');
  return t('prefs.doNotDisturbSub');
}

function langName(loc: string, t: Tr): string {
  if (loc === 'zh-CN') return t('lang.zhCN');
  if (loc === 'en-US') return t('lang.enUS');
  return loc;
}

function paperName(id: string, t: Tr): string {
  if (id === 'sky') return t('paper.sky');
  if (id === 'sunset') return t('paper.sunset');
  if (id === 'night') return t('paper.night');
  return t('paper.nature');
}

const BUILTIN_SW: Record<string, [string, string]> = {
  sky: ['#2f6bff', '#f5f7fa'],
  sunset: ['#e0632a', '#efe3ce'],
  night: ['#4fc2ae', '#14161d'],
  nature: ['#2e9e63', '#f4f8f4'],
};

function Settings({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [name, setName] = useState(s.assistantName);
  const [desc, setDesc] = useState('');
  const [genErr, setGenErr] = useState('');
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);

  const swOf = (th: CustomTheme): [string, string] => [
    th.variables['--dc-accent'] ?? '#888',
    th.variables['--dc-surface'] ?? '#eee',
  ];

  const gen = async () => {
    const d = desc.trim();
    if (!d) return;
    setGenErr('');
    try {
      const res = await api.generateTheme(d);
      if (res.error || !res.variables) {
        setGenErr(res.message ?? res.error ?? t('set.aiErr'));
        return;
      }
      const dark = res.variables['--dc-bg'] ? isDark(res.variables) : false;
      await s.saveTheme({ name: d.slice(0, 12), dark, variables: res.variables });
      setDesc('');
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Panel title={t('set.title')} icon="sliders" onClose={onClose} label="settings">
      <div className="fl-sec">{t('set.paperBuiltin')}</div>
      <div className="fl-papers">
        {BUILTIN.map((id) => (
          <button key={id} className={'fl-paper' + (s.currentTheme === id ? ' on' : '')} onClick={() => void s.setTheme(id)}>
            <span className="sw" style={{ background: BUILTIN_SW[id]![1] }}>
              <i style={{ background: BUILTIN_SW[id]![0] }}></i>
            </span>
            <span className="nm">
              {paperName(id, t)}
              {id === 'night' && <span className="dk">{t('paper.dark')}</span>}
            </span>
            {s.currentTheme === id && (
              <span className="ck">
                <Icon n="check" size={11} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="fl-sec">
        {t('set.paperCustom')}
        <span className="n">{s.customThemes.length}</span>
      </div>
      {s.customThemes.map((th) => {
        const sw = swOf(th);
        return (
          <div key={th.id} className={'fl-it' + (s.currentTheme === th.id ? ' sel' : '')} style={{ alignItems: 'center' }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, flex: 'none', border: '1px solid rgba(0,0,0,.08)', background: 'linear-gradient(135deg,' + sw[1] + ' 46%,' + sw[0] + ' 54%)' }}></span>
            <div className="bd">
              <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {th.name}
                {th.dark && <span className="fl-tag">{t('paper.dark')}</span>}
              </div>
            </div>
            {s.currentTheme !== th.id && (
              <button className="x" style={{ opacity: 1, color: 'var(--dc-accent)', fontSize: 11.5, fontWeight: 650 }} onClick={() => void s.setTheme(th.id)}>
                {t('set.apply')}
              </button>
            )}
            <button className="x" title={t('set.delete')} onClick={() => void s.deleteTheme(th.id)}>
              <Icon n="trash" size={13} />
            </button>
          </div>
        );
      })}

      <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 650 }}>
          <Icon n="wand" size={14} style={{ color: 'var(--dc-accent)' }} />
          {t('set.aiPaper')}
        </div>
        <input
          className="dc4-input"
          style={{ height: 38, fontSize: 13 }}
          placeholder={t('set.aiPlaceholder')}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void gen()}
        />
        {genErr && <div style={{ fontSize: 11.5, color: 'var(--dc-err)' }}>{genErr}</div>}
        <button className="dc4-btn" disabled={!desc.trim()} onClick={() => void gen()}>
          <Icon n="sparkle" size={14} />
          {t('set.aiGen')}
        </button>
      </div>

      <div className="fl-sec">{t('set.assistant')}</div>
      <div className="fl-it" style={{ alignItems: 'center' }}>
        <Icon n="heart" size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
        <div className="bd">
          <div className="t">{t('set.assistantName')}</div>
          <div className="s">{t('set.assistantNameSub')}</div>
        </div>
        <input
          className="dc4-input"
          style={{ width: 110, height: 34, fontSize: 13, textAlign: 'right' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const v = name.trim(); if (v && v !== s.assistantName) void s.setAssistantName(v); }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <div className="fl-sec">{t('set.care')}</div>
      {PREFS.map((p) => (
        <div key={p.key} className="fl-it" style={{ alignItems: 'center' }}>
          <Icon n={p.icon} size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
          <div className="bd">
            <div className="t">{prefTitle(p.key, t)}</div>
            <div className="s">{prefSub(p.key, t)}</div>
          </div>
          <button
            className={'fl-switch' + (s.prefs?.[p.key] ? ' on' : '')}
            role="switch"
            aria-checked={!!s.prefs?.[p.key]}
            onClick={() => void s.setPref({ [p.key]: !s.prefs?.[p.key] })}
          ></button>
        </div>
      ))}

      <div className="fl-sec">{t('set.language')}</div>
      <div className="fl-seg">
        {s.availableLocales.map((loc) => (
          <button key={loc} className={s.locale === loc ? 'on' : ''} onClick={() => void s.setLanguage(loc)}>
            {langName(loc, t)}
          </button>
        ))}
      </div>

      <div className="fl-line" style={{ marginTop: 14 }}>
        <span className="lb">{t('set.about', { name: s.assistantName })}</span>
      </div>
    </Panel>
  );
}

function isDark(v: Record<string, string>): boolean {
  const bg = v['--dc-bg'];
  if (!bg) return false;
  const m = bg.match(/rgb((d+),s*(d+),s*(d+))/);
  if (m) return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 128;
  const hex = bg.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r + g + b) / 3 < 128;
  }
  return false;
}

function Rail({ onMore }: { onMore: () => void }) {
  const s = useStore();
  const t = s.t;
  const n = s.ops.filter((o) => o.actor === 'agent').length;
  return (
    <aside className="fl-rail">
      <MoodCheck onMore={onMore} />
      <div className="fl-rcard">
        <h5>{t('rail.quiet')}</h5>
        <p className="fl-rnote">
          {n > 0 ? t('rail.quietDone', { n }) : t('rail.quietEmpty')}
        </p>
      </div>
      <div className="fl-rcard">
        <h5>{t('rail.weekly')}</h5>
        <p className="fl-rnote">{t('rail.weeklyBody')}</p>
      </div>
    </aside>
  );
}

export { Materials, Outlook, Companion, Settings, Rail };
