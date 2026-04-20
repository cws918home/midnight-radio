importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// [Midnight Radio] FCM Service Worker Config
firebase.initializeApp({
  apiKey: "AIzaSyCle4jS1PzS585w1QR5-kessY2u6vrUcOM",
  authDomain: "ai-studio-applet-webapp-81285.firebaseapp.com",
  projectId: "ai-studio-applet-webapp-81285",
  storageBucket: "ai-studio-applet-webapp-81285.firebasestorage.app",
  messagingSenderId: "339422523002",
  appId: "1:339422523002:web:3ba8ccd88914bee59755c3"
});

const messaging = firebase.messaging();

// Background Notification Handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || "📻 미드나잇 라디오";
  const notificationOptions = {
    body: payload.notification?.body || "새로운 소식이 도착했습니다.",
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'midnight-radio-notification',
    data: { url: '/' }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
