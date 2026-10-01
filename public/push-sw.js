/* Push notifications (F6 §4.5) – loaded into the generated service worker (importScripts). */
/* global self, clients */

const isApple = /iPhone|iPad|Macintosh/.test(self.navigator.userAgent) && !/Chrome|Android/.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Band-App', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.some((w) => w.visibilityState === 'visible');
      // The open app shows new messages itself. Apple revokes push access if a push shows nothing,
      // so there the notification is always shown. The test (Einstellungen → Benachrichtigungen) is
      // sent while the app is open, so it is always shown too.
      if (visible && !isApple && data.tag !== 'test') return;
      await self.registration.showNotification(data.title || 'Band-App', {
        body: data.body || '',
        tag: data.tag || undefined,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: data.url || '' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (app) {
        await app.focus();
        app.postMessage({ type: 'bandapp:navigate', url: target });
        return;
      }
      await clients.openWindow(target);
    })(),
  );
});
