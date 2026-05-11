import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { db, messaging } from '../../firebase';
import {
  clearStoredPushMetadataInStorage,
  getOrCreatePushInstanceIdInStorage,
  readStoredPushMetadataFromStorage,
  writeStoredPushMetadataToStorage,
} from './storage';
import { getTokenPreview } from './policy';
import { resolveMessagingRegistration } from './serviceWorker';
import type { ExistingTokenDoc, PushRegistrationAdapters } from './types';

const FCM_VAPID_KEY = 'BFHIR9z_IvTS-YS65CP7-JuEb2Q0psopN5-qzUcBhvg6RNLuc5QevbXyENEb7JyeBULPZSOUPE8r46dGEQDqI6M';

const getStorage = () => typeof window === 'undefined' ? null : window.localStorage;

const createInstanceId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const isInstalledPWA = () => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(display-mode: standalone)').matches
    || ((navigator as Navigator & { standalone?: boolean }).standalone ?? false);
};

export const createProductionPushRegistrationAdapters = (): PushRegistrationAdapters<ServiceWorkerRegistration> => ({
  hasMessaging: () => Boolean(messaging),
  isNotificationSupported: () => typeof window !== 'undefined' && 'Notification' in window,
  isServiceWorkerSupported: () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  getNotificationPermission: () => Notification.permission,
  requestNotificationPermission: () => Notification.requestPermission(),
  isInstalledPWA,
  readStoredMetadata: () => readStoredPushMetadataFromStorage(
    getStorage(),
    (message, error) => console.warn(message, error)
  ),
  writeStoredMetadata: updates => writeStoredPushMetadataToStorage(getStorage(), updates),
  clearStoredMetadata: () => clearStoredPushMetadataInStorage(getStorage()),
  getOrCreateInstanceId: () => getOrCreatePushInstanceIdInStorage(getStorage(), createInstanceId),
  resolveMessagingRegistration,
  getFcmToken: registration => {
    if (!messaging) return Promise.resolve(null);

    return getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  },
  getTokenDoc: (uid, token) =>
    getDoc(doc(db, 'users', uid, 'fcmTokens', encodeURIComponent(token))) as Promise<ExistingTokenDoc>,
  writeTokenDoc: async ({ uid, token, permission, installedPWA, instanceId, existingTokenDoc }) => {
    await setDoc(doc(db, 'users', uid, 'fcmTokens', encodeURIComponent(token)), {
      token,
      platform: 'web',
      userAgent: navigator.userAgent,
      createdAt: existingTokenDoc.exists()
        ? (existingTokenDoc.data().createdAt ?? serverTimestamp())
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
      notificationPermission: permission,
      isInstalledPWA: installedPWA,
      instanceId,
    }, { merge: true });
  },
  updateLastTokenRefresh: uid =>
    updateDoc(doc(db, 'users', uid), {
      lastTokenRefresh: serverTimestamp(),
    }),
  deleteTokenDoc: async (uid, token) => {
    await deleteDoc(doc(db, 'users', uid, 'fcmTokens', encodeURIComponent(token)));
    console.log('FCM: Removed token document for this instance.', {
      uid,
      tokenPrefix: getTokenPreview(token),
    });
  },
  now: () => Date.now(),
  alert: message => alert(message),
  log: (message, payload) => console.log(message, payload),
  warn: (message, payload, error) => console.warn(message, payload, error),
  error: (message, payload, error) => console.error(message, payload, error),
});
