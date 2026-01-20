import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { TenantProvider } from './hooks/useTenant';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <StrictMode>
      <TenantProvider>
        <App />
      </TenantProvider>
    </StrictMode>
  </BrowserRouter>,
)
