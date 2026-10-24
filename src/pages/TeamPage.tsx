import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { Header } from '../components/Header';
import { supabase } from '../lib/supabase';
import type { Profile, Team } from '../lib/types';

export function TeamPage() {
  const { profile } = useAuth();
  const teamId = profile?.team_id ?? null;
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    let active = true;
    async function load() {
      const [t, m] = await Promise.all([
        supabase.from('teams').select('*').eq('id', teamId).maybeSingle(),
        supabase.from('profiles').select('*').eq('team_id', teamId).order('full_name'),
      ]);
      if (!active) return;
      if (t.error || m.error) {
        setError('Не удалось загрузить команду');
        return;
      }
      setError(null);
      setTeam(t.data as Team | null);
      setMembers((m.data ?? []) as Profile[]);
    }
    void load();
    const channel = supabase
      .channel(`team-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [teamId]);

  const canWrite = profile?.role === 'captain';

  return (
    <>
      <Header />
      <section className="card">
        <h2>Команда: {team?.name ?? '…'}</h2>
        <p className="muted">
          {canWrite
            ? 'Вы капитан: вносите данные команды.'
            : 'Данные команды вносит капитан, вам доступен просмотр.'}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <ul className="list">
          {members.map((m) => (
            <li key={m.id}>
              {m.full_name || m.username}
              {m.role === 'captain' && <span className="badge">Капитан</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
