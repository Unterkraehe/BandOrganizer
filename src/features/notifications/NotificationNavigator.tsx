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
      // own address first; in the beta the notification comes from the released app's service worker (roadmap §4d)
      const base = [import.meta.env.BASE_URL, __STABLE_BASE__].map((b) => b.replace(/\/$/, '')).find((b) => url.pathname.startsWith(b)) ?? '';
      const path = url.pathname.slice(base.length) || '/';
      navigate(`${path}${url.search}`);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}
