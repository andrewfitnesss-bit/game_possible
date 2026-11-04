import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Check, Crown, Eye, Hourglass, Minus, MoreHorizontal, Pencil, Plus, Shuffle, Trash2, UserCog, Users, X } from 'lucide-react';
import { usePrefs, type TKey } from '../../i18n/prefs';
import { pickCapitals } from '../../lib/capitals';
import type { Profile, Role, Team } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Menu, type MenuEntry } from '../../ui/Menu';
import { Avatar, Empty, Stat } from '../../ui/kit';

const UNASSIGNED = 'unassigned';
const ROLES: Role[] = ['member', 'captain', 'curator'];
const MAX_BULK = 30;

interface Props {
  teams: Team[];
  people: Profile[];
  busy: boolean;
  onMove: (personId: string, teamId: string | null) => void;
  onRole: (person: Profile, role: Role) => void;
  onAddTeams: (names: string[]) => void;
  onRenameTeam: (team: Team, name: string) => Promise<boolean>;
  onRemoveTeam: (team: Team) => void;
  onSplit: () => void;
}

function RoleTag({ role }: { role: Role }) {
  const { t } = usePrefs();
  if (role === 'member') return null;
  return (
    <span className={role === 'captain' ? 'role-tag captain' : 'role-tag curator'} title={t(`role.${role}` as TKey)}>
      {role === 'captain' ? <Crown size={12} /> : <Eye size={12} />}
      {t(`role.${role}` as TKey)}
    </span>
  );
}

function PersonBody({ person }: { person: Profile }) {
  const name = person.full_name || person.username;
  return (
    <>
      <Avatar name={name} size="sm" />
      <div className="grow">
        <span className="name" title={name}>
          {name}
        </span>
        <span className="person-sub">
          <span className="handle">@{person.username}</span>
          <RoleTag role={person.role} />
        </span>
      </div>
    </>
  );
}

function PersonCard({ person, menu }: { person: Profile; menu: MenuEntry[] }) {
  const { t } = usePrefs();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: person.id });
  const label = t('people.roleAria', { name: person.full_name || person.username });
  return (
    <div ref={setNodeRef} className={`person draggable${isDragging ? ' is-dragging' : ''}`} {...listeners} {...attributes}>
      <PersonBody person={person} />
      <Menu
        label={label}
        entries={menu}
        trigger={(p) => (
          <button type="button" className="kebab" onPointerDown={(e) => e.stopPropagation()} aria-label={label} {...p}>
            <MoreHorizontal size={18} />
          </button>
        )}
      />
    </div>
  );
}

function LaneTitle({ team, busy, onRename }: { team: Team; busy: boolean; onRename: (name: string) => Promise<boolean> }) {
  const { t } = usePrefs();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(team.name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() === team.name || (await onRename(value.trim()))) setEditing(false);
  }

  if (editing) {
    return (
      <form className="lane-rename" onSubmit={(e) => void submit(e)}>
        <input
          className="input select-sm"
          autoFocus
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          aria-label={t('ws.rename')}
        />
        <button type="submit" className="btn btn-primary btn-icon btn-sm" disabled={busy || value.trim().length < 2} aria-label={t('common.save')}>
          <Check size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(false)} aria-label={t('common.cancel')}>
          <X size={14} />
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="lane-title"
      onClick={() => {
        setValue(team.name);
        setEditing(true);
      }}
      title={t('ws.rename')}
    >
      <h3>{team.name}</h3>
      <Pencil size={13} className="lane-title-edit" />
    </button>
  );
}

function TeamLane({ id, head, children, className }: { id: string; head: ReactNode; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`lane ${className ?? ''}${isOver ? ' is-over' : ''}`}>
      {head}
      {children}
    </section>
  );
}

