import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { capacityUsed, hasApproved, SPEC_LABEL } from '../../lib/game';
import type { Bucket, Client, GameSettings, Placement, Purchase, Specialization, TeamKam } from '../../lib/types';

// Цель перетаскивания: pool | mm | k<номер>-active | k<номер>-maint
type Target = { bucket: Bucket | null; kam: number | null };

function parseTarget(id: string): Target | null {
  if (id === 'pool') return { bucket: null, kam: null };
  if (id === 'mm') return { bucket: 'midmarket', kam: null };
  const m = /^k(\d+)-(active|maint)$/.exec(id);
  if (!m) return null;
  return { bucket: m[2] === 'active' ? 'active' : 'maintenance', kam: Number(m[1]) };
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

function Zone({ id, title, count, limit, children }: { id: string; title: string; count: number; limit?: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const full = limit !== undefined && count >= limit;
  return (
    <div ref={setNodeRef} className={isOver ? 'zone over' : 'zone'}>
      <div className="zone-title">
        {title}{' '}
        <span className={full ? 'muted strong' : 'muted'}>
          {count}
          {limit !== undefined ? `/${limit}` : ''}
        </span>
      </div>
      {children}
    </div>
  );
}

interface CardProps {
  client: Client;
  placement: Placement | undefined;
  purchases: Purchase[];
  settings: GameSettings;
  canEdit: boolean;
  moveOptions: { id: string; label: string }[];
  onMoveTo: (id: string) => void;
  onSsm: (ssm: number | null) => void;
  onOpen: () => void;
}

function ClientChip({ client, placement, purchases, settings, canEdit, moveOptions, onMoveTo, onSsm, onOpen }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: client.code, disabled: !canEdit });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  const h1 = hasApproved(purchases, 'HINT1', client.code);
  const h2 = hasApproved(purchases, 'HINT2', client.code);
  return (
    <div ref={setNodeRef} style={style} className="client-chip">
      {canEdit && (
        <span className="grip" {...listeners} {...attributes} aria-label={`Перетащить ${client.code}`}>
          ⠿
        </span>
      )}
      <button type="button" className="client-name" onClick={onOpen} title={client.name}>
        <strong>{client.code}</strong> {client.name}
        <small className="muted"> · {client.industry}</small>
      </button>
      <span className="chip-badges">
        {h1 && <span className="tag">H1</span>}
        {h2 && <span className="tag">H2</span>}
        {placement?.bucket === 'active' &&
          (canEdit ? (
            <select
              aria-label={`SSM для ${client.code}`}
              value={placement.ssm ?? ''}
              onChange={(e) => onSsm(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">без SSM</option>
              {Array.from({ length: settings.ssm_count }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  SSM {i + 1}
                </option>
              ))}
            </select>
          ) : (
            placement.ssm && <span className="tag accent">SSM {placement.ssm}</span>
          ))}
        {canEdit && (
          <select
            aria-label={`Переместить ${client.code}`}
            className="move"
            value={targetId(placement)}
            onChange={(e) => onMoveTo(e.target.value)}
          >
            {moveOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </span>
    </div>
  );
}

export function TeamBoard({ clients, placements, kams, purchases, settings, canEdit, canSpec, onMove, onSpec, onOpen }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  // Оптимистичные перемещения до прихода ответа сервера.
  const [optimistic, setOptimistic] = useState<Record<string, Placement | null>>({});
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
  const used = capacityUsed(list, kams, settings);
  const oe = hasApproved(purchases, 'CONSULT');
  const specOptions = (Object.keys(SPEC_LABEL) as Specialization[]).filter((s) => s !== 'other_enterprise' || oe);

  const moveOptions = useMemo(() => {
    const opts = [{ id: 'pool', label: 'Не распределён' }];
    for (let k = 1; k <= settings.kams; k += 1) {
      opts.push({ id: `k${k}-active`, label: `KAM ${k} · Active` }, { id: `k${k}-maint`, label: `KAM ${k} · Maintenance` });
    }
    opts.push({ id: 'mm', label: 'MidMarket' });
    return opts;
  }, [settings.kams]);

  async function moveTo(code: string, id: string) {
    const target = parseTarget(id);
    if (!target) return;
    const current = effective.get(code);
    if (targetId(current) === id) return;
    const ssm = target.bucket === 'active' ? (current?.ssm ?? null) : null;
    setOptimistic((o) => ({
      ...o,
      [code]: target.bucket
        ? { team_id: current?.team_id ?? '', client_code: code, bucket: target.bucket, kam: target.kam, ssm }
        : null,
    }));
    const ok = await onMove(code, target.bucket, target.kam, ssm);
    if (!ok) setOptimistic((o) => {
      const next = { ...o };
      delete next[code];
      return next;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    if (e.over) void moveTo(String(e.active.id), String(e.over.id));
  }

  function chips(filter: (p: Placement | undefined) => boolean) {
    return inGame
      .filter((c) => filter(effective.get(c.code)))
      .map((c) => (
        <ClientChip
          key={c.code}
          client={c}
          placement={effective.get(c.code)}
          purchases={purchases}
          settings={settings}
          canEdit={canEdit}
          moveOptions={moveOptions}
          onMoveTo={(id) => void moveTo(c.code, id)}
          onSsm={(ssm) => {
            const p = effective.get(c.code);
            if (p) void onMove(c.code, p.bucket, p.kam, ssm);
          }}
          onOpen={() => onOpen(c)}
        />
      ));
  }

  const count = (f: (p: Placement) => boolean) => list.filter(f).length;
  const pool = inGame.filter((c) => !effective.has(c.code)).length;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="meters">
        <Meter label="Sales Capacity" value={used} max={settings.capacity} />
        {Array.from({ length: settings.ssm_count }, (_, i) => (
          <Meter key={i} label={`SSM ${i + 1}`} value={count((p) => p.ssm === i + 1)} max={settings.ssm_max_clients} />
        ))}
        <span className="muted small">
          Active — {settings.cost_active}, Maintenance — {settings.cost_maintenance}, специализация — {settings.cost_spec}
        </span>
      </div>

      <div className="nal-board">
        <Zone id="pool" title="Не распределены" count={pool}>
          {chips((p) => !p)}
        </Zone>

        {Array.from({ length: settings.kams }, (_, i) => {
          const k = i + 1;
          const spec = kams.find((x) => x.kam === k)?.specialization ?? null;
          return (
            <section key={k} className="kam">
              <h3>
                KAM {k}
                {canSpec ? (
                  <select
                    aria-label={`Специализация KAM ${k}`}
                    value={spec ?? ''}
                    onChange={(e) => onSpec(k, (e.target.value || null) as Specialization | null)}
                  >
                    <option value="">без специализации</option>
                    {specOptions.map((s) => (
                      <option key={s} value={s}>
                        {SPEC_LABEL[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  spec && <span className="tag accent">{SPEC_LABEL[spec]}</span>
                )}
              </h3>
              <Zone
                id={`k${k}-active`}
                title="Active"
                count={count((p) => p.kam === k && p.bucket === 'active')}
                limit={settings.max_active_per_kam}
              >
                {chips((p) => p?.kam === k && p.bucket === 'active')}
              </Zone>
              <Zone
                id={`k${k}-maint`}
                title="Maintenance"
                count={count((p) => p.kam === k && p.bucket === 'maintenance')}
                limit={settings.max_maint_per_kam}
              >
                {chips((p) => p?.kam === k && p.bucket === 'maintenance')}
              </Zone>
            </section>
          );
        })}

        <Zone id="mm" title="MidMarket" count={count((p) => p.bucket === 'midmarket')}>
          {chips((p) => p?.bucket === 'midmarket')}
        </Zone>
      </div>
    </DndContext>
  );
}

export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const over = value > max;
  return (
    <div className={over ? 'meter over' : 'meter'}>
      <span>
        {label}: <strong>{value}</strong> / {max}
      </span>
      <progress value={Math.min(value, max)} max={max} aria-label={label} />
    </div>
  );
}
