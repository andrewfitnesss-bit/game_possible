import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Flag, LayoutGrid, Rocket, ScrollText, Trophy, Users } from 'lucide-react';
import { AuditSection } from '../components/AuditSection';
import { GameControl } from '../components/admin/GameControl';
import { Overview } from '../components/admin/Overview';
import { PeoplePanel } from '../components/admin/PeoplePanel';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { Game, Profile, Role, Team } from '../lib/types';
import { useConfirm } from '../ui/Confirm';
import { useToast } from '../ui/Toast';
import { Empty, Tabs, type TabDef } from '../ui/kit';

type Tab = 'people' | 'game' | 'tables' | 'overview' | 'audit';

const TABS: TabDef<Tab>[] = [
  { id: 'people', label: 'Участники', icon: <Users size={16} /> },
  { id: 'game', label: 'Раунды и правила', icon: <Flag size={16} /> },
  { id: 'tables', label: 'Столы', icon: <LayoutGrid size={16} /> },
  { id: 'overview', label: 'Итоги', icon: <Trophy size={16} /> },
  { id: 'audit', label: 'Аудит', icon: <ScrollText size={16} /> },
];

export function AdminPage() {
  const toast = useToast();
  const ask = useConfirm();
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newGame, setNewGame] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const [tableId, setTableId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const g = await supabase.from('games').select('*').eq('is_active', true).maybeSingle();
    if (g.error) {
      toast.error(errText(g.error));
      return;
    }
    const activeGame = (g.data as Game | null) ?? null;
    setGame(activeGame);
    if (!activeGame) {
      setTeams([]);
      setPeople([]);
      return;
    }
    const [t, p] = await Promise.all([
      supabase.from('teams').select('*').eq('game_id', activeGame.id).order('created_at'),
      supabase.from('profiles').select('*').eq('game_id', activeGame.id).neq('role', 'superadmin').order('full_name'),
    ]);
    const firstError = t.error ?? p.error;
    if (firstError) {
      toast.error(errText(firstError));
      return;
    }
    setTeams((t.data ?? []) as Team[]);
    setPeople((p.data ?? []) as Profile[]);
    setRefreshKey((k) => k + 1);
  }, [toast]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function run(action: () => PromiseLike<{ error: unknown }>, success?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await action();
      if (error) toast.error(errText(error));
      else if (success) toast.success(success);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      await load();
      setBusy(false);
    }
  }

  function movePerson(personId: string, teamId: string | null) {
    // Оптимистично; при ошибке load() вернёт реальное состояние.
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, team_id: teamId } : p)));
    void run(() => supabase.from('profiles').update({ team_id: teamId }).eq('id', personId));
  }

  function changeRole(person: Profile, role: Role) {
    if (role === person.role) return;
    setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, role } : p)));
    void run(() => supabase.from('profiles').update({ role }).eq('id', person.id));
  }

  async function startGame(e: FormEvent) {
    e.preventDefault();
    const name = newGame.trim();
    if (!name) return;
    const ok = await ask({
      title: game ? 'Начать новую игру?' : `Запустить игру «${name}»?`,
      message: game
        ? `Игра «${game.name}» будет завершена. Участники в новую игру не переносятся — в ней регистрируются заново.`
        : 'Новые участники будут попадать в эту игру при регистрации.',
      confirmLabel: 'Запустить',
      danger: Boolean(game),
    });
    if (ok === null) return;
    setNewGame('');
    void run(() => supabase.rpc('start_game', { p_name: name }), `Игра «${name}» запущена`);
  }

  const selectedTable = teams.find((t) => t.id === tableId) ?? teams[0] ?? null;

  return (
    <>
      <section className="card admin-hero">
        <div className="card-head">
          <div>
            <span className="section-title">Панель ведущей</span>
            <h1 className="team-name">{game ? game.name : 'Игра не запущена'}</h1>
            <div className="card-sub">
              {game ? `${teams.length} столов · ${people.length} человек` : 'Создайте игру, чтобы участники могли регистрироваться.'}
            </div>
          </div>
          <form className="row" onSubmit={(e) => void startGame(e)}>
            <input
              className="input new-game-input"
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              placeholder="Название новой игры"
              maxLength={100}
              aria-label="Название новой игры"
            />
            <button type="submit" className={game ? 'btn btn-secondary' : 'btn btn-primary'} disabled={busy || !newGame.trim()}>
              <Rocket size={16} />
              {game ? 'Новая игра' : 'Запустить'}
            </button>
          </form>
        </div>
      </section>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Разделы админки" />

      {tab === 'people' &&
        (game ? (
          <PeoplePanel
            teams={teams}
            people={people}
            busy={busy}
            onMove={movePerson}
            onRole={changeRole}
            onAddTeam={(name) => void run(() => supabase.from('teams').insert({ game_id: game.id, name }), `Стол «${name}» добавлен`)}
            onRemoveTeam={(t) => void run(() => supabase.from('teams').delete().eq('id', t.id), `Стол «${t.name}» удалён`)}
            onSplit={() => void run(() => supabase.rpc('split_evenly'), 'Участники распределены поровну')}
          />
        ) : (
          <NoGame />
        ))}

      {tab === 'game' && (game ? <GameControl game={game} onChanged={() => void load()} /> : <NoGame />)}

      {tab === 'tables' &&
        (!game ? (
          <NoGame />
        ) : !selectedTable ? (
          <Empty title="Столов пока нет">Создайте столы во вкладке «Участники».</Empty>
        ) : (
          <>
            <Tabs
              pills
              label="Столы"
              tabs={teams.map((t) => ({ id: t.id, label: t.name }))}
              value={selectedTable.id}
              onChange={setTableId}
            />
            <TeamWorkspace key={selectedTable.id} teamId={selectedTable.id} mode="staff" />
          </>
        ))}

      {tab === 'overview' && (game ? <Overview game={game} teams={teams} /> : <NoGame />)}

      {tab === 'audit' && <AuditSection refreshKey={refreshKey} />}
    </>
  );
}

function NoGame() {
  return <Empty title="Активной игры нет">Запустите игру в шапке панели.</Empty>;
}
