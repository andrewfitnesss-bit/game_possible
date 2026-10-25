import { useEffect, useState, type FormEvent } from 'react';
import { Check, Flag, ListChecks, Pause, Play, Plus, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_SETTINGS, PHASES, SETTING_LABEL, settingsOf } from '../../lib/game';
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

const GROUPS: { title: string; keys: (keyof GameSettings)[] }[] = [
  { title: 'Бюджет, монеты', keys: ['budget', 'cap_info', 'cap_marketing', 'cap_hq'] },
  { title: 'Sales Capacity', keys: ['capacity', 'cost_active', 'cost_maintenance', 'cost_spec'] },
  { title: 'Команда', keys: ['kams', 'max_active_per_kam', 'max_maint_per_kam', 'ssm_count', 'ssm_max_clients', 'max_specs', 'max_hq_requests'] },
];

function toForm(s: GameSettings): Record<keyof GameSettings, string> {
  const out = {} as Record<keyof GameSettings, string>;
  for (const key of Object.keys(s) as (keyof GameSettings)[]) out[key] = String(s[key]);
  return out;
}

export function GameControl({ game, onChanged }: Props) {
  const toast = useToast();
  const [minutes, setMinutes] = useState<Record<string, string>>(() =>
    Object.fromEntries(PHASES.map((p) => [p.id, String(p.minutes)])),
  );
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
        if (error) toast.error(errText(error));
        else setClients((data ?? []) as Client[]);
      });
  }, [toast]);

  async function updateGame(patch: Partial<Game>, success: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from('games').update(patch).eq('id', game.id);
      if (error) toast.error(errText(error));
      else toast.success(success);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  function start(phase: Phase) {
    const m = Number(minutes[phase]);
    const endsAt = m > 0 ? new Date(Date.now() + m * 60_000).toISOString() : null;
    const label = PHASES.find((p) => p.id === phase)?.short ?? phase;
    void updateGame({ phase, phase_ends_at: endsAt }, `Запущен раунд: ${label}`);
  }

  function extend(mins: number) {
    const base = game.phase_ends_at && Date.parse(game.phase_ends_at) > Date.now() ? Date.parse(game.phase_ends_at) : Date.now();
    void updateGame({ phase_ends_at: new Date(base + mins * 60_000).toISOString() }, `Таймер продлён на ${mins} мин`);
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    const next: Partial<GameSettings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) {
      const v = Number(settings[key]);
      if (!Number.isFinite(v) || v < 0) {
        toast.error(`Неверное значение: ${SETTING_LABEL[key]}`);
        return;
      }
      next[key] = v;
    }
    void updateGame({ settings: next }, 'Правила сохранены');
  }

  async function toggleClient(c: Client) {
    setClients((list) => list.map((x) => (x.code === c.code ? { ...x, in_game: !c.in_game } : x)));
    const { error } = await supabase.from('clients').update({ in_game: !c.in_game }).eq('code', c.code);
    if (error) {
      toast.error(errText(error));
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
              <h2>Раунды</h2>
              <div className="card-sub">Раунд определяет, что может делать капитан. Кураторы и админ не ограничены.</div>
            </div>
          </div>
          {game.phase_ends_at && (
            <div className="row">
              <span className={left !== null && left <= 60_000 ? 'badge badge-danger num' : 'badge badge-gold num'}>
                {left !== null && left > 0 ? formatLeft(left) : 'время вышло'}
              </span>
              <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => extend(1)}>
                <Plus size={12} />1 мин
              </button>
              <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => extend(5)}>
                <Plus size={12} />5 мин
              </button>
              <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void updateGame({ phase_ends_at: null }, 'Таймер остановлен')}>
                <Pause size={12} /> Стоп
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
                  <div className="step-title">{p.label}</div>
                  <div className="muted xsmall">{p.about}</div>
                </div>
                <div className="step-actions">
                  <label className="sr-only" htmlFor={`min-${p.id}`}>
                    Минут
                  </label>
                  <input
                    id={`min-${p.id}`}
                    type="number"
                    min={0}
                    max={300}
                    className="input"
                    value={minutes[p.id]}
                    onChange={(e) => setMinutes((m) => ({ ...m, [p.id]: e.target.value }))}
                    title="Минут на таймере (0 — без таймера)"
                  />
                  <button type="button" className={current ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'} disabled={busy} onClick={() => start(p.id)}>
                    <Play size={14} /> {current ? 'Заново' : 'Старт'}
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
            <h2>Правила и лимиты</h2>
          </div>
          <form className="form" onSubmit={saveSettings}>
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="settings-group plain">
                <legend className="section-title">{g.title}</legend>
                <div className="settings-grid">
                  {g.keys.map((key) => (
                    <label key={key} className="field">
                      {SETTING_LABEL[key]}
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={settings[key]}
                        onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Сохранить правила
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <ListChecks size={20} />
              <h2>Клиенты в игре</h2>
            </div>
            <span className="badge">
              {clients.filter((c) => c.in_game).length} из {clients.length}
            </span>
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
