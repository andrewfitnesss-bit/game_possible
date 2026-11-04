import { useState, type FormEvent } from 'react';
import { Coins, LogIn, Settings2, Swords, Target, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth';
import { prefsEntries } from '../components/layout/AppShell';
import { usePrefs, type TKey } from '../i18n/prefs';
import { Menu } from '../ui/Menu';
import { MoneyRain } from '../ui/MoneyRain';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const prefs = usePrefs();
  const { t } = prefs;
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
      if (result) setError(result.startsWith('auth.') ? t(result as TKey) : result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
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
      <MoneyRain ambient />
      <div className="login-tools">
        <Menu
          label={t('shell.menu')}
          entries={prefsEntries(t, prefs, prefs.setPrefs)}
          trigger={(p) => (
            <button type="button" className="btn btn-ghost btn-sm login-prefs" {...p}>
              <Settings2 size={16} />
              {prefs.lang === 'ru' ? 'RU' : 'EN'}
            </button>
          )}
        />
      </div>

      <section className="login-hero">
        <span className="login-kicker">{prefs.theme === 'wallst' ? t('login.kickerWallst') : t('login.kicker')}</span>
        <h1 className="login-title">
          The NAL
          <br />
          Games
        </h1>
        <p className="login-sub">{prefs.theme === 'wallst' ? t('login.subWallst') : t('login.sub')}</p>
        <div className="login-points">
          <span>
            <Target /> {t('login.point1')}
          </span>
          <span>
            <Users /> {t('login.point2')}
          </span>
          <span>
            <Coins /> {t('login.point3')}
          </span>
          <span>
            <Swords /> {t('login.point4')}
          </span>
        </div>
      </section>

      <form className="login-card form" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <h1>{mode === 'login' ? t('login.titleLogin') : t('login.titleRegister')}</h1>
          <p className="muted small login-hint">{mode === 'login' ? t('login.hintLogin') : t('login.hintRegister')}</p>
        </div>

        <div className="segmented" role="group">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
            {t('login.tabLogin')}
          </button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
            {t('login.tabRegister')}
          </button>
        </div>

        {mode === 'register' && (
          <label className="field">
            {t('login.fullName')}
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoComplete="name" required />
          </label>
        )}

        <label className="field">
          {t('login.username')}
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
          {t('login.password')}
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
          {busy ? t('login.wait') : mode === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
        </button>
      </form>

      <p className="login-foot">The NAL Games · v{__APP_VERSION__}</p>
    </div>
  );
}
