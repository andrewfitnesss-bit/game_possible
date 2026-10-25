import { Hourglass, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';

export function WaitingPage({ title, text }: { title?: string; text?: string }) {
  const { refreshProfile } = useAuth();
  return (
    <div className="card waiting">
      <div className="waiting-icon">
        <Hourglass />
      </div>
      <h2>{title ?? 'Ожидайте назначения за стол'}</h2>
      <p className="muted">
        {text ?? 'Администратор скоро распределит участников по командам. Страница обновится сама.'}
      </p>
      <button className="btn btn-secondary" onClick={() => void refreshProfile()}>
        <RefreshCw size={16} />
        Проверить сейчас
      </button>
    </div>
  );
}
