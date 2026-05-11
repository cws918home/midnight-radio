import type { StoredPushMetadata } from './types';

export const PUSH_METADATA_STORAGE_KEY = 'galpi:push-registration-metadata';
export const PUSH_INSTANCE_ID_STORAGE_KEY = 'galpi:push-instance-id';
export const PUSH_LAST_TOKEN_STORAGE_KEY = 'galpi:push-last-known-fcm-token';
export const PUSH_LAST_UID_STORAGE_KEY = 'galpi:push-last-known-fcm-uid';

export interface PushStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const getDefaultStoredPushMetadata = (): StoredPushMetadata => ({
  instanceId: null,
  lastKnownFcmToken: null,
  lastKnownUid: null,
  lastSuccessfulRegistrationAt: null,
  lastSuccessfulRegistrationToken: null,
  lastSuccessfulRegistrationUid: null,
  lastSuccessfulRegistrationInstanceId: null,
});

export const readStoredPushMetadataFromStorage = (
  storage: PushStorageLike | null,
  warn: (message: string, error: unknown) => void = () => undefined
): StoredPushMetadata => {
  if (!storage) {
    return getDefaultStoredPushMetadata();
  }

  const defaults = getDefaultStoredPushMetadata();
  const rawMetadata = storage.getItem(PUSH_METADATA_STORAGE_KEY);
  let parsedMetadata: Partial<StoredPushMetadata> = {};

  if (rawMetadata) {
    try {
      parsedMetadata = JSON.parse(rawMetadata) as Partial<StoredPushMetadata>;
    } catch (error) {
      warn('FCM: Failed to parse stored push metadata, falling back to defaults.', error);
    }
  }

  return {
    ...defaults,
    ...parsedMetadata,
    instanceId: parsedMetadata.instanceId ?? storage.getItem(PUSH_INSTANCE_ID_STORAGE_KEY),
    lastKnownFcmToken: parsedMetadata.lastKnownFcmToken ?? storage.getItem(PUSH_LAST_TOKEN_STORAGE_KEY),
    lastKnownUid: parsedMetadata.lastKnownUid ?? storage.getItem(PUSH_LAST_UID_STORAGE_KEY),
  };
};

export const writeStoredPushMetadataToStorage = (
  storage: PushStorageLike | null,
  updates: Partial<StoredPushMetadata>
) => {
  if (!storage) return;

  const nextMetadata = {
    ...readStoredPushMetadataFromStorage(storage),
    ...updates,
  };

  storage.setItem(PUSH_METADATA_STORAGE_KEY, JSON.stringify(nextMetadata));

  if (nextMetadata.instanceId) {
    storage.setItem(PUSH_INSTANCE_ID_STORAGE_KEY, nextMetadata.instanceId);
  } else {
    storage.removeItem(PUSH_INSTANCE_ID_STORAGE_KEY);
  }

  if (nextMetadata.lastKnownUid) {
    storage.setItem(PUSH_LAST_UID_STORAGE_KEY, nextMetadata.lastKnownUid);
  } else {
    storage.removeItem(PUSH_LAST_UID_STORAGE_KEY);
  }

  if (nextMetadata.lastKnownFcmToken) {
    storage.setItem(PUSH_LAST_TOKEN_STORAGE_KEY, nextMetadata.lastKnownFcmToken);
  } else {
    storage.removeItem(PUSH_LAST_TOKEN_STORAGE_KEY);
  }
};

export const clearStoredPushMetadataInStorage = (storage: PushStorageLike | null) => {
  if (!storage) return;

  const { instanceId } = readStoredPushMetadataFromStorage(storage);

  writeStoredPushMetadataToStorage(storage, {
    instanceId,
    lastKnownFcmToken: null,
    lastKnownUid: null,
    lastSuccessfulRegistrationAt: null,
    lastSuccessfulRegistrationToken: null,
    lastSuccessfulRegistrationUid: null,
    lastSuccessfulRegistrationInstanceId: null,
  });
};

export const getOrCreatePushInstanceIdInStorage = (
  storage: PushStorageLike | null,
  createId: () => string
) => {
  const { instanceId } = readStoredPushMetadataFromStorage(storage);

  if (instanceId) {
    return instanceId;
  }

  const nextInstanceId = createId();
  writeStoredPushMetadataToStorage(storage, { instanceId: nextInstanceId });

  return nextInstanceId;
};
