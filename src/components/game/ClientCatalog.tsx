import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { useT } from '../../i18n/prefs';
import { supabase } from '../../lib/supabase';
import { verticalStyle } from '../../lib/verticals';
import type { Client } from '../../lib/types';
import { ClientDialog } from './ClientDialog';

// Каталог клиентов только для чтения: можно изучать портфель, пока не началась раскладка.
export function ClientCatalog() {
  const t = useT();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Client | null>(null);

  useEffect(() => {
    void supabase
      .from('clients')
      .select('*')
      .eq('in_game', true)
      .order('sort')
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => `${c.code} ${c.name} ${c.industry}`.toLowerCase().includes(q)) : clients;
  }, [clients, query]);

  if (clients.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <BookOpen size={20} />
          <div>
            <h2>{t('catalog.title', { n: clients.length })}</h2>
            <div className="card-sub">{t('catalog.sub')}</div>
          </div>
        </div>
        <label className="row search">
          <Search size={16} className="muted" />
          <input className="input select-sm" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        </label>
      </div>
      <div className="hints-grid">
        {visible.map((c) => (
          <button key={c.code} type="button" className="hint-row catalog-row" onClick={() => setOpen(c)}>
            <span className="code-badge" style={verticalStyle(c.code)}>
              {c.code}
            </span>
            <span className="grow">
              <span className="name">{c.name}</span>
              <span className="chip-sub">
                {c.industry} · {c.kl_related}
              </span>
            </span>
          </button>
        ))}
      </div>
      {open && (
        <ClientDialog
          client={open}
          hints={[]}
          placement={undefined}
          staff={false}
          busy={false}
          hintLock={t('catalog.hintLater')}
          onBuyHint={async () => false}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
