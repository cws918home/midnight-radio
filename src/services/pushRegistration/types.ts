export type PushRegistrationStatus = 'idle' | 'registering' | 'registered' | 'failed' | 'missing_token_doc';

export type PushRecoveryReason =
  | 'auth-restored'
  | 'auth-restored-no-profile'
  | 'signed-in-stable'
  | 'permission-granted'
  | 'app-foreground'
  | 'installed-pwa-initial';

export interface PushRegistrationUser {
  uid: string;
}

export interface StoredPushMetadata {
  instanceId: string | null;
  lastKnownFcmToken: string | null;
  lastKnownUid: string | null;
  lastSuccessfulRegistrationAt: number | null;
  lastSuccessfulRegistrationToken: string | null;
  lastSuccessfulRegistrationUid: string | null;
  lastSuccessfulRegistrationInstanceId: string | null;
}

export interface PushRegistrationAssessment {
  isFreshInstance: boolean;
  hasSuccessMarker: boolean;
  isRegistrationIncomplete: boolean;
  shouldAttemptRegistration: boolean;
  shouldConsiderFirestoreConfirmation: boolean;
  currentInstanceId: string | null;
  currentToken: string | null;
  reason: string;
}

export type FirestoreConfirmationResult = 'confirmed' | 'missing_token_doc' | 'skipped' | 'error';

export interface PushRecoveryResult {
  attempted: boolean;
  status: PushRegistrationStatus | 'confirmed' | 'skipped';
  registered: boolean;
  token?: string | null;
  error?: string;
}

export type MessagingRegistrationType = 'app-controlled' | 'fallback';

export interface ResolvedMessagingRegistration<TRegistration = unknown> {
  registration: TRegistration;
  registrationType: MessagingRegistrationType;
}

export interface ExistingTokenDoc {
  exists(): boolean;
  data(): { createdAt?: unknown };
}

export interface PushRegistrationAdapters<TRegistration = unknown> {
  hasMessaging(): boolean;
  isNotificationSupported(): boolean;
  isServiceWorkerSupported(): boolean;
  getNotificationPermission(): NotificationPermission;
  requestNotificationPermission(): Promise<NotificationPermission>;
  isInstalledPWA(): boolean;
  readStoredMetadata(): StoredPushMetadata;
  writeStoredMetadata(updates: Partial<StoredPushMetadata>): void;
  clearStoredMetadata(): void;
  getOrCreateInstanceId(): string;
  resolveMessagingRegistration(installedPWA: boolean): Promise<ResolvedMessagingRegistration<TRegistration>>;
  getFcmToken(registration: TRegistration): Promise<string | null>;
  getTokenDoc(uid: string, token: string): Promise<ExistingTokenDoc>;
  writeTokenDoc(params: {
    uid: string;
    token: string;
    permission: NotificationPermission;
    installedPWA: boolean;
    instanceId: string;
    existingTokenDoc: ExistingTokenDoc;
  }): Promise<void>;
  updateLastTokenRefresh(uid: string): Promise<void>;
  deleteTokenDoc(uid: string, token: string): Promise<void>;
  now(): number;
  alert(message: string): void;
  log(message: string, payload?: unknown): void;
  warn(message: string, payload?: unknown, error?: unknown): void;
  error(message: string, payload?: unknown, error?: unknown): void;
}

export interface PushRegistrationLifecycleState {
  getPushRegistrationStatus(): PushRegistrationStatus;
  setNotificationPermission(permission: NotificationPermission): void;
  setPushRegistrationStatus(status: PushRegistrationStatus): void;
  setFcmDebugToken(token: string): void;
}
