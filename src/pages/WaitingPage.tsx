import { useAuth } from '../auth';
import { Header } from '../components/Header';

export function WaitingPage() {
  const { refreshProfile } = useAuth();
  return (
    <>
      <Header />
      <div className="card narrow center">
        <h2>Ожидайте назначения в команду</h2>
        <p className="muted">Администратор скоро распределит участников. Страница обновится сама.</p>
        <button className="secondary" onClick={() => void refreshProfile()}>
          Проверить сейчас
        </button>
      </div>
    </>
  );
}
