import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowRightLeft, Building2, CircleCheck, Eye, Headset, Inbox } from 'lucide-react';
import { hasApproved, SPEC_LABEL } from '../../lib/game';
import type { Bucket, Client, GameSettings, Placement, Purchase, Specialization, TeamKam } from '../../lib/types';
import type { MenuEntry } from '../../ui/Menu';
import { ChipBody, ClientChip } from './ClientChip';

// Цель перемещения: pool | mm | k<номер>-active | k<номер>-maint
type Target = { bucket: Bucket | null; kam: number | null };

function parseTarget(id: string): Target | null {
  if (id === 'pool') return { bucket: null, kam: null };
  if (id === 'mm') return { bucket: 'midmarket', kam: null };
  const m = /^k(\d+)-(active|maint)$/.exec(id);
  return m ? { bucket: m[2] === 'active' ? 'active' : 'maintenance', kam: Number(m[1]) } : null;
}

function targetId(p: Placement | undefined): string {
  if (!p) return 'pool';
  if (p.bucket === 'midmarket') return 'mm';
  return `k${p.kam}-${p.bucket === 'active' ? 'active' : 'maint'}`;
}

interface Props {
  clients: Client[];
  placements: Placement[];
  kams: TeamKam[];
  purchases: Purchase[];
  settings: GameSettings;
  canEdit: boolean;
  canSpec: boolean;
  onMove: (client: string, bucket: Bucket | null, kam: number | null, ssm: number | null) => Promise<boolean>;
  onSpec: (kam: number, spec: Specialization | null) => void;
  onOpen: (client: Client) => void;
}