export function PeoplePanel({ teams, people, busy, onMove, onRole, onAddTeams, onRenameTeam, onRemoveTeam, onSplit }: Props) {
  const { t, lang } = usePrefs();
  const ask = useConfirm();
  const [count, setCount] = useState(6);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const byTeam = useMemo(() => {
    const map = new Map<string, Profile[]>([[UNASSIGNED, []]]);
    for (const team of teams) map.set(team.id, []);
    for (const p of people) (map.get(p.team_id ?? UNASSIGNED) ?? map.get(UNASSIGNED))?.push(p);
    return map;
  }, [teams, people]);

  const waiting = byTeam.get(UNASSIGNED) ?? [];
  const players = people.filter((p) => p.role !== 'curator');
  const dragged = dragging ? people.find((p) => p.id === dragging) : undefined;
  const tablesForHint = teams.length || count;

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const target = String(e.over.id);
    const teamId = target === UNASSIGNED ? null : target;
    const person = people.find((p) => p.id === String(e.active.id));
    if (person && person.team_id !== teamId) onMove(person.id, teamId);
  }

  // Новые столы получают случайные столицы, которых ещё нет в этой игре.
  function addTables() {
    const names = pickCapitals(count, lang, teams.map((x) => x.name));
    if (names.length) onAddTeams(names);
  }

  async function split() {
    const ok = await ask({ title: t('people.splitTitle'), message: t('people.splitText'), confirmLabel: t('people.split') });
    if (ok !== null) onSplit();
  }

  async function removeTeam(team: Team) {
    const ok = await ask({ title: t('people.removeTitle', { name: team.name }), message: t('people.removeText'), confirmLabel: t('common.delete'), danger: true });
    if (ok !== null) onRemoveTeam(team);
  }

  function menuFor(p: Profile): MenuEntry[] {
    return [
      { type: 'label', label: t('people.role') },
      ...ROLES.map((r): MenuEntry => ({ type: 'item', label: t(`role.${r}` as TKey), checked: p.role === r, onSelect: () => onRole(p, r) })),
      { type: 'sep' },
      { type: 'label', label: t('people.seat') },
      { type: 'item', label: t('people.waitingLane'), checked: !p.team_id, onSelect: () => onMove(p.id, null) },
      ...teams.map((team): MenuEntry => ({ type: 'item', label: team.name, checked: p.team_id === team.id, onSelect: () => onMove(p.id, team.id) })),
    ];
  }

  const cards = (list: Profile[]) => list.map((p) => <PersonCard key={p.id} person={p} menu={menuFor(p)} />);

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label={t('people.players')} icon={<Users />} value={players.length} />
        <Stat label={t('people.waiting')} icon={<Hourglass />} value={waiting.length} />
        <Stat label={t('people.captains')} icon={<Crown />} value={people.filter((p) => p.role === 'captain').length} />
        <Stat label={t('people.curators')} icon={<UserCog />} value={people.filter((p) => p.role === 'curator').length} />
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Users size={20} />
            <div>
              <h2>{t('people.title')}</h2>
              <div className="card-sub">
                {players.length > 0
                  ? t('people.perTable', { players: players.length, tables: tablesForHint, per: Math.ceil(players.length / tablesForHint) })
                  : t('people.sub')}
              </div>
            </div>
          </div>
          <div className="row">
            <div className="stepper-input" role="group" aria-label={t('people.bulkCount')}>
              <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} disabled={count <= 1} aria-label="−1">
                <Minus size={14} />
              </button>
              <span className="num">{count}</span>
              <button type="button" onClick={() => setCount((n) => Math.min(MAX_BULK, n + 1))} disabled={count >= MAX_BULK} aria-label="+1">
                <Plus size={14} />
              </button>
            </div>
            <button type="button" className={teams.length ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'} disabled={busy} onClick={addTables} title={t('people.bulkHintEmpty')}>
              <Plus size={16} /> {t('people.addTables')}
            </button>
            <button
              type="button"
              className={teams.length && waiting.length ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => void split()}
              disabled={busy || teams.length === 0 || players.length === 0}
            >
              <Shuffle size={16} /> {t('people.split')}
            </button>
          </div>
        </div>

        <DndContext sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="people-layout">
            <TeamLane
              id={UNASSIGNED}
              className="waiting-lane"
              head={
                <div className="lane-head">
                  <span className="lane-icon pool">
                    <Hourglass size={16} />
                  </span>
                  <h3 className="grow">{t('people.waitingLane')}</h3>
                  <span className={waiting.length ? 'badge badge-warning' : 'badge badge-success'}>{waiting.length}</span>
                </div>
              }
            >
              <div className="people-list">{waiting.length ? cards(waiting) : <div className="slot-empty">{t('people.allSeated')}</div>}</div>
            </TeamLane>

            {teams.length === 0 ? (
              <Empty icon={<Users />} title={t('people.noTables')}>
                {t('people.noTablesText')}
              </Empty>
            ) : (
              <div className="team-board">
                {teams.map((team, i) => {
                  const members = byTeam.get(team.id) ?? [];
                  const hasCaptain = members.some((m) => m.role === 'captain');
                  return (
                    <TeamLane
                      key={team.id}
                      id={team.id}
                      head={
                        <div className="lane-head">
                          <span className="lane-icon">{i + 1}</span>
                          <div className="grow lane-title-wrap">
                            <LaneTitle team={team} busy={busy} onRename={(name) => onRenameTeam(team, name)} />
                            {members.length > 0 && !hasCaptain && <span className="xsmall text-danger">{t('people.noCaptain')}</span>}
                          </div>
                          <span className="badge">{members.length}</span>
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => void removeTeam(team)} aria-label={t('people.removeAria', { name: team.name })}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      }
                    >
                      <div className="people-list">{members.length ? cards(members) : <div className="slot-empty">{t('people.dropHere')}</div>}</div>
                    </TeamLane>
                  );
                })}
              </div>
            )}
          </div>
          <DragOverlay>
            {dragged ? (
              <div className="person overlay">
                <PersonBody person={dragged} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>
    </div>
  );
}
