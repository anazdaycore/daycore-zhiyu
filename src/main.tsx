import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';
import { Setting } from './Setting';
import { boot as bootUp, type Boot } from '@daycore/core';
import { isFirstRun } from '@daycore/core';
import { bootstrapCatalog, type Catalog } from '@daycore/core';
import * as api from '@daycore/core';
import { manifest } from './manifest';
import { applyTheme, initialThemeAttr } from './theme';

const SHIPPED = ['zh-CN', 'en-US'];

function Root() {
  // ⚠️ Evidence of a configured install skips this screen: a session token in
  // storage (the shared cross-frontend contract from core's http.ts — a
  // same-origin demo hands the token out directly) or a dc_sid cookie (the
  // demo hub sets one on every response, so an opened page already IS a
  // session). Sending either person to "which backend?" strands a working
  // install on the setting screen; boot instead and let a bad credential fail
  // visibly, where "edit address" stays one tap away.
  const [phase, setPhase] = useState<'setting' | 'booting' | 'up' | 'failed'>(() => {
    if (!isFirstRun()) return 'booting';
    try {
      if (localStorage.getItem('daycore.sessionToken')) return 'booting';
      if (/(?:^|;\s*)dc_sid=/.test(document.cookie)) return 'booting';
    } catch {
      /* storage unreadable — asking is the safe fallback */
    }
    return 'setting';
  });
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootCat, setBootCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    void bootstrapCatalog(SHIPPED).then(setBootCat);
  }, []);

  useEffect(() => {
    if (phase !== 'booting') return;
    let live = true;
    bootUp(manifest).then(
      (b) => {
        if (!live) return;
        document.documentElement.setAttribute('data-theme', initialThemeAttr(b.session.currentTheme));
        setBoot(b);
        setPhase('up');
        void api
          .themes()
          .then((r) => applyTheme(b.session.currentTheme, r.themes))
          .catch(() => {});
        if (b.deferred.length) {
          console.info('waiting on operator approval before these can be themed:', b.deferred.join(', '));
        }
      },
      (e) => {
        if (!live) return;
        const t = bootCat?.t ?? ((k: string) => k);
        setErr(
          api.isUnreachable(e)
            ? t('boot.unreachable')
            : e && typeof e === 'object' && 'kind' in e && (e as { kind: string }).kind === 'too-old'
              ? t('boot.tooOld', { version: String((e as { message: string }).message) })
              : e instanceof Error
                ? e.message
                : String(e),
        );
        setPhase('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [phase, bootCat]);

  if (!bootCat) return <div className="fl-setup" />;
  const t = bootCat.t;

  if (phase === 'setting') {
    return (
      <Setting
        cat={bootCat}
        onDone={() => setPhase('booting')}
        onLocale={() => void bootstrapCatalog(SHIPPED).then(setBootCat)}
      />
    );
  }
  if (phase === 'up' && boot) return <App boot={boot} />;
  if (phase === 'failed') {
    return (
      <div className="fl-setup">
        <div className="fl-frame">
          <div className="fl-main">
            <h1 className="fl-title-big md">{t('boot.failed.title')}</h1>
            <p className="fl-sub">{err}</p>
            <div className="fl-actrow">
              <button className="fl-btn pri" onClick={() => setPhase('setting')}>
                {t('boot.failed.editAddress')}
              </button>
              <button className="fl-btn sec" onClick={() => setPhase('booting')}>
                {t('boot.failed.retry')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fl-setup">
      <div className="fl-frame">
        <div className="fl-main">
          <p className="fl-sub">{t('boot.connecting')}</p>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
