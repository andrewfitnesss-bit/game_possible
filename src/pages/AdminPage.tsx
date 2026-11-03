import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Activity, Flag, LayoutGrid, Rocket, ScrollText, Users } from 'lucide-react';
import { AuditSection } from '../components/AuditSection';
import { GameControl } from '../components/admin/GameControl';
import { Overview } from '../components/admin/Overview';
import { PeoplePanel } from '../components/admin/PeoplePanel';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import { useT } from '../i18n/prefs';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { Game, Profile, Role, Team } from '../lib/types';
import { useConfirm } from '../ui/Confirm';
import { useToast } from '../ui/Toast';
import { Empty, Tabs, type TabDef } from '../ui/kit';

type Tab = 'people' | 'game' | 'tables' | 'overview' | 'audit';

export function AdminPage() {
  const t = useT();
  const toast = useToast();
  const ask = useConfirm();
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newGame, setNewGame] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const TABS: TabDef<Tab>[] = [
    { id: 'people', label: t('admin.tabPeople'), icon: <Users size={16} /> },
    { id: 'game', label: t('admin.tabGame'), icon: <Flag size={16} /> },
    { id: 'tables', label: t('admin.tabTables'), icon: <LayoutGrid size={16} /> },
    { id: 'overview', label: t('admin.tabProgress'), icon: <Activity size={16} /> },
    { id: 'audit', label: t('admin.tabAudit'), icon: <ScrollText size={16} /> },
  ];
  const [tableId, setTableId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const g = await supabase.from('games').select('*').eq('is_active', true).maybeSingle();
    if (g.error) {
      toast.error(errText(g.error, t));
      return;
    }
    const activeGame = (g.data as Game | null) ?? null;
    setGame(activeGame);
    if (!activeGame) {
      setTeams([]);
      setPeople([]);
      return;
    }
    const [tm, pr] = await Promise.all([
      supabase.from('teams').select('*').eq('game_id', activeGame.id).order('created_at'),
      supabase.from('profiles').select('*').eq('game_id', activeGame.id).neq('role', 'superadmin').order('full_name'),
    ]);
    const firstError = tm.error ?? pr.error;
    if (firstError) {
      toast.error(errText(firstError, t));
      return;
    }
    setTeams((tm.data ?? []) as Team[]);
    setPeople((pr.data ?? []) as Profile[]);
    setRefreshKey((k) => k + 1);
  }, [toast, t]);

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
      if (error) toast.error(errText(error, t));
      else if (success) toast.success(success);
    } catch (e) {
      toast.error(errText(e, t));
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
      title: game ? t('admin.newGameTitle') : t('admin.startTitle', { name }),
      message: game ? t('admin.newGameText', { name: game.name }) : t('admin.startText'),
      confirmLabel: t('admin.start'),
      danger: Boolean(game),
    });
    if (ok === null) return;
    setNewGame('');
    void run(() => supabase.rpc('start_game', { p_name: name }), t('admin.started', { name }));
  }

  const selectedTable = teams.find((t) => t.id === tableId) ?? teams[0] ?? null;

  return (
    <>
      <section className="card admin-hero">
        <div className="card-head">
          <div>
            <span className="section-title">{t('admin.panel')}</span>
            <h1 className="team-name">{game ? game.name : t('admin.noGame')}</h1>
            <div className="card-sub">{game ? t('admin.stats', { teams: teams.length, people: people.length }) : t('admin.createHint')}</div>
          </div>
          <form className="row" onSubmit={(e) => void startGame(e)}>
            <input
              className="input new-game-input"
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              placeholder={t('admin.newGamePh')}
              maxLength={100}
              aria-label={t('admin.newGamePh')}
            />
            <button type="submit" className={game ? 'btn btn-secondary' : 'btn btn-primary'} disabled={busy || !newGame.trim()}>
              <Rocket size={16} />
              {game ? t('admin.newGame') : t('admin.start')}
            </button>
          </form>
        </div>
      </section>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label={t('admin.sections')} />

      {tab === 'people' &&
        (game ? (
          <PeoplePanel
            teams={teams}
            people={people}
            busy={busy}
            onMove={movePerson}
            onRole={changeRole}
            onAddTeam={(name) => void run(() => supabase.from('teams').insert({ game_id: game.id, name }), t('admin.tableAdded', { name }))}
            onRemoveTeam={(team) => void run(() => supabase.from('teams').delete().eq('id', team.id), t('admin.tableRemoved', { name: team.name }))}
            onSplit={() => void run(() => supabase.rpc('split_evenly'), t('admin.splitDone'))}
          />
        ) : (
          <NoGame />
        ))}

      {tab === 'game' && (game ? <GameControl game={game} onChanged={() => void load()} /> : <NoGame />)}

      {tab === 'tables' &&
        (!game ? (
          <NoGame />
        ) : !selectedTable ? (
          <Empty title={t('admin.noTables')}>{t('admin.noTablesText')}</Empty>
        ) : (
          <>
            <Tabs
              pills
              label={t('admin.tables')}
              tabs={teams.map((team) => ({ id: team.id, label: team.name }))}
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
  const t = useT();
  return <Empty title={t('admin.noGameTitle')}>{t('admin.noGameText')}</Empty>;
}
