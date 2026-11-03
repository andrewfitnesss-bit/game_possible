import { useState, type ReactNode } from 'react';
import { ChevronDown, Info, Languages, LogOut, Monitor, Moon, Palette, Sun, Target, Timer } from 'lucide-react';
import { useAuth } from '../../auth';
import { usePrefs, type Lang, type Mode, type T, type TKey, type Theme } from '../../i18n/prefs';
import { PHASES, PLAYABLE_PHASES, settingsOf } from '../../lib/game';
import { formatLeft, useCountdown, useGame } from '../../lib/useGame';
import type { Game } from '../../lib/types';
import { Avatar } from '../../ui/kit';
import { Menu, type MenuEntry } from '../../ui/Menu';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const game = useGame(profile?.game_id ?? null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <div className="game-status">{game && <GameStatus game={game} />}</div>
          <UserMenu />
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">The NAL Games · v{__APP_VERSION__}</footer>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        N
      </span>
      <span className="brand-text">
        <span className="brand-title">The NAL Games</span>
        <span className="brand-sub">Mission: Possible</span>
      </span>
    </div>
  );
}

/** Пункты меню оформления, режима и языка — общие для шапки и экрана входа. */
export function prefsEntries(t: T, prefs: { theme: Theme; mode: Mode; lang: Lang }, set: (p: Partial<{ theme: Theme; mode: Mode; lang: Lang }>) => void): MenuEntry[] {
  const themes: [Theme, TKey][] = [
    ['arena', 'shell.themeArena'],
    ['corp', 'shell.themeCorp'],
  ];
  const modes: [Mode, TKey, ReactNode][] = [
    ['light', 'shell.modeLight', <Sun size={16} key="l" />],
    ['dark', 'shell.modeDark', <Moon size={16} key="d" />],
    ['system', 'shell.modeSystem', <Monitor size={16} key="s" />],
  ];
  const langs: [Lang, string][] = [
    ['ru', 'Русский'],
    ['en', 'English'],
  ];
  return [
    { type: 'label', label: t('shell.theme') },
    ...themes.map(([id, key]): MenuEntry => ({ type: 'item', label: t(key), icon: <Palette size={16} />, checked: prefs.theme === id, onSelect: () => set({ theme: id }) })),
    { type: 'sep' },
    { type: 'label', label: t('shell.mode') },
    ...modes.map(([id, key, icon]): MenuEntry => ({ type: 'item', label: t(key), icon, checked: prefs.mode === id, onSelect: () => set({ mode: id }) })),
    { type: 'sep' },
    { type: 'label', label: t('shell.language') },
    ...langs.map(([id, label]): MenuEntry => ({ type: 'item', label, icon: <Languages size={16} />, checked: prefs.lang === id, onSelect: () => set({ lang: id }) })),
  ];
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const prefs = usePrefs();
  const { t } = prefs;
  if (!profile) return null;
  const name = profile.full_name || profile.username;
  const entries: MenuEntry[] = [
    ...prefsEntries(t, prefs, prefs.setPrefs),
    { type: 'sep' },
    { type: 'item', label: t('shell.logout'), icon: <LogOut size={16} />, onSelect: () => void signOut() },
  ];
  return (
    <Menu
      label={t('shell.menu')}
      entries={entries}
      trigger={(p) => (
        <button type="button" className="user-chip" aria-label={t('shell.menu')} {...p}>
          <span className="who">
            <span className="name">{name}</span>
            <span className="role">{t(`role.${profile.role}` as TKey)}</span>
          </span>
          <Avatar name={name} />
          <ChevronDown size={16} className="chev" />
        </button>
      )}
    />
  );
}

function GameStatus({ game }: { game: Game }) {
  const { t } = usePrefs();
  const [pinned, setPinned] = useState(false);
  // У завершённой игры (её сменила новая) нет ни раунда, ни таймера.
  const phase = game.is_active ? game.phase : 'finished';
  const left = useCountdown(game.is_active ? game.phase_ends_at : null);
  const index = PHASES.findIndex((p) => p.id === phase);
  const s = settingsOf(game);
  const vars = {
    kams: s.kams,
    ssm: s.ssm_count,
    budget: s.budget,
    active: s.max_active_per_kam,
    maint: s.max_maint_per_kam,
    cap: phase === 'r1p2' ? s.cap_info : phase === 'r2p1' ? s.cap_marketing : s.cap_hq,
    cost: s.cost_spec,
    max: s.max_specs,
    ssmMax: s.ssm_max_clients,
    requests: s.max_hq_requests,
  };
  const items = t(`rules.${phase}.items` as TKey, vars).split('\n');

  return (
    <div
      className={pinned ? 'status-wrap open' : 'status-wrap'}
      onMouseLeave={() => setPinned(false)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPinned(false)}
    >
      <button
        type="button"
        className="status-pill"
        aria-expanded={pinned}
        aria-describedby="round-rules"
        title={t('shell.rulesHint')}
        onClick={() => setPinned((v) => !v)}
      >
        <span className="phase-step">{index > 0 && index <= PLAYABLE_PHASES ? t('shell.stage', { n: index, total: PLAYABLE_PHASES }) : game.name}</span>
        <span className="phase-name">{t(`phaseShort.${phase}` as TKey)}</span>
        <Info size={15} className="phase-info" />
        {left !== null &&
          (left > 0 ? (
            <span className={left <= 60_000 ? 'timer urgent' : 'timer'} aria-label={t('shell.timeLeft')}>
              <Timer size={16} />
              {formatLeft(left)}
            </span>
          ) : (
            <span className="timer done">{t('shell.timeUp')}</span>
          ))}
      </button>
      <div className="rules-pop" id="round-rules" role="tooltip">
        <div className="rules-head">
          <span className="section-title">{t('rules.title')}</span>
          <strong>{t(`phase.${phase}` as TKey)}</strong>
        </div>
        <div className="rules-goal">
          <Target size={16} />
          <span>{t(`rules.${phase}.goal` as TKey)}</span>
        </div>
        <span className="section-title">{t('rules.limits')}</span>
        <ul>
          {items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
