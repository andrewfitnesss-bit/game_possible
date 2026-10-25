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
import { Crown, Hourglass, Plus, Shuffle, Trash2, UserCog, Users } from 'lucide-react';
import type { Profile, Role, Team } from '../../lib/types';
import { useConfirm } from '../../ui/Confirm';
import { Avatar, Stat } from '../../ui/kit';

const UNASSIGNED = 'unassigned';

const ROLE_OPTIONS: { id: Role; label: string }[] = [
  { id: 'member', label: 'Участник' },
  { id: 'captain', label: 'Капитан' },
  { id: 'curator', label: 'Куратор' },
];

interface Props {
  teams: Team[];
  people: Profile[];
  busy: boolean;
  onMove: (personId: string, teamId: string | null) => void;
  onRole: (person: Profile, role: Role) => void;
  onAddTeam: (name: string) => void;
  onRemoveTeam: (team: Team) => void;
  onSplit: () => void;
}

function PersonBody({ person, onRole }: { person: Profile; onRole?: (role: Role) => void }) {
  const name = person.full_name || person.username;
  return (
    <>
      <Avatar name={name} size="sm" />
      <div className="grow">
        <span className="name">{name}</span>
        <span className="handle">@{person.username}</span>
      </div>
      {onRole ? (
        <select
          className={`role-select ${person.role}`}
          value={person.role}
          onChange={(e) => onRole(e.target.value as Role)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Роль: ${name}`}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      ) : (
        <span className={`role-select ${person.role}`}>{ROLE_OPTIONS.find((r) => r.id === person.role)?.label}</span>
      )}
    </>
  );
}

function PersonCard({ person, onRole }: { person: Profile; onRole: (role: Role) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: person.id });
  return (
    <div ref={setNodeRef} className={`person draggable${isDragging ? ' is-dragging' : ''}`} {...listeners} {...attributes}>
      <PersonBody person={person} onRole={onRole} />
    </div>
  );
}

function TeamLane({ id, title, icon, count, extra, children }: { id: string; title: string; icon: ReactNode; count: number; extra?: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`lane${isOver ? ' is-over' : ''}`}>
      <div className="lane-head">
        <span className="lane-icon">{icon}</span>
        <div className="grow">
          <h3>{title}</h3>
        </div>
        <span className="badge">{count}</span>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function PeoplePanel({ teams, people, busy, onMove, onRole, onAddTeam, onRemoveTeam, onSplit }: Props) {
  const ask = useConfirm();
  const [newTeam, setNewTeam] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const byTeam = useMemo(() => {
    const map = new Map<string, Profile[]>([[UNASSIGNED, []]]);
    for (const t of teams) map.set(t.id, []);
    for (const p of people) (map.get(p.team_id ?? UNASSIGNED) ?? map.get(UNASSIGNED))?.push(p);
    return map;
  }, [teams, people]);

  const waiting = byTeam.get(UNASSIGNED) ?? [];
  const players = people.filter((p) => p.role !== 'curator');
  const dragged = dragging ? people.find((p) => p.id === dragging) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const target = String(e.over.id);
    const teamId = target === UNASSIGNED ? null : target;
    const person = people.find((p) => p.id === String(e.active.id));
    if (person && person.team_id !== teamId) onMove(person.id, teamId);
  }

  function addTeam(e: FormEvent) {
    e.preventDefault();
    const name = newTeam.trim();
    if (!name) return;
    setNewTeam('');
    onAddTeam(name);
  }

  async function split() {
    const ok = await ask({
      title: 'Разделить поровну?',
      message: 'Все участники и капитаны будут случайно распределены по столам поровну. Кураторы останутся на своих местах.',
      confirmLabel: 'Разделить',
    });
    if (ok !== null) onSplit();
  }

  async function removeTeam(t: Team) {
    const ok = await ask({
      title: `Удалить стол «${t.name}»?`,
      message: 'Участники стола вернутся в список ожидания. Доска и покупки стола будут удалены.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (ok !== null) onRemoveTeam(t);
  }

  const lanePeople = (list: Profile[]) =>
    list.length ? (
      <div className="stack people-list">
        {list.map((p) => (
          <PersonCard key={p.id} person={p} onRole={(role) => onRole(p, role)} />
        ))}
      </div>
    ) : (
      <div className="slot-empty">перетащите сюда</div>
    );

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label="Игроков" icon={<Users />} value={players.length} />
        <Stat label="Ждут стола" icon={<Hourglass />} value={waiting.length} />
        <Stat label="Капитанов" icon={<Crown />} value={people.filter((p) => p.role === 'captain').length} />
        <Stat label="Кураторов" icon={<UserCog />} value={people.filter((p) => p.role === 'curator').length} />
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Users size={20} />
            <div>
              <h2>Распределение по столам</h2>
              <div className="card-sub">Перетаскивайте людей между столами, роль выбирается на карточке</div>
            </div>
          </div>
          <div className="row">
            <form className="row" onSubmit={addTeam}>
              <input className="input select-sm team-input" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Название стола" maxLength={100} aria-label="Название стола" />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !newTeam.trim()}>
                <Plus size={16} /> Стол
              </button>
            </form>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void split()} disabled={busy || teams.length === 0 || players.length === 0}>
              <Shuffle size={16} /> Разделить поровну
            </button>
          </div>
        </div>

        <DndContext sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="team-board">
            <TeamLane id={UNASSIGNED} title="Ожидают назначения" icon={<Hourglass size={16} />} count={waiting.length}>
              {lanePeople(waiting)}
            </TeamLane>
            {teams.map((t, i) => (
              <TeamLane
                key={t.id}
                id={t.id}
                title={t.name}
                icon={i + 1}
                count={byTeam.get(t.id)?.length ?? 0}
                extra={
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => void removeTeam(t)} aria-label={`Удалить стол ${t.name}`}>
                    <Trash2 size={16} />
                  </button>
                }
              >
                {lanePeople(byTeam.get(t.id) ?? [])}
              </TeamLane>
            ))}
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
