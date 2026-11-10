/** App entry: blocks pinch-zoom gestures and mounts <App /> (the service worker is registered in core/pwa/usePwa). */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@/core/i18n';
import '@/ui/styles/base.css';
import { App } from '@/app/App';
import { confirmBoot } from '@/core/channel/channel';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

/** Rendered next to the app: its effect only runs when the first render succeeded. */
function BootConfirmed() {
  useEffect(confirmBoot, []);
  return null;
}

// While the channel loader (index.html) is sending this device to the other version, don't start the app.
if (!(window as Window & { __bandappRedirecting?: boolean }).__bandappRedirecting) {
  createRoot(root).render(
    <StrictMode>
      <App />
      <BootConfirmed />
    </StrictMode>,
  );
}
