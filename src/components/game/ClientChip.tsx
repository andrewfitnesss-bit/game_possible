import { useDraggable } from '@dnd-kit/core';
import { MoreHorizontal, Headset } from 'lucide-react';
import { verticalStyle } from '../../lib/verticals';
import type { Client, Placement } from '../../lib/types';
import { Menu, type MenuEntry } from '../../ui/Menu';

interface Props {
  client: Client;
  placement: Placement | undefined;
  hints: { h1: boolean; h2: boolean };
  draggable: boolean;
  menu: MenuEntry[] | null;
  onOpen: () => void;
}

export function ChipBody({
  client,
  placement,
  hints,
  onOpen,
}: Pick<Props, 'client' | 'placement' | 'hints'> & { onOpen?: () => void }) {
  return (
    <>
      <span className="code-badge" style={verticalStyle(client.code)}>
        {client.code}
      </span>
      <button type="button" className="chip-main" onClick={onOpen} title={`${client.code} ${client.name}`}>
        <span className="chip-name">{client.name}</span>
        <span className="chip-line">
          <span className="chip-sub">{client.industry}</span>
          {hints.h1 && <span className="pip">H1</span>}
          {hints.h2 && <span className="pip">H2</span>}
          {placement?.ssm && (
            <span className="ssm-tag" title={`SSM ${placement.ssm}`}>
              <Headset size={11} />
              {placement.ssm}
            </span>
          )}
        </span>
      </button>
    </>
  );
}

export function ClientChip({ client, placement, hints, draggable, menu, onOpen }: Props) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: client.code, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      className={`chip${draggable ? ' draggable' : ''}${isDragging ? ' is-dragging' : ''}`}
      {...(draggable ? listeners : {})}
    >
      <ChipBody client={client} placement={placement} hints={hints} onOpen={onOpen} />
      {menu && (
        <Menu
          label={`Действия с ${client.code}`}
          entries={menu}
          trigger={(p) => (
            <button type="button" className="kebab" aria-label={`Действия с ${client.code}`} {...p}>
              <MoreHorizontal size={18} />
            </button>
          )}
        />
      )}
    </div>
  );
}
