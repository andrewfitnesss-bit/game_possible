import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

// Последний рубеж: вместо белого экрана — сообщение и перезагрузка. Тексты на двух языках, т.к. словари могут быть недоступны.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Ошибка интерфейса', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card waiting" role="alert">
        <h2>Что-то пошло не так · Something went wrong</h2>
        <p className="muted small">{this.state.error.message}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Перезагрузить · Reload
        </button>
      </div>
    );
  }
}
