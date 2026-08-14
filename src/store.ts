import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from '@daycore/core';
import { FAMILY_ID } from './manifest';
import type {
  Boot,
  ChannelBinding,
  Course,
  CustomTheme,
  DayPlan,
  Material,
  MaterialCategory,
  Assignment,
  MemoryFact,
  MoodCheckin,
  MoodKind,
  OperationLog,
  Proposal,
  Rhythm,
  SessionPrefs,
  TimeBlock,
  User,
  WeeklyLetter,
  Wish,
} from '@daycore/core';

interface ChannelInfo {
  name: string;
  label: string;
  available: boolean;
}
import { compose, phaseOf as composePhaseOf, type Item, type Phase, type RiverDay } from './compose';
import { applyTheme } from './theme';
import { addDays, fmtHM } from './stream';

// 纸屿's state. No optimistic updates, for the reason that matters MORE here
// than anywhere else: the ledger is the whole premise. A stale block sits in a
// document that otherwise looks authoritative, and "the ledger is what
// happened" is the product. 409 (locked / petrified / refish_capped) is a real
// answer the server gives, so every write reads the body and offers the way out.

export interface UndoOffer {
  opId: string;
  label: string;
}

/** The 409 body api/openapi.yaml names PlanBlocked. */
export interface PlanBlocked {
  code: string;
  confirmable: boolean;
  lockLevel?: string;
  lockReason?: string;
  message?: string;
  blockId?: string;
}

export function blockedOf(e: unknown): PlanBlocked | null {
  if (e instanceof api.ApiError && e.status === 409 && e.body && typeof e.body === 'object') {
    const b = e.body as Record<string, unknown>;
    return {
      code: String(b.code ?? ''),
      confirmable: Boolean(b.confirmable),
      lockLevel: typeof b.lockLevel === 'string' ? b.lockLevel : undefined,
      lockReason: typeof b.lockReason === 'string' ? b.lockReason : undefined,
      message: typeof b.message === 'string' ? b.message : undefined,
      blockId: typeof b.blockId === 'string' ? b.blockId : undefined,
    };
  }
  return null;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 503 ai_not_configured：不是坏了，是后端还没接上 AI。 */
export function isAiNotConfigured(e: unknown): boolean {
  return e instanceof api.ApiError && e.code === 'ai_not_configured';
}

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const UNDO_MS = 5600;

export type CaptureResult =
  | { kind: 'candidates'; blocks: TimeBlock[] }
  | { kind: 'notice'; message: string };

/** A block edit that either succeeded (opId for the undo bar) or was refused. */
export type BlockEdit =
  | { ok: true; opId: string | null; label: string }
  | { ok: false; blocked: PlanBlocked };

export interface Store {
  t: Boot['catalog']['t'];
  locale: string;
  availableLocales: string[];
  assistantName: string;
  currentTheme: string;

  plans: Record<string, DayPlan>;
  proposals: Proposal[];
  moodKinds: MoodKind[];
  moods: MoodCheckin[];
  ops: OperationLog[];
  earlierDays: RiverDay[];
  items: Item[];

  materials: Material[];
  categories: MaterialCategory[];
  assignments: Assignment[];
  courses: Course[];
  wishes: Wish[];
  memories: MemoryFact[];
  prefs: SessionPrefs | null;
  rhythm: Rhythm | null;
  weeklyLetter: WeeklyLetter | null;
  customThemes: CustomTheme[];
  channels: ChannelInfo[];
  channelBindings: ChannelBinding[];

  busy: boolean;
  error: string;
  undo: UndoOffer | null;
  flash: string | null;
  prefillText: string | null;
  today: string;
  tz: string;
  nowMin: number;
  nowMs: number;

  refresh: () => Promise<void>;
  loadPanels: () => Promise<void>;
  expandEarlier: () => Promise<void>;
  takeBack: () => Promise<void>;
  undoOp: (opId: string) => Promise<boolean>;
  clearUndo: () => void;
  showFlash: (msg: string) => void;
  prefill: (text: string) => void;
  clearPrefill: () => void;

  phaseOf: (b: TimeBlock, date: string) => Phase;
  complete: (b: TimeBlock, date: string) => Promise<void>;
  moveToTomorrow: (b: TimeBlock, date: string, confirm?: boolean) => Promise<BlockEdit>;
  removeBlock: (b: TimeBlock, date: string) => Promise<BlockEdit>;
  setNote: (b: TimeBlock, date: string, note: string) => Promise<void>;
  markConflict: (b: TimeBlock, date: string) => Promise<void>;
  proposeReschedule: (blockId: string) => Promise<void>;
  setLock: (b: TimeBlock, date: string, level: 'none' | 'soft' | 'hard') => Promise<BlockEdit>;

  answer: (p: Proposal, accept: boolean) => Promise<void>;
  take: (p: Proposal, rowId: string) => Promise<void>;
  recordMood: (moodId: string, note: string) => Promise<void>;
  captureIntent: (text: string) => Promise<CaptureResult>;
  addCandidate: (b: TimeBlock) => Promise<void>;

  createWish: (title: string, note: string, effortMin: number | null) => Promise<void>;
  updateWish: (id: string, changes: { status?: 'active' | 'done' | 'dropped' }, label?: string) => Promise<void>;
  deleteWish: (id: string) => Promise<void>;
  createMaterial: (m: { title: string; body?: string; summary?: string; category?: string; tags?: string[]; source?: string }) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  personaPrompt: string;
  user: User | null;
  setPref: (p: Partial<SessionPrefs>) => Promise<void>;
  pinRhythm: (wake: string, sleep: string) => Promise<void>;
  setTheme: (id: string) => Promise<void>;
  saveTheme: (t: { name: string; base?: string; dark?: boolean; variables: Record<string, string> }) => Promise<void>;
  deleteTheme: (id: string) => Promise<void>;
  renameTheme: (id: string, name: string) => Promise<void>;
  setLanguage: (locale: string) => Promise<void>;
  setAssistantName: (name: string) => Promise<void>;
  setPersonaPrompt: (prompt: string) => Promise<void>;
  loadUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;

  moodLabel: (id: string) => MoodKind | undefined;
  fmtHM: (ms: number, tz?: string) => string;
}

export const StoreCtx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('store not mounted');
  return s;
}

