self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'AUN Online Mart', {
    body: payload.body || 'There is an update waiting for you.',
    icon: '/aom-icon.svg',
    badge: '/aom-icon.svg',
    data: { url: payload.url || '/vendor-portal' },
    tag: payload.tag || 'aom-operations',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var destination = (event.notification.data && event.notification.data.url) || '/vendor-portal';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    for (var i = 0; i < clients.length; i += 1) {
      if (clients[i].url.indexOf(destination) !== -1 && 'focus' in clients[i]) return clients[i].focus();
    }
    return self.clients.openWindow(destination);
  }));
});
