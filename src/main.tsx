/** App entry: blocks pinch-zoom gestures and mounts <App /> (the service worker is registered in core/pwa/usePwa). */
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
