import { useState, type FormEvent } from 'react';
import { Coins, LogIn, Swords, Target, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = mode === 'login' ? await signIn(username, password) : await signUp(username, password, fullName);
      if (result) setError(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="login">
      <section className="login-hero">
        <span className="login-kicker">Megaland · 2027</span>
        <h1 className="login-title">
          The NAL
          <br />
          Games
        </h1>
        <p className="login-sub">Mission: Possible</p>
        <div className="login-points">
          <span>
            <Target /> Портфель клиентов
          </span>
          <span>
            <Users /> KAM и SSM
          </span>
          <span>
            <Coins /> Бюджет на ходы
          </span>
          <span>
            <Swords /> Борьба столов
          </span>
        </div>
      </section>

      <form className="login-card form" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <h1>{mode === 'login' ? 'Вход в игру' : 'Регистрация'}</h1>
          <p className="muted small login-hint">
            {mode === 'login' ? 'Войдите под своим логином.' : 'После регистрации администратор распределит вас за стол.'}
          </p>
        </div>

        <div className="segmented" role="group" aria-label="Режим">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
            Вход
          </button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
            Регистрация
          </button>
        </div>

        {mode === 'register' && (
          <label className="field">
            Имя и фамилия
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoComplete="name" required />
          </label>
        )}

        <label className="field">
          Логин
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && (
          <div className="callout callout-danger" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="login-foot">The NAL Games · v{__APP_VERSION__}</p>
    </div>
  );
}
