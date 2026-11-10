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
      // "visible" alone is not enough: Android can report a PWA behind another app or a dimmed screen as visible
      const visible = windows.some((w) => w.visibilityState === 'visible' && w.focused !== false);
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

// The browser replaced this device's push address: keep a subscription alive right away. The app
// stores the new address on HiDrive the next time it opens (repairPush in features/notifications/push.ts).
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription?.options;
  if (!options?.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => undefined),
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
