import type {
  PushRegistrationAssessment,
  PushRegistrationStatus,
  PushRegistrationUser,
  StoredPushMetadata,
} from './types';

export const getPushTokenSessionKey = (uid: string, token: string) => `${uid}::${token}`;

export const getTokenPreview = (token?: string | null) => token?.slice(0, 12) ?? null;

export const assessPushRegistrationState = ({
  user: assessmentUser,
  permission,
  storedMetadata,
  localStatus,
}: {
  user: PushRegistrationUser | null;
  permission: NotificationPermission;
  storedMetadata: StoredPushMetadata;
  localStatus: PushRegistrationStatus;
}): PushRegistrationAssessment => {
  const currentInstanceId = storedMetadata.instanceId;
  const currentToken = assessmentUser && storedMetadata.lastKnownUid === assessmentUser.uid
    ? storedMetadata.lastKnownFcmToken
    : null;
  const hasSuccessMarker = Boolean(
    assessmentUser
    && currentInstanceId
    && currentToken
    && storedMetadata.lastSuccessfulRegistrationUid === assessmentUser.uid
    && storedMetadata.lastSuccessfulRegistrationInstanceId === currentInstanceId
    && storedMetadata.lastSuccessfulRegistrationToken === currentToken
  );
  const isFreshInstance = !storedMetadata.lastKnownUid
    && !storedMetadata.lastKnownFcmToken
    && !storedMetadata.lastSuccessfulRegistrationAt
    && !storedMetadata.lastSuccessfulRegistrationToken;

  if (permission !== 'granted') {
    return {
      isFreshInstance,
      hasSuccessMarker,
      isRegistrationIncomplete: false,
      shouldAttemptRegistration: false,
      shouldConsiderFirestoreConfirmation: false,
      currentInstanceId,
      currentToken,
      reason: 'permission-not-granted',
    };
  }

  if (!assessmentUser) {
    return {
      isFreshInstance,
      hasSuccessMarker,
      isRegistrationIncomplete: false,
      shouldAttemptRegistration: false,
      shouldConsiderFirestoreConfirmation: false,
      currentInstanceId,
      currentToken,
      reason: 'no-signed-in-user',
    };
  }

  const noCurrentToken = !currentToken;
  const hasLocalFailure = localStatus === 'failed' || localStatus === 'missing_token_doc';
  const successMarkerMismatch = Boolean(currentToken) && !hasSuccessMarker;
  const isRegistrationIncomplete = noCurrentToken || hasLocalFailure || !hasSuccessMarker;
  const shouldAttemptRegistration = noCurrentToken || hasLocalFailure;
  const shouldConsiderFirestoreConfirmation = Boolean(
    currentToken
    && (
      !hasSuccessMarker
      || localStatus === 'failed'
      || localStatus === 'missing_token_doc'
      || successMarkerMismatch
    )
  );

  let reason = 'registration-complete';
  if (noCurrentToken) {
    reason = isFreshInstance ? 'fresh-instance-no-token' : 'missing-local-token';
  } else if (localStatus === 'missing_token_doc') {
    reason = 'missing-token-doc';
  } else if (localStatus === 'failed') {
    reason = 'previous-registration-failed';
  } else if (successMarkerMismatch) {
    reason = 'missing-or-stale-success-marker';
  }

  return {
    isFreshInstance,
    hasSuccessMarker,
    isRegistrationIncomplete,
    shouldAttemptRegistration,
    shouldConsiderFirestoreConfirmation,
    currentInstanceId,
    currentToken,
    reason,
  };
};
