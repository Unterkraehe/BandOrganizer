import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Tapping a notification while the app is already open: the service worker asks us to navigate. */
export function NotificationNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== 'bandapp:navigate' || !data.url) return;
      const url = new URL(data.url);
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname;
      navigate(`${path}${url.search}`);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}
