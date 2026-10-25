import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Header } from '../components/Header';
import { supabase } from '../lib/supabase';
import { errText } from '../lib/errors';
import { AuditSection } from '../components/AuditSection';
import { GameControl } from '../components/admin/GameControl';
import { Overview } from '../components/admin/Overview';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import type { Game, Profile, Role, Team } from '../lib/types';

const UNASSIGNED = 'unassigned';

type Tab = 'people' | 'game' | 'tables' | 'overview' | 'audit';
const TABS: { id: Tab; label: string }[] = [
  { id: 'people', label: 'Участники' },
  { id: 'game', label: 'Раунды и правила' },
  { id: 'tables', label: 'Столы' },
  { id: 'overview', label: 'Итоги' },
  { id: 'audit', label: 'Аудит' },
];

const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: 'member', label: 'Участник' },
  { id: 'captain', label: 'Капитан' },
  { id: 'curator', label: 'Куратор' },
];

function PersonCard({ person, onRole }: { person: Profile; onRole: (p: Profile, role: Role) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: person.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="person" {...attributes}>
      <span className="grip" {...listeners} aria-label={`Перетащить: ${person.full_name || person.username}`}>
        ⠿
      </span>
      <span className="person-name">
        {person.full_name || person.username}
        <small className="muted"> @{person.username}</small>
      </span>
      <select
        className={person.role === 'member' ? 'role' : 'role active'}
        value={person.role}
        onChange={(e) => onRole(person, e.target.value as Role)}
        aria-label={`Роль: ${person.full_name || person.username}`}
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Column({
  id,
  title,
  count,
  onDelete,
  children,
}: {
  id: string;
  title: string;
  count: number;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={isOver ? 'column over' : 'column'}>
      <h3>
        {title} <span className="muted">({count})</span>
        {onDelete && (
          <button type="button" className="icon" onClick={onDelete} aria-label={`Удалить команду ${title}`}>
            ✕
          </button>
        )}
      </h3>
      {children}
    </section>
  );
}

export function AdminPage() {
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTeam, setNewTeam] = useState('');
  const [newGame, setNewGame] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const [tableId, setTableId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    const g = await supabase.from('games').select('*').eq('is_active', true).maybeSingle();
    if (g.error) {
      setError(errText(g.error));
      return;
    }
    const activeGame = (g.data as Game | null) ?? null;
    setGame(activeGame);

    const [t, p] = await Promise.all([
      activeGame
        ? supabase.from('teams').select('*').eq('game_id', activeGame.id).order('created_at')
        : Promise.resolve({ data: [], error: null }),
      activeGame
        ? supabase.from('profiles').select('*').eq('game_id', activeGame.id).neq('role', 'superadmin').order('full_name')
        : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError = t.error ?? p.error;
    if (firstError) {
      setError(errText(firstError));
      return;
    }
    setError(null);
    setTeams((t.data ?? []) as Team[]);
    setPeople((p.data ?? []) as Profile[]);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function run(action: () => PromiseLike<{ error: unknown }>) {
    if (busy) return;
    setBusy(true);
    try {
      const { error: err } = await action();
      if (err) setError(errText(err));
    } catch (e) {
      setError(errText(e));
    } finally {
      await load();
      setBusy(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const personId = String(event.active.id);
    const target = event.over ? String(event.over.id) : null;
    if (!target) return;
    const teamId = target === UNASSIGNED ? null : target;
    const person = people.find((p) => p.id === personId);
    if (!person || person.team_id === teamId) return;
    // Оптимистичное обновление; при ошибке load() вернёт реальное состояние.
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, team_id: teamId } : p)));
    void run(() => supabase.from('profiles').update({ team_id: teamId }).eq('id', personId));
  }

  function changeRole(person: Profile, role: Role) {
    if (role === person.role) return;
    void run(() => supabase.from('profiles').update({ role }).eq('id', person.id));
  }

  function addTeam(e: FormEvent) {
    e.preventDefault();
    const name = newTeam.trim();
    if (!game || !name) return;
    setNewTeam('');
    void run(() => supabase.from('teams').insert({ game_id: game.id, name }));
  }

  function removeTeam(team: Team) {
    if (!window.confirm(`Удалить команду «${team.name}»? Её участники вернутся в список ожидания.`)) return;
    void run(() => supabase.from('teams').delete().eq('id', team.id));
  }

  function startGame(e: FormEvent) {
    e.preventDefault();
    const name = newGame.trim();
    if (!name) return;
    const warn = game
      ? 'Текущая игра будет завершена. Участники в новую игру не переносятся — в ней зарегистрируются новые. Продолжить?'
      : `Запустить игру «${name}»?`;
    if (!window.confirm(warn)) return;
    setNewGame('');
    void run(() => supabase.rpc('start_game', { p_name: name }));
  }

  function splitEvenly() {
    if (!window.confirm('Случайно распределить всех участников по командам поровну? Текущее распределение будет заменено.')) {
      return;
    }
    void run(() => supabase.rpc('split_evenly'));
  }

  const byColumn = useMemo(() => {
    const map = new Map<string, Profile[]>();
    map.set(UNASSIGNED, []);
    for (const t of teams) map.set(t.id, []);
    for (const p of people) (map.get(p.team_id ?? UNASSIGNED) ?? map.get(UNASSIGNED))?.push(p);
    return map;
  }, [teams, people]);

  const selectedTable = teams.find((t) => t.id === tableId) ?? teams[0] ?? null;

  return (
    <>
      <Header />
      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="error card" role="alert">
          {error}
        </p>
      )}

      {tab === 'people' && (
      <section className="card">
        <h2>Игра: {game ? game.name : 'не запущена'}</h2>
        <form className="row" onSubmit={startGame}>
          <input
            value={newGame}
            onChange={(e) => setNewGame(e.target.value)}
            placeholder="Название новой игры"
            maxLength={100}
          />
          <button type="submit" disabled={busy || !newGame.trim()}>
            {game ? 'Начать новую игру' : 'Запустить игру'}
          </button>
        </form>
      </section>
      )}

      {tab === 'people' && game && (
        <section className="card">
          <div className="row between">
            <h2>Распределение по командам</h2>
            <button type="button" onClick={splitEvenly} disabled={busy || teams.length === 0 || people.length === 0}>
              Разделить поровну
            </button>
          </div>
          <form className="row" onSubmit={addTeam}>
            <input
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              placeholder="Название команды"
              maxLength={100}
            />
            <button type="submit" disabled={busy || !newTeam.trim()}>
              Добавить команду
            </button>
          </form>

          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="board">
              <Column id={UNASSIGNED} title="Ожидают назначения" count={byColumn.get(UNASSIGNED)?.length ?? 0}>
                {(byColumn.get(UNASSIGNED) ?? []).map((p) => (
                  <PersonCard key={p.id} person={p} onRole={changeRole} />
                ))}
              </Column>
              {teams.map((t) => (
                <Column
                  key={t.id}
                  id={t.id}
                  title={t.name}
                  count={byColumn.get(t.id)?.length ?? 0}
                  onDelete={() => removeTeam(t)}
                >
                  {(byColumn.get(t.id) ?? []).map((p) => (
                    <PersonCard key={p.id} person={p} onRole={changeRole} />
                  ))}
                </Column>
              ))}
            </div>
          </DndContext>
        </section>
      )}

      {tab === 'game' && (game ? <GameControl game={game} onChanged={() => void load()} /> : <NoGame />)}

      {tab === 'tables' &&
        (!game ? (
          <NoGame />
        ) : !selectedTable ? (
          <p className="card muted">Сначала создайте команды во вкладке «Участники».</p>
        ) : (
          <>
            <nav className="tabs sub" aria-label="Столы">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={selectedTable.id === t.id ? 'tab active' : 'tab'}
                  onClick={() => setTableId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </nav>
            <TeamWorkspace key={selectedTable.id} teamId={selectedTable.id} mode="staff" />
          </>
        ))}

      {tab === 'overview' && (game ? <Overview game={game} teams={teams} /> : <NoGame />)}

      {tab === 'audit' && <AuditSection refreshKey={refreshKey} />}
    </>
  );
}

function NoGame() {
  return <p className="card muted">Активной игры нет. Запустите её во вкладке «Участники».</p>;
}
