// The app's service worker: it waits in the background and shows the alert a phone receives
// even when no tab is open, then opens the right screen when the person taps it.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }

  const title = data.title || 'K-Workmate';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'kworkmate',
      data: { url: data.link || '/roster' },
      renotify: false
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (client.url.indexOf(self.location.origin) === 0) {
          await client.focus();
          if (typeof client.navigate === 'function') {
            try {
              await client.navigate(target);
            } catch (error) {
              // A tab that cannot be steered still gets the focus, so nothing more to do.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
