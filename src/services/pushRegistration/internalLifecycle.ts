import { assessPushRegistrationState, getPushTokenSessionKey, getTokenPreview } from './policy';
import type {
  FirestoreConfirmationResult,
  PushRecoveryReason,
  PushRecoveryResult,
  PushRegistrationAdapters,
  PushRegistrationLifecycleState,
  PushRegistrationUser,
} from './types';

export const PUSH_CONFIRMATION_COOLDOWN_MS = 90_000;

export function createPushRegistrationLifecycle<TRegistration>({
  adapters,
  state,
}: {
  adapters: PushRegistrationAdapters<TRegistration>;
  state: PushRegistrationLifecycleState;
}) {
  let cleanupInFlight = false;
  let registrationPromise: Promise<PushRecoveryResult> | null = null;
  const confirmedTokenKeys = new Set<string>();

  const cleanupStoredPushToken = async () => {
    const { lastKnownFcmToken, lastKnownUid } = adapters.readStoredMetadata();

    if (!lastKnownFcmToken || !lastKnownUid || cleanupInFlight) {
      adapters.clearStoredMetadata();
      state.setFcmDebugToken('');
      state.setPushRegistrationStatus('idle');
      return;
    }

    cleanupInFlight = true;

    try {
      await adapters.deleteTokenDoc(lastKnownUid, lastKnownFcmToken);
    } catch (error) {
      adapters.error('FCM: Failed to delete the stored token document during cleanup.', error);
    } finally {
      adapters.clearStoredMetadata();
      confirmedTokenKeys.clear();
      state.setFcmDebugToken('');
      state.setPushRegistrationStatus('idle');
      cleanupInFlight = false;
    }
  };

  const confirmCurrentTokenDocIfNeeded = async ({
    user: confirmationUser,
    permission,
    assessment,
    storedMetadata,
  }: {
    user: PushRegistrationUser | null;
    permission: NotificationPermission;
    assessment: ReturnType<typeof assessPushRegistrationState>;
    storedMetadata: ReturnType<typeof adapters.readStoredMetadata>;
  }): Promise<FirestoreConfirmationResult> => {
    if (permission !== 'granted') {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser?.uid ?? null,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'permission-not-granted',
      });
      return 'skipped';
    }

    if (!confirmationUser) {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: null,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'no-user',
      });
      return 'skipped';
    }

    if (!assessment.shouldConsiderFirestoreConfirmation) {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'assessment-disallows-confirmation',
      });
      return 'skipped';
    }

    if (!assessment.currentToken) {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser.uid,
        tokenPreview: null,
        assessmentReason: assessment.reason,
        skipReason: 'missing-current-token',
      });
      return 'skipped';
    }

    const sessionKey = getPushTokenSessionKey(confirmationUser.uid, assessment.currentToken);

    if (registrationPromise) {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'registration-already-in-flight',
      });
      return 'skipped';
    }

    if (confirmedTokenKeys.has(sessionKey) && state.getPushRegistrationStatus() === 'registered') {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'already-confirmed-in-session',
      });
      return 'skipped';
    }

    if (
      storedMetadata.lastSuccessfulRegistrationAt
      && adapters.now() - storedMetadata.lastSuccessfulRegistrationAt < PUSH_CONFIRMATION_COOLDOWN_MS
    ) {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded decision skip confirmation.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
        skipReason: 'cooldown-active',
      });
      return 'skipped';
    }

    try {
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded performing confirmation read.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
      });

      const tokenDocSnap = await adapters.getTokenDoc(confirmationUser.uid, assessment.currentToken);

      if (!tokenDocSnap.exists()) {
        state.setPushRegistrationStatus('missing_token_doc');
        adapters.warn('FCM: confirmCurrentTokenDocIfNeeded found missing_token_doc.', {
          uid: confirmationUser.uid,
          tokenPreview: getTokenPreview(assessment.currentToken),
          assessmentReason: assessment.reason,
        });
        return 'missing_token_doc';
      }

      confirmedTokenKeys.add(sessionKey);
      adapters.log('FCM: confirmCurrentTokenDocIfNeeded confirmed token doc.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
      });
      return 'confirmed';
    } catch (error) {
      adapters.error('FCM: confirmCurrentTokenDocIfNeeded confirmation error.', {
        uid: confirmationUser.uid,
        tokenPreview: getTokenPreview(assessment.currentToken),
        assessmentReason: assessment.reason,
      }, error);
      return 'error';
    }
  };

  const ensurePushRegistration = async (
    targetUser: PushRegistrationUser | null,
    reason: PushRecoveryReason
  ): Promise<PushRecoveryResult> => {
    adapters.log('FCM: ensurePushRegistration enter.', {
      uid: targetUser?.uid ?? null,
      reason,
      hasMessaging: adapters.hasMessaging(),
      notificationSupported: adapters.isNotificationSupported(),
      serviceWorkerSupported: adapters.isServiceWorkerSupported(),
      hasInFlightRegistration: Boolean(registrationPromise),
    });

    const logFinalStatus = (result: PushRecoveryResult) => {
      adapters.log('FCM: ensurePushRegistration final status.', {
        uid: targetUser?.uid ?? null,
        reason,
        status: result.status,
        attempted: result.attempted,
        registered: result.registered,
        error: result.error,
      });
      return result;
    };

    if (
      !adapters.hasMessaging()
      || !targetUser
      || !adapters.isNotificationSupported()
      || !adapters.isServiceWorkerSupported()
    ) {
      return logFinalStatus({
        attempted: false,
        status: 'skipped',
        registered: false,
      });
    }

    if (registrationPromise) {
      return registrationPromise;
    }

    const registrationTask = (async (): Promise<PushRecoveryResult> => {
      const permission = adapters.getNotificationPermission();
      state.setNotificationPermission(permission);
      adapters.log('FCM: ensurePushRegistration Notification.permission.', {
        uid: targetUser.uid,
        reason,
        permission,
      });

      if (permission !== 'granted') {
        await cleanupStoredPushToken();
        return logFinalStatus({
          attempted: false,
          status: 'skipped',
          registered: false,
        });
      }

      state.setPushRegistrationStatus('registering');

      try {
        const instanceId = adapters.getOrCreateInstanceId();
        const installedPWA = adapters.isInstalledPWA();
        adapters.log('FCM: ensurePushRegistration installed PWA detection.', {
          uid: targetUser.uid,
          reason,
          isInstalledPWA: installedPWA,
        });
        adapters.log('FCM: ensurePushRegistration resolving service worker registration.', {
          uid: targetUser.uid,
          reason,
          isInstalledPWA: installedPWA,
        });

        const { registration, registrationType } = await adapters.resolveMessagingRegistration(installedPWA);

        adapters.log('FCM: ensurePushRegistration calling getToken.', {
          uid: targetUser.uid,
          reason,
          registrationType,
        });

        let token: string | null;
        try {
          token = await adapters.getFcmToken(registration);
        } catch (error) {
          adapters.error('FCM: ensurePushRegistration getToken failure.', {
            uid: targetUser.uid,
            reason,
            registrationType,
          }, error);
          throw error;
        }

        if (!token) {
          adapters.warn('FCM: getToken returned no token.', { reason, registrationType });
          state.setPushRegistrationStatus('failed');
          return logFinalStatus({
            attempted: true,
            status: 'failed',
            registered: false,
            error: 'FCM token was not returned.',
          });
        }

        adapters.log('FCM: ensurePushRegistration getToken success.', {
          uid: targetUser.uid,
          reason,
          registrationType,
          tokenPreview: getTokenPreview(token),
          tokenLength: token.length,
        });

        const storedMetadata = adapters.readStoredMetadata();
        adapters.log('FCM: ensurePushRegistration calling token-doc getDoc.', {
          uid: targetUser.uid,
          tokenPreview: getTokenPreview(token),
        });

        let existingTokenDoc;
        try {
          existingTokenDoc = await adapters.getTokenDoc(targetUser.uid, token);
          adapters.log('FCM: ensurePushRegistration token-doc getDoc success.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
            exists: existingTokenDoc.exists(),
          });
        } catch (error) {
          adapters.error('FCM: ensurePushRegistration token-doc getDoc failure.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          }, error);
          throw error;
        }

        adapters.log('FCM: ensurePushRegistration calling token-doc setDoc.', {
          uid: targetUser.uid,
          tokenPreview: getTokenPreview(token),
        });

        try {
          await adapters.writeTokenDoc({
            uid: targetUser.uid,
            token,
            permission,
            installedPWA,
            instanceId,
            existingTokenDoc,
          });
          adapters.log('FCM: ensurePushRegistration token-doc setDoc success.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          });
        } catch (error) {
          adapters.error('FCM: ensurePushRegistration token-doc setDoc failure.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          }, error);
          throw error;
        }

        try {
          adapters.log('FCM: ensurePushRegistration calling lastTokenRefresh update.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          });
          await adapters.updateLastTokenRefresh(targetUser.uid);
          adapters.log('FCM: ensurePushRegistration lastTokenRefresh update success.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          });
        } catch (error) {
          adapters.warn('FCM: ensurePushRegistration lastTokenRefresh update failure.', {
            uid: targetUser.uid,
            tokenPreview: getTokenPreview(token),
          }, error);
        }

        if (
          storedMetadata.lastKnownFcmToken
          && storedMetadata.lastKnownUid
          && (
            storedMetadata.lastKnownFcmToken !== token
            || storedMetadata.lastKnownUid !== targetUser.uid
          )
        ) {
          try {
            await adapters.deleteTokenDoc(storedMetadata.lastKnownUid, storedMetadata.lastKnownFcmToken);
          } catch (error) {
            adapters.error('FCM: Failed to clean up the previous token document for this instance.', error);
          }
        }

        adapters.writeStoredMetadata({
          instanceId,
          lastKnownFcmToken: token,
          lastKnownUid: targetUser.uid,
          lastSuccessfulRegistrationAt: adapters.now(),
          lastSuccessfulRegistrationToken: token,
          lastSuccessfulRegistrationUid: targetUser.uid,
          lastSuccessfulRegistrationInstanceId: instanceId,
        });

        confirmedTokenKeys.add(getPushTokenSessionKey(targetUser.uid, token));
        state.setFcmDebugToken(token);
        state.setPushRegistrationStatus('registered');

        return logFinalStatus({
          attempted: true,
          status: 'registered',
          registered: true,
          token,
        });
      } catch (error) {
        state.setPushRegistrationStatus('failed');
        return logFinalStatus({
          attempted: true,
          status: 'failed',
          registered: false,
          error: error instanceof Error ? error.message : 'Push registration failed.',
        });
      }
    })();

    registrationPromise = registrationTask;

    try {
      return await registrationTask;
    } finally {
      registrationPromise = null;
    }
  };

  const maybeRecoverPushRegistration = async (
    targetUser: PushRegistrationUser | null,
    reason: PushRecoveryReason
  ): Promise<PushRecoveryResult> => {
    if (!adapters.isNotificationSupported()) {
      adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
        uid: targetUser?.uid ?? null,
        reason,
        skipReason: 'notification-unsupported',
      });
      return {
        attempted: false,
        status: 'skipped',
        registered: false,
      };
    }

    const permission = adapters.getNotificationPermission();
    state.setNotificationPermission(permission);

    if (!targetUser) {
      adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
        uid: null,
        reason,
        permission,
        skipReason: 'no-target-user',
      });
      return {
        attempted: false,
        status: 'skipped',
        registered: false,
      };
    }

    if (permission !== 'granted') {
      const { lastKnownFcmToken } = adapters.readStoredMetadata();

      if (state.getPushRegistrationStatus() !== 'idle' || lastKnownFcmToken) {
        await cleanupStoredPushToken();
      }

      adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
        uid: targetUser.uid,
        reason,
        permission,
        skipReason: 'permission-not-granted',
      });
      return {
        attempted: false,
        status: 'skipped',
        registered: false,
      };
    }

    const storedMetadata = adapters.readStoredMetadata();
    const pushRegistrationStatus = state.getPushRegistrationStatus();
    const assessment = assessPushRegistrationState({
      user: targetUser,
      permission,
      storedMetadata,
      localStatus: pushRegistrationStatus,
    });

    adapters.log('FCM: maybeRecoverPushRegistration assessment.', {
      uid: targetUser.uid,
      reason,
      permission,
      pushRegistrationStatus,
      assessmentReason: assessment.reason,
      isFreshInstance: assessment.isFreshInstance,
      hasSuccessMarker: assessment.hasSuccessMarker,
      isRegistrationIncomplete: assessment.isRegistrationIncomplete,
      shouldAttemptRegistration: assessment.shouldAttemptRegistration,
      shouldConsiderFirestoreConfirmation: assessment.shouldConsiderFirestoreConfirmation,
      currentInstanceId: assessment.currentInstanceId,
      hasCurrentToken: Boolean(assessment.currentToken),
    });

    if (!assessment.isRegistrationIncomplete) {
      if (targetUser && assessment.currentToken) {
        confirmedTokenKeys.add(getPushTokenSessionKey(targetUser.uid, assessment.currentToken));
        state.setFcmDebugToken(assessment.currentToken);
      }
      state.setPushRegistrationStatus('registered');
      adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
        uid: targetUser.uid,
        reason,
        permission,
        assessmentReason: assessment.reason,
        skipReason: 'registration-already-complete',
      });
      return {
        attempted: false,
        status: 'registered',
        registered: true,
        token: assessment.currentToken,
      };
    }

    if (assessment.shouldAttemptRegistration) {
      adapters.log('FCM: maybeRecoverPushRegistration decision invoke ensurePushRegistration.', {
        uid: targetUser.uid,
        reason,
        attemptReason: assessment.reason,
      });
      return ensurePushRegistration(targetUser, reason);
    }

    adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
      uid: targetUser.uid,
      reason,
      permission,
      assessmentReason: assessment.reason,
      skipReason: 'confirmation-path-instead-of-registration',
    });
    const confirmationResult = await confirmCurrentTokenDocIfNeeded({
      user: targetUser,
      permission,
      assessment,
      storedMetadata,
    });

    if (confirmationResult === 'confirmed' && targetUser && assessment.currentToken && assessment.currentInstanceId) {
      adapters.writeStoredMetadata({
        instanceId: assessment.currentInstanceId,
        lastKnownFcmToken: assessment.currentToken,
        lastKnownUid: targetUser.uid,
        lastSuccessfulRegistrationAt: adapters.now(),
        lastSuccessfulRegistrationToken: assessment.currentToken,
        lastSuccessfulRegistrationUid: targetUser.uid,
        lastSuccessfulRegistrationInstanceId: assessment.currentInstanceId,
      });
      state.setFcmDebugToken(assessment.currentToken);
      state.setPushRegistrationStatus('registered');
      return {
        attempted: false,
        status: 'confirmed',
        registered: true,
        token: assessment.currentToken,
      };
    }

    if (confirmationResult === 'missing_token_doc' || confirmationResult === 'error') {
      adapters.log('FCM: maybeRecoverPushRegistration decision invoke ensurePushRegistration.', {
        uid: targetUser.uid,
        reason,
        attemptReason: confirmationResult,
      });
      return ensurePushRegistration(targetUser, reason);
    }

    if (assessment.currentToken) {
      state.setFcmDebugToken(assessment.currentToken);
    }

    adapters.log('FCM: maybeRecoverPushRegistration decision skip registration recovery.', {
      uid: targetUser.uid,
      reason,
      permission,
      assessmentReason: assessment.reason,
      skipReason: 'confirmation-skipped-no-retry',
    });
    return {
      attempted: false,
      status: 'skipped',
      registered: false,
      token: assessment.currentToken,
    };
  };

  const requestNotificationPermission = async (user: PushRegistrationUser | null) => {
    if (!adapters.isNotificationSupported()) return;

    const permission = await adapters.requestNotificationPermission();
    state.setNotificationPermission(permission);

    if (permission === 'granted') {
      const result = await maybeRecoverPushRegistration(user, 'permission-granted');

      if (result.registered) {
        adapters.alert('알림 설정 완료! 토큰이 갱신되었습니다.');
      } else {
        adapters.alert('오류: ' + (result.error ?? '알림 설정 실패'));
      }
      return;
    }

    await cleanupStoredPushToken();
  };

  const resetPushRegistrationOnSignOut = () => {
    state.setPushRegistrationStatus('idle');
    confirmedTokenKeys.clear();
  };

  return {
    cleanupStoredPushToken,
    ensurePushRegistration,
    maybeRecoverPushRegistration,
    requestNotificationPermission,
    resetPushRegistrationOnSignOut,
  };
}
