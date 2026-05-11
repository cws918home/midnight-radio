import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushRegistrationLifecycle, PUSH_CONFIRMATION_COOLDOWN_MS } from './internalLifecycle';
import { getPushTokenSessionKey, getTokenPreview } from './policy';
import { selectAppControlledRegistration } from './serviceWorker';
import {
  clearStoredPushMetadataInStorage,
  getDefaultStoredPushMetadata,
  getOrCreatePushInstanceIdInStorage,
  PUSH_INSTANCE_ID_STORAGE_KEY,
  PUSH_LAST_TOKEN_STORAGE_KEY,
  PUSH_LAST_UID_STORAGE_KEY,
  readStoredPushMetadataFromStorage,
  writeStoredPushMetadataToStorage,
} from './storage';
import type {
  PushRegistrationAdapters,
  PushRegistrationStatus,
  StoredPushMetadata,
} from './types';

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const completeMetadata = (overrides: Partial<StoredPushMetadata> = {}): StoredPushMetadata => ({
  ...getDefaultStoredPushMetadata(),
  instanceId: 'instance-1',
  lastKnownFcmToken: 'token-1',
  lastKnownUid: 'user-1',
  lastSuccessfulRegistrationAt: 1000,
  lastSuccessfulRegistrationToken: 'token-1',
  lastSuccessfulRegistrationUid: 'user-1',
  lastSuccessfulRegistrationInstanceId: 'instance-1',
  ...overrides,
});

function createHarness(overrides: Partial<PushRegistrationAdapters<string>> = {}) {
  let metadata = getDefaultStoredPushMetadata();
  let status: PushRegistrationStatus = 'idle';
  let permission: NotificationPermission = 'granted';
  let token = 'token-1';
  let now = 100_000;
  let tokenDocExists = true;
  let resolveToken: ((value: string | null) => void) | null = null;

  const calls = {
    deleteTokenDoc: [] as Array<[string, string]>,
    writeTokenDoc: [] as unknown[],
    getTokenDoc: [] as Array<[string, string]>,
    resolveMessagingRegistration: [] as boolean[],
  };

  const adapters: PushRegistrationAdapters<string> = {
    hasMessaging: () => true,
    isNotificationSupported: () => true,
    isServiceWorkerSupported: () => true,
    getNotificationPermission: () => permission,
    requestNotificationPermission: async () => permission,
    isInstalledPWA: () => false,
    readStoredMetadata: () => metadata,
    writeStoredMetadata: updates => {
      metadata = { ...metadata, ...updates };
    },
    clearStoredMetadata: () => {
      metadata = {
        ...metadata,
        lastKnownFcmToken: null,
        lastKnownUid: null,
        lastSuccessfulRegistrationAt: null,
        lastSuccessfulRegistrationToken: null,
        lastSuccessfulRegistrationUid: null,
        lastSuccessfulRegistrationInstanceId: null,
      };
    },
    getOrCreateInstanceId: () => {
      metadata = { ...metadata, instanceId: metadata.instanceId ?? 'instance-1' };
      return metadata.instanceId ?? 'instance-1';
    },
    resolveMessagingRegistration: async installedPWA => {
      calls.resolveMessagingRegistration.push(installedPWA);
      return { registration: 'registration-1', registrationType: 'app-controlled' };
    },
    getFcmToken: async () => {
      if (resolveToken) {
        return new Promise(resolve => {
          resolveToken = value => resolve(value);
        });
      }
      return token;
    },
    getTokenDoc: async (uid, fcmToken) => {
      calls.getTokenDoc.push([uid, fcmToken]);
      return {
        exists: () => tokenDocExists,
        data: () => ({ createdAt: 'created-at' }),
      };
    },
    writeTokenDoc: async params => {
      calls.writeTokenDoc.push(params);
    },
    updateLastTokenRefresh: async () => undefined,
    deleteTokenDoc: async (uid, fcmToken) => {
      calls.deleteTokenDoc.push([uid, fcmToken]);
    },
    now: () => now,
    alert: () => undefined,
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    ...overrides,
  };

  const lifecycle = createPushRegistrationLifecycle({
    adapters,
    state: {
      getPushRegistrationStatus: () => status,
      setNotificationPermission: nextPermission => {
        permission = nextPermission;
      },
      setPushRegistrationStatus: nextStatus => {
        status = nextStatus;
      },
      setFcmDebugToken: () => undefined,
    },
  });

  return {
    adapters,
    calls,
    lifecycle,
    get metadata() {
      return metadata;
    },
    set metadata(nextMetadata: StoredPushMetadata) {
      metadata = nextMetadata;
    },
    get status() {
      return status;
    },
    set status(nextStatus: PushRegistrationStatus) {
      status = nextStatus;
    },
    set permission(nextPermission: NotificationPermission) {
      permission = nextPermission;
    },
    set token(nextToken: string) {
      token = nextToken;
    },
    set now(nextNow: number) {
      now = nextNow;
    },
    set tokenDocExists(nextExists: boolean) {
      tokenDocExists = nextExists;
    },
    holdNextToken() {
      resolveToken = () => undefined;
      return (nextToken: string | null) => {
        resolveToken?.(nextToken);
        resolveToken = null;
      };
    },
  };
}

