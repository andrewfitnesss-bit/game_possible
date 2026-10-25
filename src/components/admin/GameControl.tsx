import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_SETTINGS, PHASES, SETTING_LABEL, settingsOf } from '../../lib/game';
import { errText } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import type { Client, Game, GameSettings, Phase } from '../../lib/types';
import { PhaseBanner } from '../game/PhaseBanner';

interface Props {
  game: Game;
  onChanged: () => void;
}

export function GameControl({ game, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>(game.phase);
  const [minutes, setMinutes] = useState(String(PHASES.find((p) => p.id === game.phase)?.minutes ?? 0));
  const [settings, setSettings] = useState<Record<keyof GameSettings, string>>(() => toForm(settingsOf(game)));
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhase(game.phase);
    setSettings(toForm(settingsOf(game)));
  }, [game]);

  useEffect(() => {
    void supabase
      .from('clients')
      .select('*')
      .order('sort')
      .then(({ data, error: err }) => {
        if (err) setError(errText(err));
        else setClients((data ?? []) as Client[]);
      });
  }, []);

  async function exec(action: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    try {
      const { error: err } = await action();
      setError(err ? errText(err) : null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  function startPhase(e: FormEvent) {
    e.preventDefault();
    const m = Number(minutes);
    const endsAt = m > 0 ? new Date(Date.now() + m * 60_000).toISOString() : null;
    void exec(() => supabase.from('games').update({ phase, phase_ends_at: endsAt }).eq('id', game.id));
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    const next: Partial<GameSettings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) {
      const v = Number(settings[key]);
      if (!Number.isFinite(v) || v < 0) {
        setError(`Неверное значение: ${SETTING_LABEL[key]}`);
        return;
      }
      next[key] = v;
    }
    void exec(() => supabase.from('games').update({ settings: next }).eq('id', game.id));
  }

  async function toggleClient(c: Client) {
    setClients((list) => list.map((x) => (x.code === c.code ? { ...x, in_game: !c.in_game } : x)));
    const { error: err } = await supabase.from('clients').update({ in_game: !c.in_game }).eq('code', c.code);
    if (err) {
      setError(errText(err));
      setClients((list) => list.map((x) => (x.code === c.code ? c : x)));
    }
  }

  return (
    <>
      <PhaseBanner game={game} />
      {error && (
        <p className="error card" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2>Раунд</h2>
        <form className="row" onSubmit={startPhase}>
          <select
            value={phase}
            aria-label="Раунд"
            onChange={(e) => {
              const p = e.target.value as Phase;
              setPhase(p);
              setMinutes(String(PHASES.find((x) => x.id === p)?.minutes ?? 0));
            }}
          >
            {PHASES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <label className="inline">
            Таймер, мин
            <input type="number" min={0} max={300} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="narrow-input" />
          </label>
          <button type="submit" disabled={busy}>
            Запустить
          </button>
        </form>
        <p className="muted small">
          Раунд определяет, что может делать капитан: доску правят в раундах 1–4, специализации выбирают в 1.3, информацию
          покупают в 1.2–1.3, маркетинг — в 2.1, HQ — в 2.2. Кураторы и админ не ограничены раундом.
        </p>
      </section>

      <section className="card">
        <h2>Правила и лимиты</h2>
        <form className="settings" onSubmit={saveSettings}>
          {(Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]).map((key) => (
            <label key={key}>
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
          <button type="submit" disabled={busy}>
            Сохранить правила
          </button>
        </form>
      </section>

      <section className="card">
        <h2>
          Клиенты в игре <span className="muted">({clients.filter((c) => c.in_game).length} из {clients.length})</span>
        </h2>
        <div className="client-toggles">
          {clients.map((c) => (
            <label key={c.code} className="check">
              <input type="checkbox" checked={c.in_game} onChange={() => void toggleClient(c)} />
              <strong>{c.code}</strong> {c.name}
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

function toForm(s: GameSettings): Record<keyof GameSettings, string> {
  const out = {} as Record<keyof GameSettings, string>;
  for (const key of Object.keys(s) as (keyof GameSettings)[]) out[key] = String(s[key]);
  return out;
}
