import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPushRegistrationState } from './policy';
import { getDefaultStoredPushMetadata } from './storage';
import type { PushRegistrationStatus, StoredPushMetadata } from './types';

const user = { uid: 'user-1' };

const completeMetadata = (): StoredPushMetadata => ({
  ...getDefaultStoredPushMetadata(),
  instanceId: 'instance-1',
  lastKnownFcmToken: 'token-1',
  lastKnownUid: 'user-1',
  lastSuccessfulRegistrationAt: 1000,
  lastSuccessfulRegistrationToken: 'token-1',
  lastSuccessfulRegistrationUid: 'user-1',
  lastSuccessfulRegistrationInstanceId: 'instance-1',
});

const assess = ({
  permission = 'granted',
  metadata = completeMetadata(),
  localStatus = 'idle',
  assessmentUser = user,
}: {
  permission?: NotificationPermission;
  metadata?: StoredPushMetadata;
  localStatus?: PushRegistrationStatus;
  assessmentUser?: typeof user | null;
} = {}) => assessPushRegistrationState({
  user: assessmentUser,
  permission,
  storedMetadata: metadata,
  localStatus,
});

test('permission not granted skips registration and disallows confirmation', () => {
  const result = assess({ permission: 'denied' });

  assert.equal(result.shouldAttemptRegistration, false);
  assert.equal(result.shouldConsiderFirestoreConfirmation, false);
  assert.equal(result.reason, 'permission-not-granted');
});

test('missing user skips registration', () => {
  const result = assess({ assessmentUser: null });

  assert.equal(result.shouldAttemptRegistration, false);
  assert.equal(result.shouldConsiderFirestoreConfirmation, false);
  assert.equal(result.reason, 'no-signed-in-user');
});

test('missing current token attempts registration', () => {
  const result = assess({
    metadata: {
      ...completeMetadata(),
      lastKnownFcmToken: null,
    },
  });

  assert.equal(result.shouldAttemptRegistration, true);
  assert.equal(result.reason, 'missing-local-token');
});

test('failed status attempts registration', () => {
  const result = assess({ localStatus: 'failed' });

  assert.equal(result.shouldAttemptRegistration, true);
  assert.equal(result.shouldConsiderFirestoreConfirmation, true);
  assert.equal(result.reason, 'previous-registration-failed');
});

test('missing_token_doc status attempts registration', () => {
  const result = assess({ localStatus: 'missing_token_doc' });

  assert.equal(result.shouldAttemptRegistration, true);
  assert.equal(result.shouldConsiderFirestoreConfirmation, true);
  assert.equal(result.reason, 'missing-token-doc');
});

test('stale or missing success marker attempts Firestore confirmation before registration', () => {
  const result = assess({
    metadata: {
      ...completeMetadata(),
      lastSuccessfulRegistrationToken: 'old-token',
    },
  });

  assert.equal(result.shouldAttemptRegistration, false);
  assert.equal(result.shouldConsiderFirestoreConfirmation, true);
  assert.equal(result.reason, 'missing-or-stale-success-marker');
});

test('complete metadata returns registered no-op', () => {
  const result = assess();

  assert.equal(result.isRegistrationIncomplete, false);
  assert.equal(result.shouldAttemptRegistration, false);
  assert.equal(result.shouldConsiderFirestoreConfirmation, false);
  assert.equal(result.reason, 'registration-complete');
});
