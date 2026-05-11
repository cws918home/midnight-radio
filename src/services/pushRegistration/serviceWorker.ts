const FALLBACK_MESSAGING_SW_URL = '/firebase-messaging-sw.js';
const FALLBACK_MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export const getServiceWorkerScriptUrl = (registration?: ServiceWorkerRegistration | null) =>
  registration?.active?.scriptURL
  ?? registration?.waiting?.scriptURL
  ?? registration?.installing?.scriptURL
  ?? '';

export const isFallbackMessagingRegistration = (registration?: ServiceWorkerRegistration | null) =>
  getServiceWorkerScriptUrl(registration).includes(FALLBACK_MESSAGING_SW_URL);

export const getServiceWorkerRegistrationLogPayload = ({
  registration,
  registrationType,
  installedPWA,
}: {
  registration?: ServiceWorkerRegistration | null;
  registrationType: 'app-controlled' | 'fallback';
  installedPWA: boolean;
}) => ({
  registrationType,
  scope: registration?.scope ?? null,
  scriptURL: getServiceWorkerScriptUrl(registration),
  hasActive: Boolean(registration?.active),
  hasWaiting: Boolean(registration?.waiting),
  hasInstalling: Boolean(registration?.installing),
  isFallbackRegistration: isFallbackMessagingRegistration(registration),
  isInstalledPWA: installedPWA,
});

export const selectAppControlledRegistration = (
  registrations: Array<ServiceWorkerRegistration | null | undefined>
) => registrations.find(registration => registration?.active && !isFallbackMessagingRegistration(registration)) ?? null;

const waitForActivatedServiceWorker = async (registration: ServiceWorkerRegistration) => {
  if (registration.active) {
    return registration;
  }

  await new Promise<void>((resolve) => {
    const candidateWorker = registration.installing ?? registration.waiting;

    if (!candidateWorker) {
      resolve();
      return;
    }

    candidateWorker.addEventListener('statechange', () => {
      if (candidateWorker.state === 'activated') {
        resolve();
      }
    });

    window.setTimeout(resolve, 3_000);
  });

  return registration;
};

const waitForReadyServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  return Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 8_000);
    }),
  ]);
};

export const resolveMessagingRegistration = async (installedPWA: boolean) => {
  const readyRegistration = await waitForReadyServiceWorker();
  const registrations = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistrations()
    : [];
  const appControlledRegistration = selectAppControlledRegistration([
    readyRegistration,
    ...registrations,
  ]);

  if (appControlledRegistration) {
    console.log(
      'FCM: resolveMessagingRegistration returning registration.',
      getServiceWorkerRegistrationLogPayload({
        registration: appControlledRegistration,
        registrationType: 'app-controlled',
        installedPWA,
      })
    );

    return {
      registration: appControlledRegistration,
      registrationType: 'app-controlled' as const,
    };
  }

  const fallbackRegistration = await navigator.serviceWorker.register(FALLBACK_MESSAGING_SW_URL, {
    scope: FALLBACK_MESSAGING_SW_SCOPE,
  });
  await waitForActivatedServiceWorker(fallbackRegistration);

  console.log(
    'FCM: resolveMessagingRegistration returning registration.',
    getServiceWorkerRegistrationLogPayload({
      registration: fallbackRegistration,
      registrationType: 'fallback',
      installedPWA,
    })
  );

  return {
    registration: fallbackRegistration,
    registrationType: 'fallback' as const,
  };
};

