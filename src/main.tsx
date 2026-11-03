import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth';
import { App } from './App';
import { PrefsProvider } from './i18n/prefs';
import { ConfirmProvider } from './ui/Confirm';
import { ToastProvider } from './ui/Toast';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден #root');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <PrefsProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </PrefsProvider>
    </AuthProvider>
  </StrictMode>,
);
