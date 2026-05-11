# Worry Publication Baseline

This document captures the current client-side worry publication behavior before moving it behind a use-case boundary.

- Active humans are fetched from Firestore `users` with `lastActive >= oneDayAgo` and query `limit(50)`.
- The only post-query eligibility exclusion is the current author uid.
- No blocked, deleted, bot, or additional status filters are part of the current behavior.
- Humans with at least one overlap between inferred categories and interests are matched candidates.
- Higher overlap groups are selected before lower overlap groups.
- Ties within the same overlap group are shuffled.
- The target recipient count is exactly 3 unique recipients.
- If matched humans are fewer than 3, one unselected AI bot is added with `matchSelectionType: "ai"`.
- If matched humans are 1, up to one overlap-0 human is added as `random_fallback`.
- If matched humans are 0, up to two overlap-0 humans are added as `random_fallback`.
- If matched humans are 2, no random fallback human is added.
- Remaining slots are filled with unselected AI bots as `ai_safety_fallback`.
- Firestore letter fields remain compatible, including both `categories` and legacy `category`.
- `/api/process-worry`, `/api/schedule-bot-reply`, and `/api/notify-new-worry` payload shapes remain unchanged.

## Worry Publication Follow-up

- Post-letter side effects are assembled as one domain-level `runPublicationFollowUps` operation.
- Bot reply scheduling still applies only to created letters whose selected recipient uid starts with `bot_`.
- New-worry notification still targets all selected recipient ids.
- Bot reply scheduling and new-worry notification failures are non-fatal and are returned as publication warnings.

## Moderation Normalization

- Provider moderation output is untrusted until normalized.
- Content rejection means content rejection only when `reason` is a non-empty string.
- Invalid provider shape and transport failure are publication failures, not content rejection.
- Worry approval requires at least one valid normalized category.

## Sent Worry Publication Read-Model

Sent Worry publication history is grouped by a pure read-model before rendering.

- Letters with `publicationGroupId` are grouped by that id.
- For `publicationGroupId` groups, the first encountered letter supplies the displayed `originalContent` and `categories`; the newest usable timestamp becomes the group `createdAt`.
- Legacy letters without `publicationGroupId` are grouped by `senderId`, `originalContent`, and a sorted category fingerprint.
- Legacy groups are clustered within the existing 15-second publication window.
- Legacy buckets are sorted by timestamp before clustering.
- Empty `categories: []` wins over legacy `category` and later renders through the existing fallback behavior.
- Missing, null, or no-`toMillis` timestamps are treated as singleton groups.
- Existing Firestore query behavior and sent-history rendering behavior remain unchanged.

# Push Registration Baseline

Push Registration owns the browser/Firebase push-token lifecycle for the signed-in user.

- `App.tsx` crosses the Push Registration seam only through `usePushRegistration`.
- `usePushRegistration` exposes only notification permission, registration status, debug token, permission request, and sign-out reset behavior to the app shell.
- Foreground `onMessage` notification display remains in `App.tsx`.
- Settings UI strings and permission labels remain unchanged.
- Local Push Registration metadata is stored under `galpi:push-registration-metadata`.
- Legacy localStorage keys remain readable: `galpi:push-instance-id`, `galpi:push-last-known-fcm-token`, and `galpi:push-last-known-fcm-uid`.
- A browser instance id is preserved when local Push Registration metadata is cleared.
- Complete local metadata means permission is granted, uid matches, instance id matches, token matches, the success marker matches, and local status is not failed.
- Only complete local metadata can produce a registered no-op without Firestore token document confirmation.
- Missing local token, `failed` status, and `missing_token_doc` status attempt registration.
- Missing or stale success markers attempt Firestore token document confirmation before registration.
- Firestore confirmation is suppressed while a registration is in flight, when the token was already confirmed in-session, or during the existing 90-second confirmation cooldown.
- The Firestore token document path remains `users/{uid}/fcmTokens/{encodeURIComponent(token)}`.
- The Firestore token document shape remains compatible: `token`, `platform: "web"`, `userAgent`, `createdAt`, `updatedAt`, `notificationPermission`, `isInstalledPWA`, and `instanceId`.
- User documents still receive `lastTokenRefresh` after token document write; failure to update it remains non-fatal.
- App-controlled service worker registration is preferred over the fallback Firebase messaging service worker when available.
- Previous token document cleanup after signed-in user change or token change happens only after the new registration succeeds.
- Sign-out and permission revocation still perform immediate stored-token cleanup.
