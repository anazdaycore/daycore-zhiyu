import { useEffect, useRef, useState } from 'react';
import type { Boot } from '@daycore/core';
import type { TimeBlock } from '@daycore/core';
import { Icon } from './icons';
import { EARLIER_BATCH, StoreCtx, useAppStore, useStore } from './store';
import {
  BlockEntry,
  CandidatesOverlay,
  L0Group,
  MoodCheck,
  MoodEntry,
  MoodSheet,
  NoticeOverlay,
  OpLine,
  PropInsert,
  UndoBar,
} from './parts';
import { Companion, Materials, Outlook, Rail, Settings } from './panels';
import { fmtDate, fmtHM, relDay, toHM, type RelDay } from './stream';
import type { Item } from './compose';

// 一天是一篇日志。向上滚是过去，向下滚是预告 —— 滚动本身就是时间旅行。
// 导航退化成「回到现在」；足迹与今天是同一条流的不同滚动位置，没有历史页。

type Tr = (k: string, v?: Record<string, string | number>) => string;

function relLabel(rel: RelDay, t: Tr): string {
  if (rel === 'yesterday') return t('day.yesterday');
  if (rel === 'today') return t('day.today');
  if (rel === 'tomorrow') return t('day.tomorrow');
  return t('day.other');
}

export function App({ boot }: { boot: Boot }) {
  const store = useAppStore(boot);
  return (
    <StoreCtx.Provider value={store}>
      <Flow />
    </StoreCtx.Provider>
  );
}

