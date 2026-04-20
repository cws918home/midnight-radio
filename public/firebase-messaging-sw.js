importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// These values will be replaced by your actual config
// In a real app, you might want to fetch this or use a build step
firebase.initializeApp({
  apiKey: "AIzaSyCle4jS1PzS585w1QR5-kessY2u6vrUcOM",
  authDomain: "ai-studio-applet-webapp-81285.firebaseapp.com",
  projectId: "ai-studio-applet-webapp-81285",
  storageBucket: "ai-studio-applet-webapp-81285.firebasestorage.app",
  messagingSenderId: "339422523002",
  appId: "1:339422523002:web:3ba8ccd88914bee59755c3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
