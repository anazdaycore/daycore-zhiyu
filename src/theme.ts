import type { CustomTheme } from '@daycore/core';
import { TOKENS } from './manifest';

// 纸就是纸，主题就是「把这一族的 token 挂到 :root 上」。
//
// # 内置主题走 data-theme，自定义主题走逐条 setProperty
//
// theme.css 为四个内置主题（sky/sunset/night/nature）各写了一段
// html[data-theme=...]，那是「纸色 + 底纹」的真源（HANDOFF 06-design-tokens）。
// 自定义主题没有静态 CSS 段落，它靠 base（dark?'night':(base||'sky')）继承
// 深浅文字的整套处理，再把自己的 variables 逐条写到 :root 覆盖底座 —— 这正是
// docs/specs/frontend-manifest.md 写的应用方式。
//
// ⚠️ 变量名是 manifest 的 token 空间，不是随便一组 --x。后端按这个 build 的
// token 空间校验过存进库里的 themes.variables，所以这里拿到什么就写什么，且
// 必须是这些名字，否则主题编辑器给一个「改了不起作用」的变量。

export const BUILTIN = ['sky', 'sunset', 'night', 'nature'] as const;

const TOKEN_NAMES = TOKENS.map((t) => t.name);

export function isBuiltin(id: string): boolean {
  return (BUILTIN as readonly string[]).includes(id);
}

/**
 * Apply one theme to the document. Custom themes fall back to their base (or
 * sky) so the deep/light ink treatment is inherited, then override token by
 * token; builtin ids just set the attribute and clear any prior inline vars.
 */
export function applyTheme(id: string | undefined, custom: CustomTheme[]): void {
  const el = document.documentElement;
  for (const name of TOKEN_NAMES) el.style.removeProperty(name);

  const chosen = id || 'sky';
  const found = custom.find((t) => t.id === chosen);
  if (found) {
    el.setAttribute('data-theme', found.dark ? 'night' : found.base || 'sky');
    for (const [k, v] of Object.entries(found.variables)) {
      if (v) el.style.setProperty(k, v);
    }
  } else {
    el.setAttribute('data-theme', isBuiltin(chosen) ? chosen : 'sky');
  }
}

/** The attribute value for a first paint, before custom themes have loaded. */
export function initialThemeAttr(id: string | undefined): string {
  const chosen = id || 'sky';
  return isBuiltin(chosen) ? chosen : 'sky';
}