function Flow() {
  const s = useStore();
  const t = s.t;
  const [panel, setPanel] = useState<string | null>(null);
  const [moodSheet, setMoodSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TimeBlock[] | null>(null);
  const [text, setText] = useState('');
  const [back, setBack] = useState(0);
  const scRef = useRef<HTMLDivElement | null>(null);
  const inRef = useRef<HTMLInputElement | null>(null);

  // 「一句话改期」等预填：放进输入条，不提交，用户改完自己发。
  useEffect(() => {
    if (s.prefillText !== null) {
      setText(s.prefillText);
      inRef.current?.focus();
      s.clearPrefill();
    }
  }, [s.prefillText, s.clearPrefill]);

  const toNow = (smooth: boolean) => {
    const el = document.getElementById('fl-nowline');
    const sc = scRef.current;
    if (!el || !sc) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - sc.clientHeight * 0.45;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    const id = window.setTimeout(() => toNow(false), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.today]);

  const onScroll = () => {
    const el = document.getElementById('fl-nowline');
    const sc = scRef.current;
    if (!el || !sc) return;
    const d = el.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight * 0.5;
    setBack(Math.abs(d) > 460 ? (d < 0 ? -1 : 1) : 0);
  };

  const submit = async () => {
    const txt = text.trim();
    if (!txt) return;
    setText('');
    inRef.current?.focus();
    const r = await s.captureIntent(txt);
    if (r.kind === 'notice') setNotice(r.message);
    else setCandidates(r.blocks);
  };

  const renderItem = (it: Item) => {
    switch (it.kind) {
      case 'river':
        return (
          <div className="fl-en tone-mute" key={it.key}>
            <span className="gut">{fmtDate(it.date, s.locale)}</span>
            <span className="dot"></span>
            <div className="fl-river">
              <span className="e">·</span>
              <span className="bar" style={{ width: 30 + it.count * 8 }}></span>
              <span>{t('river.line', { n: it.count })}</span>
            </div>
          </div>
        );
      case 'head': {
        const rel = relDay(it.date, s.today);
        const past = it.date < s.today;
        const future = it.date > s.today;
        return (
          <div className="fl-day" key={it.key}>
            <span className="lb">
              {relLabel(rel, t)}
              <span className="w">{fmtDate(it.date, s.locale)}</span>
            </span>
            {past && (
              <span className="rec">
                <Icon n="lock" size={11} />
                {t('day.past')}
              </span>
            )}
            {future && (
              <span className="rec">
                <Icon n="eye" size={11} />
                {t('day.future')}
              </span>
            )}
            <span className="ln"></span>
          </div>
        );
      }
      case 'block':
        return <BlockEntry key={it.key} b={it.block} date={it.date} />;
      case 'prop':
        return (
          <div className="fl-en tone-acc" key={it.key}>
            <span className="gut">{it.proposal.start ?? fmtHM(it.at, s.tz)}</span>
            <span className="dot"></span>
            <PropInsert p={it.proposal} onFollow={() => setPanel('companion')} />
          </div>
        );
      case 'wither':
        return (
          <div className="fl-en tone-mute" key={it.key}>
            <span className="gut">{fmtHM(it.at, s.tz)}</span>
            <span className="dot"></span>
            <div className="fl-wither">
              <Icon n="moon" size={12} />
              {t('wither.title', { title: it.proposal.title })}
            </div>
          </div>
        );
      case 'mood':
        return (
          <div className="fl-en tone-warn" key={it.key}>
            <span className="gut">{fmtHM(it.at, s.tz)}</span>
            <span className="dot"></span>
            <MoodEntry m={it.mood} />
          </div>
        );
      case 'op':
        return (
          <div className="fl-en tone-mute" key={it.key}>
            <span className="gut">{fmtHM(it.at, s.tz)}</span>
            <span className="dot"></span>
            <OpLine op={it.op} />
          </div>
        );
      case 'l0':
        return (
          <div className="fl-en tone-mute" key={it.key}>
            <span className="gut">{fmtHM(it.at, s.tz)}</span>
            <span className="dot"></span>
            <L0Group rows={it.rows} />
          </div>
        );
      case 'now':
        return (
          <div className="fl-now" id="fl-nowline" key={it.key}>
            <span className="chip">
              {t('stream.now')} · {toHM(s.nowMin)}
            </span>
            <span className="ln"></span>
          </div>
        );
      case 'moodcheck':
        return (
          <div className="fl-moodwrap" key={it.key}>
            <MoodCheck onMore={() => setMoodSheet(true)} />
          </div>
        );
    }
  };

  return (
    <div className="fl-app" data-screen-label="flow">
      <div className="dc4-bg"></div>
      <div className="fl-col">
        <div className="fl-scroll" ref={scRef} onScroll={onScroll}>
          <div className="fl-cover">
            <div className="brand">
              <span className="mark">
                <Icon n="book" size={17} />
              </span>
              <div>
                <h1>{t('cover.title')}</h1>
                <div className="sub">{t('cover.sub', { name: s.assistantName })}</div>
              </div>
              <span className="date">{fmtDate(s.today, s.locale)}</span>
            </div>
          </div>

          <div className="fl-more">
            <button className="dc4-btn sm ghost" onClick={() => void s.expandEarlier()}>
              <Icon n="chevron-up" size={13} />
              {t('more.earlier', { n: EARLIER_BATCH })}
            </button>
          </div>

          <div className="fl-stream">
            {s.items.map(renderItem)}
            <div className="fl-line" style={{ justifyContent: 'center', padding: '18px 0 0', color: 'var(--dc-ink-3)' }}>
              {t('stream.end')}
            </div>
          </div>
        </div>

        {back !== 0 && (
          <button className="fl-back" onClick={() => toNow(true)}>
            <Icon n={back < 0 ? 'chevron-down' : 'chevron-up'} size={14} />
            {t('stream.backToNow')}
          </button>
        )}

        <div className="fl-inputwrap">
          <div className="fl-inputbar">
            <input
              ref={inRef}
              placeholder={t('input.placeholder', { name: s.assistantName })}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
            <button className="send" disabled={!text.trim() || s.busy} onClick={() => void submit()}>
              <Icon n="arrow-up" size={16} />
            </button>
          </div>
          <div className="fl-hint">{t('input.hint')}</div>
        </div>
      </div>

      <Rail onMore={() => setMoodSheet(true)} />

      <nav className="fl-tabs">
        <button className={'fl-tab' + (panel === 'companion' ? ' on' : '')} onClick={() => setPanel(panel === 'companion' ? null : 'companion')}>
          <Icon n="chat" size={14} />
          {t('tabs.companion')}
        </button>
        <button className={'fl-tab' + (panel === 'materials' ? ' on' : '')} onClick={() => setPanel(panel === 'materials' ? null : 'materials')}>
          <Icon n="book" size={14} />
          {t('tabs.materials')}
        </button>
        <button className={'fl-tab' + (panel === 'outlook' ? ' on' : '')} onClick={() => setPanel(panel === 'outlook' ? null : 'outlook')}>
          <Icon n="zap" size={14} />
          {t('tabs.outlook')}
        </button>
        <button className={'fl-tab' + (panel === 'settings' ? ' on' : '')} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
          <Icon n="sliders" size={14} />
          {t('tabs.settings')}
        </button>
      </nav>

      {panel === 'materials' && <Materials onClose={() => setPanel(null)} />}
      {panel === 'outlook' && <Outlook onClose={() => setPanel(null)} />}
      {panel === 'companion' && <Companion onClose={() => setPanel(null)} />}
      {panel === 'settings' && <Settings onClose={() => setPanel(null)} />}

      {moodSheet && <MoodSheet onClose={() => setMoodSheet(false)} />}
      {notice && <NoticeOverlay title={notice} onClose={() => setNotice(null)} />}
      {candidates && <CandidatesOverlay blocks={candidates} onClose={() => setCandidates(null)} />}

      {s.error && <div className="fl-errline">{s.error}</div>}

      <UndoBar />
    </div>
  );
}