export function TeamBoard({ clients, placements, kams, purchases, settings, canEdit, canSpec, onMove, onSpec, onOpen }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  // Оптимистичные перемещения до ответа сервера.
  const [optimistic, setOptimistic] = useState<Record<string, Placement | null>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => setOptimistic({}), [placements]);

  const effective = useMemo(() => {
    const map = new Map(placements.map((p) => [p.client_code, p]));
    for (const [code, p] of Object.entries(optimistic)) {
      if (p) map.set(code, p);
      else map.delete(code);
    }
    return map;
  }, [placements, optimistic]);

  const inGame = useMemo(() => clients.filter((c) => c.in_game), [clients]);
  const list = [...effective.values()];
  const consult = hasApproved(purchases, 'CONSULT');
  const specOptions = (Object.keys(SPEC_LABEL) as Specialization[]).filter((s) => s !== 'other_enterprise' || consult);

  const count = (id: string) => list.filter((p) => targetId(p) === id).length;
  const limitOf = (id: string): number | undefined =>
    id.endsWith('-active') ? settings.max_active_per_kam : id.endsWith('-maint') ? settings.max_maint_per_kam : undefined;
  const isFull = (id: string, code?: string) => {
    const limit = limitOf(id);
    if (limit === undefined) return false;
    const inside = code ? targetId(effective.get(code)) === id : false;
    return !inside && count(id) >= limit;
  };
  const ssmLoad = (n: number) => list.filter((p) => p.ssm === n).length;
  const hintsOf = (code: string) => ({ h1: hasApproved(purchases, 'HINT1', code), h2: hasApproved(purchases, 'HINT2', code) });

  async function moveTo(code: string, id: string, ssmOverride?: number | null) {
    const target = parseTarget(id);
    if (!target) return;
    const current = effective.get(code);
    const ssm = target.bucket === 'active' ? (ssmOverride !== undefined ? ssmOverride : (current?.ssm ?? null)) : null;
    if (targetId(current) === id && (current?.ssm ?? null) === ssm) return;
    setOptimistic((o) => ({
      ...o,
      [code]: target.bucket
        ? { team_id: current?.team_id ?? '', client_code: code, bucket: target.bucket, kam: target.kam, ssm }
        : null,
    }));
    const ok = await onMove(code, target.bucket, target.kam, ssm);
    if (!ok) {
      setOptimistic((o) => {
        const next = { ...o };
        delete next[code];
        return next;
      });
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (e.over) void moveTo(String(e.active.id), String(e.over.id));
  }

  function menuFor(c: Client): MenuEntry[] | null {
    const current = targetId(effective.get(c.code));
    const p = effective.get(c.code);
    const entries: MenuEntry[] = [{ type: 'item', label: 'Открыть карточку', icon: <Eye size={16} />, onSelect: () => onOpen(c) }];
    if (!canEdit) return entries;
    entries.push({ type: 'sep' }, { type: 'label', label: 'Переместить' });
    const option = (id: string, label: string) =>
      entries.push({
        type: 'item',
        label,
        checked: current === id,
        disabled: isFull(id, c.code),
        onSelect: () => void moveTo(c.code, id),
      });
    for (let k = 1; k <= settings.kams; k += 1) {
      option(`k${k}-active`, `KAM ${k} · Active`);
      option(`k${k}-maint`, `KAM ${k} · Maintenance`);
    }
    option('mm', 'MidMarket');
    option('pool', 'Снять с доски');
    if (p?.bucket === 'active') {
      entries.push({ type: 'sep' }, { type: 'label', label: 'Solution Sales Manager' });
      entries.push({ type: 'item', label: 'Без SSM', checked: !p.ssm, onSelect: () => void moveTo(c.code, current, null) });
      for (let n = 1; n <= settings.ssm_count; n += 1) {
        entries.push({
          type: 'item',
          label: `SSM ${n} · ${ssmLoad(n)}/${settings.ssm_max_clients}`,
          icon: <Headset size={16} />,
          checked: p.ssm === n,
          disabled: p.ssm !== n && ssmLoad(n) >= settings.ssm_max_clients,
          onSelect: () => void moveTo(c.code, current, n),
        });
      }
    }
    return entries;
  }

  const chipsIn = (id: string) =>
    inGame
      .filter((c) => targetId(effective.get(c.code)) === id)
      .map((c) => (
        <ClientChip
          key={c.code}
          client={c}
          placement={effective.get(c.code)}
          hints={hintsOf(c.code)}
          draggable={canEdit}
          menu={menuFor(c)}
          onOpen={() => onOpen(c)}
        />
      ));

  const poolClients = chipsIn('pool');
  const draggedClient = dragging ? inGame.find((c) => c.code === dragging) : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="board">
        <Zone
          id="pool"
          className="lane pool"
          head={
            <div className="lane-head">
              <span className="lane-icon pool">
                <Inbox size={16} />
              </span>
              <div className="grow">
                <h3>Не распределены</h3>
                <span className="muted xsmall">
                  {canEdit ? 'Перетащите клиента к KAM или в MidMarket, либо используйте меню «⋯»' : 'Раскладку делает капитан'}
                </span>
              </div>
              <span className="badge">{poolClients.length}</span>
            </div>
          }
        >
          {poolClients.length ? (
            <div className="pool-grid">{poolClients}</div>
          ) : (
            <div className="pool-done">
              <CircleCheck size={18} /> Все клиенты распределены
            </div>
          )}
        </Zone>

        <div className="board-grid">
          {Array.from({ length: settings.kams }, (_, i) => {
            const k = i + 1;
            const spec = kams.find((x) => x.kam === k)?.specialization ?? null;
            return (
              <section key={k} className="lane" aria-label={`KAM ${k}`}>
                <div className="lane-head">
                  <span className="lane-icon">K{k}</span>
                  <div className="grow">
                    <h3>KAM {k}</h3>
                    {canSpec ? (
                      <select
                        className={spec ? 'spec-select set' : 'spec-select'}
                        aria-label={`Специализация KAM ${k}`}
                        value={spec ?? ''}
                        onChange={(e) => onSpec(k, (e.target.value || null) as Specialization | null)}
                      >
                        <option value="">+ специализация</option>
                        {specOptions.map((s) => (
                          <option key={s} value={s}>
                            {SPEC_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={spec ? 'badge badge-primary' : 'muted xsmall'}>
                        {spec ? SPEC_LABEL[spec] : 'Территориальный KAM'}
                      </span>
                    )}
                  </div>
                </div>
                <SlotZone id={`k${k}-active`} name="Active" kind="zone-active" limit={settings.max_active_per_kam} count={count(`k${k}-active`)} blocked={isFull(`k${k}-active`, dragging ?? undefined)}>
                  {chipsIn(`k${k}-active`)}
                </SlotZone>
                <SlotZone id={`k${k}-maint`} name="Maintenance" kind="zone-maint" limit={settings.max_maint_per_kam} count={count(`k${k}-maint`)} blocked={isFull(`k${k}-maint`, dragging ?? undefined)}>
                  {chipsIn(`k${k}-maint`)}
                </SlotZone>
              </section>
            );
          })}

          <section className="lane mm-col" aria-label="MidMarket">
            <div className="lane-head">
              <span className="lane-icon mm">
                <Building2 size={16} />
              </span>
              <div className="grow">
                <h3>MidMarket</h3>
                <span className="muted xsmall">Передача, без затрат Capacity</span>
              </div>
              <span className="badge">{count('mm')}</span>
            </div>
            <SlotZone id="mm" name="Transfer" kind="zone-mm" count={count('mm')} blocked={false}>
              {chipsIn('mm')}
            </SlotZone>
          </section>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
        {draggedClient ? (
          <div className="chip overlay">
            <ChipBody client={draggedClient} placement={effective.get(draggedClient.code)} hints={hintsOf(draggedClient.code)} />
            <ArrowRightLeft size={16} className="muted" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Zone({ id, className, head, children }: { id: string; className: string; head: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`${className}${isOver ? ' is-over' : ''}`}>
      {head}
      {children}
    </section>
  );
}

function SlotZone({
  id,
  name,
  kind,
  limit,
  count,
  blocked,
  children,
}: {
  id: string;
  name: string;
  kind: string;
  limit?: number;
  count: number;
  blocked: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const free = limit !== undefined ? Math.max(limit - count, 0) : 0;
  return (
    <div ref={setNodeRef} className={`zone ${kind}${isOver ? (blocked ? ' is-blocked' : ' is-over') : ''}`}>
      <div className="zone-head">
        <span className="zone-name">{name}</span>
        <span className={limit !== undefined && count >= limit ? 'zone-count full' : 'zone-count'}>
          {count}
          {limit !== undefined ? `/${limit}` : ''}
        </span>
      </div>
      {children}
      {Array.from({ length: free }, (_, i) => (
        <div key={i} className="slot-empty">
          свободно
        </div>
      ))}
    </div>
  );
}