export function useAppStore(boot: Boot): Store {
  const t = boot.catalog.t;
  // 「今天/现在」跟会话时区走，别跟浏览器走（demo 播种 vs 验收机时区不同）。
  const TZ = api.sessionTimezone(boot.session);
  const [plans, setPlans] = useState<Record<string, DayPlan>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [moodKinds, setMoodKinds] = useState<MoodKind[]>([]);
  const [moods, setMoods] = useState<MoodCheckin[]>([]);
  const [ops, setOps] = useState<OperationLog[]>([]);
  const [earlierDays, setEarlierDays] = useState<RiverDay[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [prefs, setPrefs] = useState<SessionPrefs | null>(null);
  const [rhythm, setRhythm] = useState<Rhythm | null>(null);
  const [weeklyLetter, setWeeklyLetter] = useState<WeeklyLetter | null>(null);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [channelBindings, setChannelBindings] = useState<ChannelBinding[]>([]);
  const [assistantName, setAssistantNameState] = useState(boot.session.assistantName);
  const [currentTheme, setCurrentTheme] = useState(api.themeForFamily(boot.session, FAMILY_ID) || 'sunset');
  const [personaPrompt, setPersonaPromptState] = useState(() => boot.session.personaPrompt ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocale] = useState(boot.catalog.locale);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<UndoOffer | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState<string | null>(null);
  const [today, setToday] = useState(() => api.todayIsoInTZ(TZ));
  const [nowMin, setNowMin] = useState(() => api.nowMinutesInTZ(TZ));
  const [nowMs, setNowMs] = useState(() => Date.now());

  // ⚠️ date must roll over at midnight, not freeze at mount. A ledger that
  // keeps yesterday's "today" after midnight draws the now line in the wrong
  // day and re-issues writes against a date the server already left.
  useEffect(() => {
    const h = setInterval(() => {
      setNowMin(api.nowMinutesInTZ(TZ));
      setNowMs(Date.now());
      const d = api.todayIsoInTZ(TZ);
      setToday((prev) => (prev === d ? prev : d));
    }, 30_000);
    return () => clearInterval(h);
  }, []);

  const refresh = useCallback(async () => {
    const base = api.todayIsoInTZ(TZ);
    const y = addDays(base, -1);
    const tm = addDays(base, 1);
    try {
      const [range, ps, kinds, hist, log] = await Promise.all([
        api.planRange(y, tm),
        api.proposals(),
        api.moodKinds(),
        api.moodHistory(30),
        api.ops(40),
      ]);
      const map: Record<string, DayPlan> = {};
      for (const p of range) map[p.date] = p;
      setPlans(map);
      setProposals(ps.proposals ?? []);
      setMoodKinds(kinds.kinds ?? []);
      setMoods(hist);
      setOps(log.ops ?? []);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, today]);

  const loadPanels = useCallback(async () => {
    try {
      const [m, c, a, co, w, mem, p, th, ch, rh, wl] = await Promise.all([
        api.materials(),
        api.materialCategories(),
        api.assignments(),
        api.courses(),
        api.wishes(),
        api.memory(),
        api.preferences(),
        api.themes(),
        api.channels(),
        api.rhythm(),
        api.weeklyLetter(),
      ]);
      setMaterials(m.materials ?? []);
      setCategories(c.categories ?? []);
      setAssignments(a.assignments ?? []);
      setCourses(co.courses ?? []);
      setWishes(w.wishes ?? []);
      setMemories(mem.facts ?? []);
      setPrefs(p);
      setCustomThemes(th.themes ?? []);
      setChannels(ch.channels ?? []);
      setChannelBindings(ch.bindings ?? []);
      setRhythm(rh);
      setWeeklyLetter(wl.letter ?? null);
      // The session's theme may be a custom one; once the list is here we can
      // apply its variables (boot only set the builtin fallback).
      applyTheme(currentTheme, th.themes ?? []);
    } catch (e) {
      setError(errText(e));
    }
  }, [currentTheme]);

  const expandEarlier = useCallback(async () => {
    const y = addDays(api.todayIsoInTZ(TZ), -1);
    try {
      const days = await api.river(15);
      setEarlierDays(
        days
          .filter((d) => d.date < y)
          .map((d) => ({ date: d.date, count: d.count, mood: d.mood || undefined }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      );
    } catch (e) {
      setError(errText(e));
    }
  }, [TZ]);

  const timer = useRef<number | null>(null);
  const offer = useCallback((opId: string, label: string) => {
    setUndo({ opId, label });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const clearUndo = useCallback(() => setUndo(null), []);

  // 「一句话改期」等预填：把文本放进底部输入条，不提交。
  const prefill = useCallback((text: string) => setPrefillText(text), []);
  const clearPrefill = useCallback(() => setPrefillText(null), []);

  const flashTimer = useRef<number | null>(null);
  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3200);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // ── account ──────────────────────────────────────────────────────────────
  const loadUser = useCallback(async () => {
    try {
      const r = await api.me();
      setUser(r.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.login(email, password);
      setUser(r.user);
      await refresh();
      await loadPanels();
      showFlash(t('auth.welcome', { name: r.user.name || r.user.email || '' }));
    },
    [refresh, loadPanels, showFlash, t],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const r = await api.register(email, password, name || undefined);
      setUser(r.user);
      await refresh();
      await loadPanels();
      showFlash(t('auth.welcome', { name: r.user.name || r.user.email || '' }));
    },
    [refresh, loadPanels, showFlash, t],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    await refresh();
    await loadPanels();
    showFlash(t('auth.signedOut'));
  }, [refresh, loadPanels, showFlash, t]);

  const topOpId = useCallback(async (): Promise<string | null> => {
    try {
      const { ops: top } = await api.ops(1);
      return top?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const act = useCallback(
    async (run: () => Promise<unknown>, label: string): Promise<BlockEdit> => {
      setBusy(true);
      setError('');
      try {
        await run();
        const opId = await topOpId();
        await refresh();
        if (opId) offer(opId, label);
        return { ok: true, opId, label };
      } catch (e) {
        const blocked = blockedOf(e);
        if (blocked) {
          // The menu renders the refusal inline; the error bar is for faults.
          await refresh();
          return { ok: false, blocked };
        }
        await refresh();
        setError(errText(e));
        return { ok: false, blocked: { code: 'error', confirmable: false } };
      } finally {
        setBusy(false);
      }
    },
    [offer, refresh, topOpId],
  );

  const complete = useCallback(
    (b: TimeBlock, date: string) =>
      act(
        () => api.patchPlan(date, { action: 'update', match: { id: b.id }, changes: { completed: true } }),
        t('undo.completed', { title: b.title }),
      ).then(() => undefined),
    [act, t],
  );

  const moveToTomorrow = useCallback(
    (b: TimeBlock, date: string, confirm = false) =>
      act(
        async () => {
          // ⚠️ A `date` inside patch changes is a silent no-op — verified live:
          // PATCH /api/plan update with changes:{date:…} answers 200 but the
          // block stays in its own day's document. A move is remove + add.
          // Remove goes FIRST so a gate refusal (soft/hard/petrified) rejects
          // before anything has moved, and the soft-lock confirm flag rides on
          // the remove. If the add then fails, the remove's op is the ledger
          // backstop the undo bar can still reach.
          await api.patchPlan(date, {
            action: 'remove',
            match: { id: b.id },
            ...(confirm ? { confirm: true } : {}),
          });
          await api.patchPlan(addDays(date, 1), {
            action: 'add',
            block: {
              id: b.id + '-tmr-' + Date.now().toString(36),
              time: b.time,
              title: b.title,
              type: b.type,
              duration_min: b.duration_min,
              ...(b.time_mode ? { time_mode: b.time_mode } : {}),
              ...(b.timezone ? { timezone: b.timezone } : {}),
            },
          });
        },
        t('undo.moved', { title: b.title }),
      ),
    [act, t],
  );

  const removeBlock = useCallback(
    (b: TimeBlock, date: string) =>
      act(
        () => api.patchPlan(date, { action: 'remove', match: { id: b.id } }),
        t('undo.removed', { title: b.title }),
      ),
    [act, t],
  );

  const setNote = useCallback(
    (b: TimeBlock, date: string, note: string) =>
      act(
        () => api.patchPlan(date, { action: 'update', match: { id: b.id }, changes: { note } }),
        t('undo.noted', { title: b.title }),
      ).then(() => undefined),
    [act, t],
  );

  const markConflict = useCallback(
    (b: TimeBlock, date: string) =>
      act(() => api.markConflict(date, b.id), t('undo.conflict', { title: b.title })).then(() => undefined),
    [act, t],
  );

  // 重新安排 = 投一个 pending timed 提案（明天同时段 ghost），用户点头才落地。
  const proposeReschedule = useCallback(
    async (blockId: string) => {
      try {
        await api.proposeReschedule(blockId);
        await refresh();
        showFlash(t('menu.rescheduleProposed'));
      } catch (e) {
        setError(errText(e));
        await refresh();
      }
    },
    [refresh, showFlash, t],
  );

  const setLock = useCallback(
    (b: TimeBlock, date: string, level: 'none' | 'soft' | 'hard') =>
      act(() => api.lockPlanBlock(date, b.id, level), t('undo.locked', { title: b.title })),
    [act, t],
  );

  const answer = useCallback(
    (p: Proposal, accept: boolean) =>
      act(
        () => api.respondToProposal(p.id, accept),
        t(accept ? 'undo.accepted' : 'undo.rejected', { title: p.title }),
      ).then(() => undefined),
    [act, t],
  );

  const take = useCallback(
    (p: Proposal, rowId: string) =>
      act(
        () => api.respondToProposalRow(p.id, rowId),
        t('undo.accepted', { title: p.title }),
      ).then(() => undefined),
    [act, t],
  );

  const recordMood = useCallback(
    (moodId: string, note: string) =>
      act(() => api.recordMood(moodId, note), t('undo.mood')).then(() => undefined),
    [act, t],
  );

  const captureIntent = useCallback(
    async (text: string): Promise<CaptureResult> => {
      setBusy(true);
      setError('');
      try {
        const res = await api.planFromText({ description: text, timezone: tz() });
        if (res.error) return { kind: 'notice', message: res.message ?? res.error };
        const blocks = (res.blocks ?? []).filter((b) => b && b.title && b.title.trim());
        if (!blocks.length) return { kind: 'notice', message: t('input.noBlocks') };
        return { kind: 'candidates', blocks };
      } catch (e) {
        const msg = isAiNotConfigured(e) ? t('err.aiNotConfigured') : errText(e);
        setError(msg);
        return { kind: 'notice', message: msg };
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const addCandidate = useCallback(
    (b: TimeBlock) =>
      act(
        () =>
          api.patchPlan(b.date ?? api.todayIsoInTZ(TZ), {
            action: 'add',
            block: {
              title: b.title,
              type: b.type ?? 'task',
              time: b.time ?? null,
              duration_min: b.duration_min ?? null,
              note: b.note,
            },
          }),
        t('undo.added', { title: b.title }),
      ).then(() => undefined),
    [act, t],
  );

  const createWish = useCallback(
    (title: string, note: string, effortMin: number | null) =>
      act(
        () => api.createWish({ title, ...(note ? { note } : {}), ...(effortMin != null ? { effortMin } : {}) }),
        t('undo.wish', { title }),
      ).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const updateWish = useCallback(
    (id: string, changes: { status?: 'active' | 'done' | 'dropped' }, label?: string) =>
      act(() => api.updateWish(id, changes), label ?? t('undo.wishEdit')).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const deleteWish = useCallback(
    (id: string) => act(() => api.deleteWish(id), t('undo.wishDelete')).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const createMaterial = useCallback(
    (input: { title: string; body?: string; summary?: string; category?: string; tags?: string[]; source?: string }) =>
      act(() => api.createMaterial(input), t('undo.materialAdd', { title: input.title })).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const deleteMaterial = useCallback(
    (id: string) => act(() => api.deleteMaterial(id), t('undo.materialDelete')).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const deleteMemory = useCallback(
    (id: string) => act(() => api.deleteMemory(id), t('undo.memoryDelete')).then(() => loadPanels()),
    [act, t, loadPanels],
  );

  const setPref = useCallback((p: Partial<SessionPrefs>) => {
    setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
    return api
      .patchPreferences(p)
      .then((next) => setPrefs(next))
      .catch((e) => setError(errText(e)));
  }, []);

  const setTheme = useCallback(
    (id: string) => {
      setCurrentTheme(id);
      applyTheme(id, customThemes);
      return api
        .setTheme(id)
        .then(() => undefined)
        .catch((e) => setError(errText(e)));
    },
    [customThemes],
  );

  const saveTheme = useCallback(
    async (input: { name: string; base?: string; dark?: boolean; variables: Record<string, string> }) => {
      try {
        const created = await api.saveTheme(input);
        const list = await api.themes();
        setCustomThemes(list.themes ?? []);
        setCurrentTheme(created.id);
        applyTheme(created.id, list.themes ?? []);
        await api.setTheme(created.id);
      } catch (e) {
        setError(errText(e));
      }
    },
    [],
  );

  const deleteTheme = useCallback(
    async (id: string) => {
      try {
        await api.deleteTheme(id);
        const list = await api.themes();
        setCustomThemes(list.themes ?? []);
        const next = id === currentTheme ? 'sunset' : currentTheme;
        setCurrentTheme(next);
        applyTheme(next, list.themes ?? []);
      } catch (e) {
        setError(errText(e));
      }
    },
    [currentTheme],
  );

  const renameTheme = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await api.patchTheme(id, { name: trimmed });
        const list = await api.themes();
        setCustomThemes(list.themes ?? []);
      } catch (e) {
        setError(errText(e));
      }
    },
    [],
  );

  const pinRhythm = useCallback(
    async (wake: string, sleep: string) => {
      try {
        const r = await api.pinRhythm(wake, sleep);
        setRhythm(r);
      } catch (e) {
        setError(errText(e));
      }
    },
    [],
  );

  const setLanguage = useCallback(async (loc: string) => {
    api.chooseLocale(loc);
    setLocale(loc);
    try {
      await api.patchSettings({ language: loc });
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  const setAssistantName = useCallback((name: string) => {
    setAssistantNameState(name);
    return api
      .patchSettings({ assistantName: name })
      .then(() => undefined)
      .catch((e) => setError(errText(e)));
  }, []);

  const setPersonaPrompt = useCallback((prompt: string) => {
    setPersonaPromptState(prompt);
    return api
      .patchSettings({ personaPrompt: prompt })
      .then(() => undefined)
      .catch((e) => setError(errText(e)));
  }, []);

  const takeBack = useCallback(async () => {
    if (!undo) return;
    const id = undo.opId;
    setUndo(null);
    setBusy(true);
    try {
      await api.revertOp(id);
      await refresh();
      await loadPanels();
      showFlash(t('undo.done'));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }, [undo, refresh, loadPanels, showFlash, t]);

  const undoOp = useCallback(
    async (opId: string): Promise<boolean> => {
      setBusy(true);
      try {
        await api.revertOp(opId);
        await refresh();
        await loadPanels();
        showFlash(t('undo.done'));
        return true;
      } catch (e) {
        setError(errText(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, loadPanels, showFlash, t],
  );

  const moodLabel = useCallback(
    (id: string) => moodKinds.find((k) => k.id === id),
    [moodKinds],
  );

  const phaseOf = useCallback(
    (b: TimeBlock, date: string) => composePhaseOf(b, date, today, nowMin),
    [today, nowMin],
  );

  const items = compose({ plans, proposals, moods, ops, earlierDays, today, nowMs });

  return {
    t,
    locale,
    availableLocales: boot.handshake.locales?.available ?? ['zh-CN'],
    assistantName,
    currentTheme,
    plans,
    proposals,
    moodKinds,
    moods,
    ops,
    earlierDays,
    items,
    materials,
    categories,
    assignments,
    courses,
    wishes,
    memories,
    personaPrompt,
    user,
    prefs,
    rhythm,
    weeklyLetter,
    customThemes,
    channels,
    channelBindings,
    busy,
    error,
    undo,
    flash,
    prefillText,
    today,
    tz: TZ,
    nowMin,
    nowMs,
    refresh,
    loadPanels,
    expandEarlier,
    takeBack,
    undoOp,
    clearUndo,
    showFlash,
    prefill,
    clearPrefill,
    phaseOf,
    complete,
    moveToTomorrow,
    removeBlock,
    setNote,
    markConflict,
    proposeReschedule,
    setLock,
    answer,
    take,
    recordMood,
    captureIntent,
    addCandidate,
    createWish,
    updateWish,
    deleteWish,
    createMaterial,
    deleteMaterial,
    deleteMemory,
    setPref,
    pinRhythm,
    setTheme,
    saveTheme,
    deleteTheme,
    renameTheme,
    setLanguage,
    setAssistantName,
    setPersonaPrompt,
    loadUser,
    login,
    register,
    logout,
    moodLabel,
    fmtHM,
  };
}
