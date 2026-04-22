/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision?: string | null }>;
};

const DEFAULT_NOTIFICATION_TITLE = '📻 미드나잇 라디오';
const DEFAULT_NOTIFICATION_BODY = '새로운 소식이 도착했습니다.';
const DEFAULT_NOTIFICATION_URL = '/';

const normalizeNotificationUrl = (candidateUrl?: string) => {
  try {
    return new URL(candidateUrl || DEFAULT_NOTIFICATION_URL, self.location.origin).toString();
  } catch {
    return new URL(DEFAULT_NOTIFICATION_URL, self.location.origin).toString();
  }
};

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  })
);

const firebaseApp = initializeApp(firebaseConfig);
const messaging = getMessaging(firebaseApp);

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || payload.data?.title || DEFAULT_NOTIFICATION_TITLE;
  const body = payload.notification?.body || payload.data?.body || DEFAULT_NOTIFICATION_BODY;
  const url = normalizeNotificationUrl(payload.data?.url);

  console.log('[sw] Received background FCM payload.', {
    title,
    url,
  });

  void self.registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'midnight-radio-notification',
    renotify: true,
    requireInteraction: true,
    data: {
      url,
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl = normalizeNotificationUrl(event.notification.data?.url);
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }) as WindowClient[];

    const exactClient = windowClients.find((client) => client.url === targetUrl);
    if (exactClient) {
      await exactClient.focus();
      return;
    }

    const sameOriginClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (sameOriginClient) {
      if (typeof sameOriginClient.navigate === 'function') {
        await sameOriginClient.navigate(targetUrl);
      }
      await sameOriginClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});
