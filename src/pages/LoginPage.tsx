import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
      const result =
        mode === 'login' ? await signIn(username, password) : await signUp(username, password, fullName);
      if (result) setError(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow" onSubmit={(e) => void onSubmit(e)}>
      <h1>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>

      {mode === 'register' && (
        <label>
          Имя и фамилия
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
        </label>
      )}

      <label>
        Логин
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </label>

      <label>
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
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy}>
        {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
      >
        {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
      </button>
    </form>
  );
}
