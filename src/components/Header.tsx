import { useAuth } from '../auth';

const ROLE_LABEL = { superadmin: 'Супер-админ', captain: 'Капитан', member: 'Участник', curator: 'Куратор' } as const;

export function Header() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <header className="header">
      <div>
        <strong>{profile.full_name || profile.username}</strong>
        <span className="badge">{ROLE_LABEL[profile.role]}</span>
      </div>
      <button className="secondary" onClick={() => void signOut()}>
        Выйти
      </button>
    </header>
  );
}
