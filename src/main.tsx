import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { restoreFromStorage } from './api/auth';
import AntdProvider from './providers/AntdProvider';

restoreFromStorage();
import { ToastProvider } from './components/Toast';
import './styles/radius-admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AntdProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AntdProvider>
    </BrowserRouter>
  </StrictMode>,
);
