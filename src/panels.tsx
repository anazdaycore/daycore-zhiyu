import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomTheme, DecisionCardFrame, ToolResultFrame, ToolStartFrame } from '@daycore/core';
import * as api from '@daycore/core';
import { Icon } from './icons';
import { isAiNotConfigured, useStore } from './store';
import { addDays, dayIsoInTZ } from './stream';
import { MoodCheck } from './parts';
import { applyTheme, BUILTIN } from './theme';

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
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cat, setCat] = useState('note');
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);
  // 导入令牌：浏览器插件用它把 Canvas 数据直推过来。
  const [token, setToken] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void api.importToken().then((r) => setToken(r.token ?? ''), () => { /* 读不到就显示未生成 */ });
  }, []);
  const rotateToken = () => {
    setTokenBusy(true);
    void api.rotateImportToken().then(
      (r) => { setToken(r.token ?? ''); setTokenBusy(false); },
      () => setTokenBusy(false),
    );
  };
  const copyToken = () => {
    void navigator.clipboard.writeText(token).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); },
      () => { /* 剪贴板不可用（非安全上下文）时令牌仍可手动选中 */ },
    );
  };
  const catName = (id: string) => s.categories.find((c) => c.id === id)?.name ?? id;
  const memSource = (source: string): string | null => {
    if (source === 'user') return t('mat.memUser');
    if (source === 'agent' || source === 'chat') return t('mat.memAgent');
    return null;
  };
  const enabledCats = s.categories.filter((c) => c.enabled);
  const submit = () => {
    const ttl = title.trim();
    if (!ttl) return;
    void s.createMaterial({ title: ttl, body: body.trim() || undefined, category: cat, source: 'user' });
    setTitle('');
    setBody('');
  };
  return (
    <Panel title={t('mat.title')} icon="book" onClose={onClose} label="materials">
      <div className="fl-sec">{t('mat.importSection')}</div>
      <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 7 }}>
        <div className="lb" style={{ fontSize: 12, color: 'var(--ink3)' }}>{t('mat.tokenDesc')}</div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            className="dc4-input"
            style={{ flex: '1 1 160px', height: 34, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >{token || t('mat.tokenNone')}</span>
          <button className="dc4-btn" disabled={tokenBusy} onClick={rotateToken}>
            {token ? t('mat.tokenRotate') : t('mat.tokenGenerate')}
          </button>
          {token !== '' && (
            <button className="dc4-btn" onClick={copyToken}>
              {copied ? t('mat.tokenCopied') : t('mat.tokenCopy')}
            </button>
          )}
        </div>
      </div>

      <div className="fl-sec">{t('mat.addSection')}</div>
      <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 7 }}>
        <input
          className="dc4-input"
          style={{ height: 36, fontSize: 13 }}
          placeholder={t('mat.addTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <input
          className="dc4-input"
          style={{ height: 36, fontSize: 13 }}
          placeholder={t('mat.addBody')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <select className="dc4-select" style={{ height: 34, fontSize: 12.5 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            {enabledCats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="dc4-btn sm" style={{ flex: 'none' }} disabled={!title.trim()} onClick={submit}>
            <Icon n="plus" size={14} />
            {t('mat.add')}
          </button>
        </div>
      </div>
      <div className="fl-sec">
        {t('mat.lib')}
        <span className="n">{s.materials.length}</span>
      </div>
      {s.materials.length === 0 && <div className="fl-line"><span className="lb">{t('mat.empty', { name: s.assistantName })}</span></div>}
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

      <div className="fl-sec">
        {t('mat.mem')}
        <span className="n">{s.memories.length}</span>
      </div>
      {s.memories.length === 0 && <div className="fl-line"><span className="lb">{t('mat.memEmpty')}</span></div>}
      {s.memories.map((m) => (
        <div key={m.id} className="fl-it">
          {memSource(m.source) && (
            <span className="fl-tag" style={{ marginTop: 2, color: 'var(--dc-accent)', background: 'var(--dc-accent-soft)' }}>
              {memSource(m.source)}
            </span>
          )}
          <div className="bd">
            <div className="t">{m.fact}</div>
          </div>
          <button className="x" onClick={() => void s.deleteMemory(m.id)}>
            <Icon n="trash" size={14} />
          </button>
        </div>
      ))}
    </Panel>
  );
}

// 原型的绝对式截止标签：今天/明天 HH:MM，其余「周日 8月16日 HH:MM」。
// locale 跟 document.documentElement.lang，缺省交给 Intl。
function dueLabel(due: string, t: Tr, tz?: string): string {
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  const lang = typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined;
  const zone = tz || undefined;
  const hm = new Intl.DateTimeFormat(lang, { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const date = dayIsoInTZ(d.getTime(), tz);
  const today = api.todayIsoInTZ(tz);
  if (date === today) return t('out.today') + ' ' + hm;
  if (date === addDays(today, 1)) return t('out.tomorrow') + ' ' + hm;
  const wd = new Intl.DateTimeFormat(lang, { timeZone: zone, weekday: 'short' }).format(d);
  const md = new Intl.DateTimeFormat(lang, { timeZone: zone, month: 'long', day: 'numeric' }).format(d);
  return wd + ' ' + md + ' ' + hm;
}

// 原型 radar() 的紧迫度：<26h 橙、<76h accent、其余灰。
function urgencyOf(dueAt: string | undefined): number {
  if (!dueAt) return 0;
  const ms = new Date(dueAt).getTime();
  if (Number.isNaN(ms)) return 0;
  const dh = (ms - Date.now()) / 3600e3;
  return dh < 26 ? 2 : dh < 76 ? 1 : 0;
}

function Outlook({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [wish, setWish] = useState('');
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);
  const active = s.wishes.filter((w) => w.status === 'active');
  const ordered = [...s.wishes].sort((a, b) => {
    const rank = (st: string) => (st === 'active' ? 0 : st === 'done' ? 1 : 2);
    return rank(a.status as string) - rank(b.status as string);
  });
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
      {s.assignments.filter((a) => a.status === 'pending').map((a) => {
        const course = a.courseId ? s.courses.find((c) => c.id === a.courseId) : undefined;
        return (
          <div key={a.id} className="fl-it" style={{ alignItems: 'center' }}>
            <span className="fl-u" data-u={urgencyOf(a.dueAt)}></span>
            <div className="bd">
              <div className="t">{a.title}</div>
              {course && <div className="s">{course.courseCode || course.name}</div>}
            </div>
            {a.dueAt && <span className="fl-dl">{dueLabel(a.dueAt, s.t, s.tz)}</span>}
          </div>
        );
      })}
      <div className="fl-sec">
        {t('out.wishes')}
        <span className="n">{active.length}</span>
      </div>
      {ordered.map((w) => {
        const st = w.status as string;
        const isDone = st === 'done';
        const isDropped = st === 'dropped';
        return (
          <div key={w.id} className="fl-it" style={{ alignItems: 'center', opacity: isDropped ? 0.5 : 1 }}>
            <Icon n="star" size={14} style={{ color: 'var(--dc-warn)', marginTop: 3 }} />
            <div className="bd">
              <div className="t" style={isDone ? { textDecoration: 'line-through', color: 'var(--dc-ink-3)' } : undefined}>{w.title}</div>
              <div className="s">
                {w.effortMin ? t('out.wishEffort', { n: w.effortMin }) : t('out.wishHint')}
              </div>
            </div>
            {isDone && <Icon n="check" size={14} style={{ color: 'var(--dc-ok)' }} />}
            {isDropped && <span className="fl-tag">{t('out.wishDrop')}</span>}
            {!isDone && !isDropped && (
              <>
                <button className="fl-act ok" title={t('out.wishDone')} onClick={() => void s.updateWish(w.id, { status: 'done' }, t('undo.wishDone', { title: w.title }))}>
                  <Icon n="check" size={14} />
                </button>
                <button className="fl-act" title={t('out.wishDrop')} onClick={() => void s.updateWish(w.id, { status: 'dropped' }, t('undo.wishDrop', { title: w.title }))}>
                  <Icon n="x" size={13} />
                </button>
              </>
            )}
          </div>
        );
      })}
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

// 内部独白默认收起：一条「想了一下」折叠条，展开才见原文。
function ReasonFold({ reasoning }: { reasoning: string }) {
  const s = useStore();
  const t = s.t;
  const [open, setOpen] = useState(false);
  return (
    <div className="fl-reasonfold">
      <button onClick={() => setOpen(!open)}>
        <Icon n={open ? 'chevron-down' : 'chevron-right'} size={11} />
        {t('comp.thought')}
      </button>
      {open && <div className="fl-reason">{reasoning}</div>}
    </div>
  );
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
  const frRef = useRef<HTMLInputElement | null>(null);

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
        setError(isAiNotConfigured(e) ? t('err.aiNotConfigured') : e instanceof Error ? e.message : String(e));
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
            {msgs.length === 0 && !streaming && !typing && !error && (
              <div className="fl-msg ai" style={{ color: 'var(--dc-ink-3)' }}>
                {t('comp.empty', { name: s.assistantName })}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={'fl-msg ' + (m.role === 'user' ? 'user' : 'ai')}>
                {m.content}
                {m.reasoning && <ReasonFold reasoning={m.reasoning} />}
                {m.tools.length > 0 && <div className="fl-toolrow">{m.tools.map(toolchip)}</div>}
              </div>
            ))}
            {streaming && (
              <div className="fl-msg ai">
                {streaming.reasoning && !streaming.text && (
                  <div className="fl-reason-hint">{t('comp.thinkingShort')}</div>
                )}
                {streaming.text}
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
          <button className="dc4-iconbtn solid" title={t('comp.attach')} onClick={() => frRef.current?.click()}>
            <Icon n="link" size={16} />
          </button>
          <input
            ref={frRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              e.target.value = '';
              const kb = Math.round(f.size / 1024);
              void s.createMaterial({ title: f.name, body: t('comp.attachBody', { n: kb }), source: 'upload' });
              setMsgs((m) => [...m, { role: 'user', content: t('comp.attachUser', { name: f.name }), tools: [] }]);
            }}
          />
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

const CH_ICON: Record<string, string> = { qq: 'chat', telegram: 'send', onebot: 'chat', slack: 'chat', wechat: 'chat', discord: 'chat' };
const CAT_ICON: Record<string, string> = {
  note: 'pencil',
  diet: 'file',
  health: 'heart',
  academic: 'book',
  travel: 'send',
  finance: 'file',
  fitness: 'refresh',
  idea: 'sparkle',
  shopping: 'file',
  media: 'file',
};
function channelIcon(name: string): string {
  return CH_ICON[name] ?? 'link';
}
function catIcon(id: string): string {
  return CAT_ICON[id] ?? 'file';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 账户卡：已登录→头像字+姓名+邮箱·已同步+退出；未登录→匿名会话+登录/注册表单。
function AccountSection() {
  const s = useStore();
  const t = s.t;
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (!EMAIL_RE.test(email.trim())) {
      setErr(t('auth.emailInvalid'));
      return;
    }
    if (password.length < 8) {
      setErr(t('auth.passwordShort'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await s.login(email.trim(), password);
      else await s.register(email.trim(), password, name.trim() || undefined);
      setShowForm(false);
      setPassword('');
    } catch {
      setErr(t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    setBusy(true);
    try {
      await s.logout();
    } catch {
      /* logout is best-effort; me() will re-read the real state */
    } finally {
      setBusy(false);
    }
  };

  if (s.user) {
    const initial = (s.user.name?.[0] || s.user.email?.[0] || '?').toUpperCase();
    return (
      <>
        <div className="fl-sec">{t('auth.account')}</div>
        <div className="fl-it" style={{ alignItems: 'center' }}>
          <span className="dc4-avatar">{initial}</span>
          <div className="bd">
            <div className="t">{s.user.name || s.user.email || ''}</div>
            <div className="s">{t('auth.signedInSub', { email: s.user.email || '' })}</div>
          </div>
          <button className="dc4-btn sm sec" disabled={busy} onClick={() => void doLogout()}>
            {t('auth.signOut')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fl-sec">{t('auth.account')}</div>
      {!showForm ? (
        <div className="fl-it" style={{ alignItems: 'center' }}>
          <span className="dc4-avatar">?</span>
          <div className="bd">
            <div className="t">{t('auth.anonymous')}</div>
            <div className="s">{t('auth.anonymousSub')}</div>
          </div>
          <button className="dc4-btn sm" onClick={() => setShowForm(true)}>
            {t('auth.login')} / {t('auth.signup')}
          </button>
        </div>
      ) : (
        <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 7 }}>
          {mode === 'signup' && (
            <input
              className="dc4-input"
              style={{ height: 38, fontSize: 13 }}
              placeholder={t('auth.namePh')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          )}
          <input
            className="dc4-input"
            style={{ height: 38, fontSize: 13 }}
            placeholder={t('auth.emailPh')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          <input
            className="dc4-input"
            style={{ height: 38, fontSize: 13 }}
            type="password"
            placeholder={t('auth.passwordPh')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {err && <div style={{ fontSize: 11.5, color: 'var(--dc-err)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="dc4-btn" disabled={busy || !email.trim() || !password} onClick={() => void submit()}>
              {mode === 'login' ? t('auth.submitLogin') : t('auth.submitSignup')}
            </button>
            <button className="dc4-btn sm sec" onClick={() => { setShowForm(false); setErr(''); }}>
              {t('auth.cancel')}
            </button>
          </div>
          <button
            className="dc4-btn sm ghost"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }}
          >
            {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
          </button>
        </div>
      )}
    </>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const t = s.t;
  const [name, setName] = useState(s.assistantName);
  const [persona, setPersona] = useState(s.personaPrompt);
  const [desc, setDesc] = useState('');
  const [genErr, setGenErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; dark: boolean; base?: string; variables: Record<string, string> } | null>(null);
  const [bindFor, setBindFor] = useState<{ label: string; token: string } | null>(null);
  const [unbind, setUnbind] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renVal, setRenVal] = useState('');
  useEffect(() => { void s.loadPanels(); }, [s.loadPanels]);
  useEffect(() => () => { applyTheme(s.currentTheme, s.customThemes); }, [s.currentTheme, s.customThemes]);

  const swOf = (th: CustomTheme): [string, string] => [
    th.variables['--dc-accent'] ?? '#888',
    th.variables['--dc-surface'] ?? '#eee',
  ];

  const applyT = (id: string) => {
    setPreview(null);
    setDelId(null);
    void s.setTheme(id);
  };

  const gen = async () => {
    const d = desc.trim();
    if (!d || busy) return;
    setBusy(true);
    setGenErr('');
    try {
      const res = await api.generateTheme(d);
      if (res.error || !res.variables) {
        setGenErr(res.message ?? res.error ?? t('set.aiErr'));
        return;
      }
      const extra = res as { name?: string; dark?: boolean; base?: string };
      const candidate = {
        name: (extra.name ?? d).slice(0, 24),
        dark: Boolean(extra.dark),
        base: extra.base,
        variables: res.variables,
      };
      setPreview(candidate);
      // Live preview, nothing saved yet: apply as a throwaway theme.
      applyTheme('__preview__', [
        { id: '__preview__', familyId: 'zhiyu', name: candidate.name, dark: candidate.dark, base: candidate.base, variables: candidate.variables },
      ]);
    } catch (e) {
      setGenErr(isAiNotConfigured(e) ? t('err.aiNotConfigured') : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelP = () => {
    setPreview(null);
    applyTheme(s.currentTheme, s.customThemes);
  };

  const saveP = async () => {
    if (!preview) return;
    await s.saveTheme({ name: preview.name, base: preview.base, dark: preview.dark, variables: preview.variables });
    setPreview(null);
    setDesc('');
  };

  const bind = async (ch: { name: string; label: string }) => {
    try {
      const r = await api.bindChannel(ch.name);
      setBindFor({ label: ch.label || ch.name, token: r.token });
    } catch {
      setBindFor(null);
    }
  };

  const doUnbind = async (chName: string) => {
    setUnbind(null);
    try {
      await api.unbindChannel(chName);
      await s.loadPanels();
    } catch {
      /* loadPanels re-reads the real binding state */
    }
  };

  const footer = preview ? (
    <div className="fl-prevrow">
      <Icon n="wand" size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
      <span className="nm">{t('set.aiPreview', { name: preview.name })}</span>
      <button className="dc4-btn sm sec" onClick={() => void gen()} disabled={busy}>
        {busy ? '…' : t('set.aiRetry')}
      </button>
      <button className="dc4-btn sm sec" onClick={cancelP}>
        {t('set.aiCancel')}
      </button>
      <button className="dc4-btn sm" onClick={() => void saveP()}>
        {t('set.aiSave')}
      </button>
    </div>
  ) : undefined;

  return (
    <Panel title={t('set.title')} icon="sliders" onClose={onClose} label="settings" footer={footer}>
      <AccountSection />
      <div className="fl-sec">{t('set.paperBuiltin')}</div>
      <div className="fl-papers">
        {BUILTIN.map((id) => (
          <button key={id} className={'fl-paper' + (s.currentTheme === id ? ' on' : '')} onClick={() => applyT(id)}>
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
              {renameId === th.id ? (
                <input
                  className="dc4-input"
                  style={{ height: 30, fontSize: 12.5 }}
                  autoFocus
                  value={renVal}
                  onChange={(e) => setRenVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renVal.trim()) {
                      void s.renameTheme(th.id, renVal.trim());
                      setRenameId(null);
                    }
                    if (e.key === 'Escape') setRenameId(null);
                  }}
                  onBlur={() => {
                    if (renVal.trim()) void s.renameTheme(th.id, renVal.trim());
                    setRenameId(null);
                  }}
                />
              ) : (
                <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {th.name}
                  {th.dark && <span className="fl-tag">{t('paper.dark')}</span>}
                  {s.currentTheme === th.id && <Icon n="check" size={12} style={{ color: 'var(--dc-accent)' }} />}
                </div>
              )}
            </div>
            {s.currentTheme !== th.id && (
              <button className="x" style={{ opacity: 1, color: 'var(--dc-accent)', fontSize: 11.5, fontWeight: 650 }} onClick={() => applyT(th.id)}>
                {t('set.apply')}
              </button>
            )}
            <button
              className="x"
              title={t('set.rename')}
              onClick={() => {
                setRenameId(th.id);
                setRenVal(th.name);
              }}
            >
              <Icon n="pencil" size={13} />
            </button>
            <button
              className="x"
              title={t('set.delete')}
              style={delId === th.id ? { opacity: 1, color: 'var(--dc-err)', fontSize: 11, fontWeight: 700 } : undefined}
              onClick={() => {
                if (delId !== th.id) {
                  setDelId(th.id);
                  setTimeout(() => setDelId((d) => (d === th.id ? null : d)), 2600);
                  return;
                }
                void s.deleteTheme(th.id);
                setDelId(null);
              }}
            >
              {delId === th.id ? t('set.deleteConfirm') : <Icon n="trash" size={13} />}
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
        <button className="dc4-btn" disabled={busy || !desc.trim()} onClick={() => void gen()}>
          <Icon n="sparkle" size={14} />
          {busy ? t('set.aiGenBusy') : t('set.aiGen')}
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
      <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 650 }}>
          <Icon n="sparkle" size={14} style={{ color: 'var(--dc-accent)' }} />
          {t('set.personaTitle')}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--dc-ink-3)' }}>{t('set.personaSub')}</div>
        <textarea
          className="fl-ta"
          rows={4}
          maxLength={2000}
          placeholder={t('set.personaPlaceholder')}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          onBlur={() => void s.setPersonaPrompt(persona)}
        ></textarea>
        <div style={{ fontSize: 10.5, color: 'var(--dc-ink-3)' }}>{t('set.personaCount', { n: persona.length })}</div>
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

      {/* 通知渠道：只读列出 + 绑定/解绑（verify 是机器人侧，前端不代做） */}
      <div className="fl-sec">{t('set.channels')}</div>
      {s.channels.map((ch) => {
        const binding = s.channelBindings.find((b) => b.channel === ch.name);
        return (
          <div key={ch.name} className="fl-it" style={{ alignItems: 'center' }}>
            <Icon n={channelIcon(ch.name)} size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
            <div className="bd">
              <div className="t">{ch.label || ch.name}{binding ? ' · ' + t('set.channelBound') : ''}</div>
              <div className="s">{binding ? binding.externalId : t('set.channelUnbound')}</div>
            </div>
            {binding ? (
              <button
                className="dc4-btn sm sec"
                onClick={() => {
                  if (unbind !== ch.name) {
                    setUnbind(ch.name);
                    setTimeout(() => setUnbind((u) => (u === ch.name ? null : u)), 2600);
                    return;
                  }
                  void doUnbind(ch.name);
                }}
              >
                {unbind === ch.name ? t('set.channelConfirmUnbind') : t('set.channelUnbind')}
              </button>
            ) : (
              <button className="dc4-btn sm" onClick={() => void bind(ch)}>
                {t('set.channelBind')}
              </button>
            )}
          </div>
        );
      })}
      {bindFor && (
        <div className="fl-it" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--dc-ink-2)' }}>{t('set.channelToken', { name: bindFor.label })}</div>
          <div className="fl-token">
            <Icon n="key" size={14} style={{ color: 'var(--dc-accent)' }} />
            <span style={{ flex: 1 }}>{bindFor.token}</span>
            <button className="x" style={{ opacity: 1 }} onClick={() => { try { void navigator.clipboard.writeText(bindFor.token); } catch { /* noop */ } }}>
              <Icon n="copy" size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="dc4-btn sm sec" onClick={() => setBindFor(null)}>{t('set.channelCancel')}</button>
          </div>
        </div>
      )}
      <div className="fl-line" style={{ color: 'var(--dc-ink-3)' }}><span className="lb">{t('set.channelBudget')}</span></div>

      {/* 记录类别：note 是基础类别不可关（后端拒 note:false） */}
      <div className="fl-sec">{t('set.categories')}</div>
      {s.categories.map((c) => (
        <div key={c.id} className="fl-it" style={{ alignItems: 'center' }}>
          <Icon n={catIcon(c.id)} size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
          <div className="bd">
            <div className="t">{c.name}</div>
            {c.id === 'note' && <div className="s">{t('set.categoryLocked')}</div>}
          </div>
          {c.id === 'note' ? (
            <Icon n="check" size={14} style={{ color: 'var(--dc-ink-3)' }} />
          ) : (
            <button
              className={'fl-switch' + (c.enabled ? ' on' : '')}
              role="switch"
              aria-checked={c.enabled}
              onClick={() => void s.setPref({ materialCategories: { [c.id]: !c.enabled } })}
            ></button>
          )}
        </div>
      ))}

      <div className="fl-sec">{t('set.rhythm')}</div>
      {s.rhythm && (
        <div className="fl-it" style={{ alignItems: 'center' }}>
          <Icon n="moon" size={15} style={{ color: 'var(--dc-accent)', flex: 'none' }} />
          <div className="bd">
            <div className="t">{t('set.rhythmAbout', { sleep: s.rhythm.sleep, wake: s.rhythm.wake })}</div>
            <div className="s">{s.rhythm.source === 'pinned' ? t('set.rhythmPinned') : t('set.rhythmLearned')}</div>
          </div>
          {s.rhythm.source === 'pinned' ? (
            <Icon n="check" size={14} style={{ color: 'var(--dc-ok)' }} />
          ) : (
            <button
              className="dc4-btn sm sec"
              onClick={() => void s.pinRhythm(s.rhythm!.wake, s.rhythm!.sleep)}
            >
              {t('set.rhythmPin')}
            </button>
          )}
        </div>
      )}

      <div className="fl-sec">{t('set.language')}</div>
      <div className="fl-seg">
        {s.availableLocales.map((loc) => (
          <button key={loc} className={s.locale === loc ? 'on' : ''} onClick={() => void s.setLanguage(loc)}>
            {langName(loc, t)}
          </button>
        ))}
      </div>

      {/* 作息节律 / 演示场景 / 重新播种：无前端端点（节律为服务端学习态、场景为 mock），
          按「诚实呈现」原则省略，不搭空壳 —— 见 flow-settings.jsx 对应段。 */}
      <div className="fl-line" style={{ marginTop: 14 }}>
        <span className="lb">{t('set.about', { name: s.assistantName })}</span>
      </div>
    </Panel>
  );
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
        <p className="fl-rnote" style={{ whiteSpace: 'pre-wrap' }}>{s.weeklyLetter ? s.weeklyLetter.body : t('rail.weeklyBody')}</p>
      </div>
    </aside>
  );
}

export { Materials, Outlook, Companion, Settings, Rail };
