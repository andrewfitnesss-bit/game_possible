import { useEffect, useState, type FormEvent } from 'react';
import { Check, Flag, ListChecks, Pause, Play, Plus, SlidersHorizontal } from 'lucide-react';
import { useT, type TKey } from '../../i18n/prefs';
import { DEFAULT_SETTINGS, PHASES, settingsOf } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { formatLeft, useCountdown } from '../../lib/useGame';
import { verticalStyle } from '../../lib/verticals';
import type { Client, Game, GameSettings, Phase } from '../../lib/types';
import { useToast } from '../../ui/Toast';

interface Props {
  game: Game;
  onChanged: () => void;
}

const GROUPS: { title: TKey; keys: (keyof GameSettings)[] }[] = [
  { title: 'gc.groupBudget', keys: ['budget', 'cap_info', 'cap_marketing', 'cap_hq', 'cost_spec'] },
  { title: 'gc.groupTeam', keys: ['kams', 'max_active_per_kam', 'max_maint_per_kam', 'ssm_count', 'ssm_max_clients', 'max_specs', 'max_hq_requests'] },
];

function toForm(s: GameSettings): Record<keyof GameSettings, string> {
  const out = {} as Record<keyof GameSettings, string>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) out[key] = String(s[key]);
  return out;
}

export function GameControl({ game, onChanged }: Props) {
  const t = useT();
  const toast = useToast();
  const [minutes, setMinutes] = useState<Record<string, string>>(() => Object.fromEntries(PHASES.map((p) => [p.id, String(p.minutes)])));
  const [settings, setSettings] = useState(() => toForm(settingsOf(game)));
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(game.phase_ends_at);
  const currentIndex = PHASES.findIndex((p) => p.id === game.phase);

  useEffect(() => setSettings(toForm(settingsOf(game))), [game]);

  useEffect(() => {
    void supabase
      .from('clients')
      .select('*')
      .order('sort')
      .then(({ data, error }) => {
        if (error) toast.error(errText(error, t));
        else setClients((data ?? []) as Client[]);
      });
  }, [toast, t]);

  async function updateGame(patch: Partial<Game>, success: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from('games').update(patch).eq('id', game.id);
      if (error) toast.error(errText(error, t));
      else toast.success(success);
    } catch (e) {
      toast.error(errText(e, t));
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  function start(phase: Phase) {
    const m = Number(minutes[phase]);
    const endsAt = m > 0 ? new Date(Date.now() + m * 60_000).toISOString() : null;
    void updateGame({ phase, phase_ends_at: endsAt }, t('gc.started', { name: t(`phaseShort.${phase}` as TKey) }));
  }

  function extend(mins: number) {
    const base = game.phase_ends_at && Date.parse(game.phase_ends_at) > Date.now() ? Date.parse(game.phase_ends_at) : Date.now();
    void updateGame({ phase_ends_at: new Date(base + mins * 60_000).toISOString() }, t('gc.extended', { n: mins }));
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    const next: Partial<GameSettings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) {
      const v = Number(settings[key]);
      if (!Number.isFinite(v) || v < 0) {
        toast.error(t('gc.invalid', { label: t(`setting.${key}` as TKey) }));
        return;
      }
      next[key] = v;
    }
    void updateGame({ settings: next }, t('gc.saved'));
  }

  async function toggleClient(c: Client) {
    setClients((list) => list.map((x) => (x.code === c.code ? { ...x, in_game: !c.in_game } : x)));
    const { error } = await supabase.from('clients').update({ in_game: !c.in_game }).eq('code', c.code);
    if (error) {
      toast.error(errText(error, t));
      setClients((list) => list.map((x) => (x.code === c.code ? c : x)));
    }
  }

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Flag size={20} />
            <div>
              <h2>{t('gc.rounds')}</h2>
              <div className="card-sub">{t('gc.roundsSub')}</div>
            </div>
          </div>
          {game.phase_ends_at && (
            <div className="row">
              <span className={left !== null && left <= 60_000 ? 'badge badge-danger num' : 'badge badge-gold num'}>
                {left !== null && left > 0 ? formatLeft(left) : t('shell.timeUp')}
              </span>
              {[1, 5].map((n) => (
                <button key={n} type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => extend(n)}>
                  <Plus size={12} />
                  {t('gc.plus', { n })}
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void updateGame({ phase_ends_at: null }, t('gc.stopped'))}>
                <Pause size={12} /> {t('gc.stop')}
              </button>
            </div>
          )}
        </div>
        <ol className="stepper">
          {PHASES.map((p, i) => {
            const current = p.id === game.phase;
            const state = current ? 'current' : i < currentIndex ? 'done' : '';
            return (
              <li key={p.id} className={`step ${state}`}>
                <span className="step-num">{i < currentIndex ? <Check size={16} /> : i}</span>
                <div>
                  <div className="step-title">{t(`phase.${p.id}` as TKey)}</div>
                  <div className="muted xsmall">{t(`phaseAbout.${p.id}` as TKey)}</div>
                </div>
                <div className="step-actions">
                  <label className="sr-only" htmlFor={`min-${p.id}`}>
                    {t('gc.minutes')}
                  </label>
                  <input
                    id={`min-${p.id}`}
                    type="number"
                    min={0}
                    max={300}
                    className="input"
                    value={minutes[p.id]}
                    onChange={(e) => setMinutes((m) => ({ ...m, [p.id]: e.target.value }))}
                    title={t('gc.minutes')}
                  />
                  <button type="button" className={current ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'} disabled={busy} onClick={() => start(p.id)}>
                    <Play size={14} /> {current ? t('gc.restart') : t('gc.startBtn')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="stack-lg">
        <section className="card">
          <div className="card-title">
            <SlidersHorizontal size={20} />
            <h2>{t('gc.rules')}</h2>
          </div>
          <form className="form" onSubmit={saveSettings}>
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="settings-group plain">
                <legend className="section-title">{t(g.title)}</legend>
                <div className="settings-grid">
                  {g.keys.map((key) => (
                    <label key={key} className="field">
                      {t(`setting.${key}` as TKey)}
                      <input type="number" min={0} step="any" value={settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))} />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('gc.saveRules')}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <ListChecks size={20} />
              <h2>{t('gc.clients')}</h2>
            </div>
            <span className="badge">{t('gc.of', { a: clients.filter((c) => c.in_game).length, b: clients.length })}</span>
          </div>
          <div className="toggle-grid">
            {clients.map((c) => (
              <label key={c.code} className={c.in_game ? 'toggle' : 'toggle off'}>
                <input type="checkbox" checked={c.in_game} onChange={() => void toggleClient(c)} />
                <span className="code-badge" style={verticalStyle(c.code)}>
                  {c.code}
                </span>
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
