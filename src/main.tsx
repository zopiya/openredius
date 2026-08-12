import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@ant-design/v5-patch-for-react-19';
import App from './App';
import { restoreFromStorage } from './api/auth';
import AntdProvider from './providers/AntdProvider';

restoreFromStorage();
import './styles/radius-admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AntdProvider>
        <App />
      </AntdProvider>
    </BrowserRouter>
  </StrictMode>,
);