test('legacy localStorage key fallback', () => {
  const storage = new MemoryStorage();
  storage.setItem(PUSH_INSTANCE_ID_STORAGE_KEY, 'legacy-instance');
  storage.setItem(PUSH_LAST_TOKEN_STORAGE_KEY, 'legacy-token');
  storage.setItem(PUSH_LAST_UID_STORAGE_KEY, 'legacy-user');

  assert.deepEqual(readStoredPushMetadataFromStorage(storage), {
    ...getDefaultStoredPushMetadata(),
    instanceId: 'legacy-instance',
    lastKnownFcmToken: 'legacy-token',
    lastKnownUid: 'legacy-user',
  });
});

test('metadata write and clear behavior preserves instance id', () => {
  const storage = new MemoryStorage();
  writeStoredPushMetadataToStorage(storage, {
    instanceId: 'instance-1',
    lastKnownFcmToken: 'token-1',
    lastKnownUid: 'user-1',
  });

  clearStoredPushMetadataInStorage(storage);

  assert.equal(readStoredPushMetadataFromStorage(storage).instanceId, 'instance-1');
  assert.equal(readStoredPushMetadataFromStorage(storage).lastKnownFcmToken, null);
  assert.equal(storage.getItem(PUSH_LAST_TOKEN_STORAGE_KEY), null);
});

test('token session key formatting', () => {
  assert.equal(getPushTokenSessionKey('uid', 'token'), 'uid::token');
});

test('token preview formatting', () => {
  assert.equal(getTokenPreview('abcdefghijklmnop'), 'abcdefghijkl');
  assert.equal(getTokenPreview(null), null);
});

test('permission revoked after previous token triggers cleanup', async () => {
  const harness = createHarness();
  harness.permission = 'denied';
  harness.status = 'registered';
  harness.metadata = completeMetadata();

  const result = await harness.lifecycle.maybeRecoverPushRegistration({ uid: 'user-1' }, 'app-foreground');

  assert.equal(result.status, 'skipped');
  assert.deepEqual(harness.calls.deleteTokenDoc, [['user-1', 'token-1']]);
  assert.equal(harness.metadata.lastKnownFcmToken, null);
});

test('different signed-in user triggers previous token cleanup only after new registration succeeds', async () => {
  const harness = createHarness();
  harness.metadata = completeMetadata();
  harness.token = 'token-2';

  await harness.lifecycle.ensurePushRegistration({ uid: 'user-2' }, 'signed-in-stable');

  assert.deepEqual(harness.calls.writeTokenDoc.map(call => (call as { uid: string }).uid), ['user-2']);
  assert.deepEqual(harness.calls.deleteTokenDoc, [['user-1', 'token-1']]);
});

test('token change triggers previous token cleanup only after new registration succeeds', async () => {
  const harness = createHarness();
  harness.metadata = completeMetadata();
  harness.token = 'token-2';

  await harness.lifecycle.ensurePushRegistration({ uid: 'user-1' }, 'signed-in-stable');

  assert.deepEqual(harness.calls.writeTokenDoc.map(call => (call as { token: string }).token), ['token-2']);
  assert.deepEqual(harness.calls.deleteTokenDoc, [['user-1', 'token-1']]);
});

test('confirmation cooldown suppresses repeated Firestore reads', async () => {
  const harness = createHarness();
  harness.metadata = completeMetadata({
    lastSuccessfulRegistrationAt: 100_000 - PUSH_CONFIRMATION_COOLDOWN_MS + 1,
    lastSuccessfulRegistrationToken: 'old-token',
  });

  const result = await harness.lifecycle.maybeRecoverPushRegistration({ uid: 'user-1' }, 'app-foreground');

  assert.equal(result.status, 'skipped');
  assert.equal(harness.calls.getTokenDoc.length, 0);
});

test('in-flight registration dedupes repeated recovery triggers', async () => {
  const harness = createHarness();
  const releaseToken = harness.holdNextToken();

  const first = harness.lifecycle.maybeRecoverPushRegistration({ uid: 'user-1' }, 'app-foreground');
  const second = harness.lifecycle.maybeRecoverPushRegistration({ uid: 'user-1' }, 'signed-in-stable');
  releaseToken('token-1');

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.status, 'registered');
  assert.equal(secondResult.status, 'registered');
  assert.equal(harness.calls.resolveMessagingRegistration.length, 1);
});

test('app-controlled service worker is preferred over fallback when available', () => {
  const fallback = {
    active: { scriptURL: 'https://example.test/firebase-messaging-sw.js' },
  } as ServiceWorkerRegistration;
  const appControlled = {
    active: { scriptURL: 'https://example.test/sw.js' },
  } as ServiceWorkerRegistration;

  assert.equal(selectAppControlledRegistration([fallback, appControlled]), appControlled);
});

test('instance id creation persists generated id', () => {
  const storage = new MemoryStorage();

  assert.equal(getOrCreatePushInstanceIdInStorage(storage, () => 'instance-1'), 'instance-1');
  assert.equal(getOrCreatePushInstanceIdInStorage(storage, () => 'instance-2'), 'instance-1');
});
