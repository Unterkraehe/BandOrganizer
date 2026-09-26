import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/core/i18n';
import '@/ui/styles/base.css';
import { App } from '@/app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
