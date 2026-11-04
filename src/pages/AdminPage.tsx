import { useCallback, useEffect, useState } from 'react';
import { Activity, Flag, LayoutGrid, MonitorPlay, Rocket, ScrollText, UserRoundPlus, Users } from 'lucide-react';
import { AuditSection } from '../components/AuditSection';
import { GameControl } from '../components/admin/GameControl';
import { NewGameDialog, type StartMode } from '../components/admin/NewGameDialog';
import { Overview } from '../components/admin/Overview';
import { PeoplePanel } from '../components/admin/PeoplePanel';
import { TeamWorkspace } from '../components/game/TeamWorkspace';
import { useT } from '../i18n/prefs';
import { openProjector } from './ProjectorPage';
import { errText } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { Game, Profile, Role, Team } from '../lib/types';
import { useToast } from '../ui/Toast';
import { Empty, Tabs, type TabDef } from '../ui/kit';

type Tab = 'people' | 'game' | 'tables' | 'overview' | 'audit';

export function AdminPage() {
  const t = useT();
  const toast = useToast();
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stuck, setStuck] = useState(0);
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
      setStuck(0);
      return;
    }
    const [tm, pr, st] = await Promise.all([
      // Второй ключ сортировки — id: у столов, созданных одним запросом, время совпадает, и без него
      // порядок (а с ним номера столов) прыгал бы после каждого переименования.
      supabase.from('teams').select('*').eq('game_id', activeGame.id).order('created_at').order('id'),
      supabase.from('profiles').select('*').eq('game_id', activeGame.id).neq('role', 'superadmin').order('full_name'),
      // Игроки, оставшиеся в прошлых играх (или без игры) — их можно перенести в текущую.
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .neq('role', 'superadmin')
        .or(`game_id.is.null,game_id.neq.${activeGame.id}`),
    ]);
    setStuck(st.count ?? 0);
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, () => void load())
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

  async function startGame(name: string, mode: StartMode): Promise<boolean> {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('start_game', { p_name: name, p_mode: mode });
      if (error) {
        toast.error(errText(error, t));
        return false;
      }
      toast.success(t('admin.started', { name }));
      return true;
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function renameTeam(teamId: string, name: string): Promise<boolean> {
    const { error } = await supabase.rpc('rename_team', { p_team: teamId, p_name: name });
    if (error) {
      toast.error(errText(error, t));
      return false;
    }
    await load();
    return true;
  }

  async function adoptPlayers() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('adopt_players');
      if (error) toast.error(errText(error, t));
      else toast.success(t('admin.adopted', { n: Number(data ?? 0) }));
    } finally {
      await load();
      setBusy(false);
    }
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
          <div className="row">
            {game && (
              <button type="button" className="btn btn-secondary" onClick={openProjector} title={t('proj.openHint')}>
                <MonitorPlay size={16} />
                {t('proj.open')}
              </button>
            )}
            <button type="button" className={game ? 'btn btn-secondary' : 'btn btn-primary'} disabled={busy} onClick={() => setCreating(true)}>
              <Rocket size={16} />
              {game ? t('admin.newGame') : t('admin.start')}
            </button>
          </div>
        </div>
      </section>

      {game && stuck > 0 && (
        <div className="callout callout-warning stuck">
          <UserRoundPlus size={18} />
          <div className="grow">
            <strong>{t('admin.stuckTitle', { n: stuck })}</strong>
            <div className="small">{t('admin.stuckText')}</div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void adoptPlayers()}>
            {t('admin.adopt')}
          </button>
        </div>
      )}

      {creating && <NewGameDialog current={game} busy={busy} onStart={startGame} onClose={() => setCreating(false)} />}

      <Tabs tabs={TABS} value={tab} onChange={setTab} label={t('admin.sections')} />

      {tab === 'people' &&
        (game ? (
          <PeoplePanel
            teams={teams}
            people={people}
            busy={busy}
            onMove={movePerson}
            onRole={changeRole}
            onAddTeams={(names) =>
              void run(
                () => {
                  // Время с шагом в 1 мс сохраняет порядок создания столов.
                  const base = Date.now();
                  return supabase
                    .from('teams')
                    .insert(names.map((name, i) => ({ game_id: game.id, name, created_at: new Date(base + i).toISOString() })));
                },
                t('admin.tablesAdded', { n: names.length, names: names.join(', ') }),
              )
            }
            onRenameTeam={(team, name) => renameTeam(team.id, name)}
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
