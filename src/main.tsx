import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';
import { Setting } from './Setting';
import { boot as bootUp, type Boot } from '@daycore/core';
// 不再有开屏：地址默认同源。见下方 Root() 的说明。
import { bootstrapCatalog, type Catalog } from '@daycore/core';
import * as api from '@daycore/core';
import { FAMILY_ID, manifest } from './manifest';
import { applyTheme, initialThemeAttr } from './theme';

const SHIPPED = ['zh-CN', 'en-US'];

function Root() {
  // ⚠️ 没有开屏。地址默认同源（core 的 backendBase() 返回 ""，请求都是相对的
  // /api/…）—— 前端和后端放在一起时这才是对的，而那正是常态。
  // Setting 没删，只降级成恢复路径：连不上时 failed 屏上还有「改一下地址」。
  const [phase, setPhase] = useState<'setting' | 'booting' | 'up' | 'failed'>('booting');
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
        document.documentElement.setAttribute('data-theme', initialThemeAttr(api.themeForFamily(b.session, FAMILY_ID)));
        setBoot(b);
        setPhase('up');
        void api
          .themes()
          .then((r) => applyTheme(api.themeForFamily(b.session, FAMILY_ID), r.themes))
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
