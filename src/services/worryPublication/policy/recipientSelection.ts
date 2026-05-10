import type { DeliveryRecipient, HumanProfile, MatchSelectionType } from '../../../../packages/domain/src';

export const TARGET_RECIPIENT_COUNT = 3;
export const ACTIVE_HUMAN_QUERY_LIMIT = 50;
export const ACTIVE_HUMAN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const AI_BOT_PROFILES = [
  { uid: 'bot_empathy', gender: 'female', interests: [] },
  { uid: 'bot_logic', gender: 'male', interests: [] },
  { uid: 'bot_friend', gender: 'hidden', interests: [] },
] as const satisfies readonly HumanProfile[];

export type Shuffle = <T>(items: T[]) => T[];

export type RecipientSelectionResult =
  | { status: 'selected'; recipients: DeliveryRecipient[] }
  | { status: 'invariant_failed'; reason: string };

export const countCategoryOverlap = (candidateInterests: string[] = [], inferredCategories: string[]) =>
  candidateInterests.filter(interest => inferredCategories.includes(interest)).length;

export const getActiveHumanCutoff = (now: Date) =>
  new Date(now.getTime() - ACTIVE_HUMAN_LOOKBACK_MS);

export const filterEligibleHumans = (humans: HumanProfile[], authorUid: string) =>
  humans.filter(human => human.uid !== authorUid);

const appendRecipientIfUnselected = (
  selectedRecipients: DeliveryRecipient[],
  recipient: DeliveryRecipient
) => {
  if (selectedRecipients.some(selected => selected.uid === recipient.uid)) {
    return false;
  }

  selectedRecipients.push(recipient);
  return true;
};

const toRecipient = (
  human: HumanProfile,
  matchOverlapCount: number,
  matchSelectionType: MatchSelectionType,
  inferredCategories: string[]
): DeliveryRecipient => ({
  uid: human.uid,
  gender: human.gender,
  interests: human.interests || [],
  matchOverlapCount,
  matchSelectionType,
  matchCategoriesSnapshot: [...inferredCategories],
});

const takeRandomUnselectedHumans = (
  humans: HumanProfile[],
  selectedRecipients: DeliveryRecipient[],
  count: number,
  inferredCategories: string[],
  shuffle: Shuffle
) => {
  const selectedIds = new Set(selectedRecipients.map(({ uid }) => uid));

  return shuffle(humans)
    .filter(human => !selectedIds.has(human.uid))
    .filter(human => countCategoryOverlap(human.interests || [], inferredCategories) === 0)
    .slice(0, count)
    .map(human => toRecipient(human, 0, 'random_fallback', inferredCategories));
};

const getNextUnselectedAiRecipient = (
  selectedRecipients: DeliveryRecipient[],
  selectionType: Extract<MatchSelectionType, 'ai' | 'ai_safety_fallback'>,
  inferredCategories: string[],
  aiBotProfiles: readonly HumanProfile[]
) => {
  const selectedIds = new Set(selectedRecipients.map(({ uid }) => uid));
  const nextBot = aiBotProfiles.find(bot => !selectedIds.has(bot.uid));

  if (!nextBot) {
    return null;
  }

  return toRecipient(nextBot, 0, selectionType, inferredCategories);
};

const hasExactlyUniqueRecipients = (recipients: DeliveryRecipient[]) =>
  recipients.length === TARGET_RECIPIENT_COUNT &&
  new Set(recipients.map(({ uid }) => uid)).size === TARGET_RECIPIENT_COUNT;

export function selectWorryRecipients(params: {
  humans: HumanProfile[];
  inferredCategories: string[];
  shuffle: Shuffle;
  aiBotProfiles?: readonly HumanProfile[];
}): RecipientSelectionResult {
  const { humans, inferredCategories, shuffle, aiBotProfiles = AI_BOT_PROFILES } = params;
  const humansByOverlap = new Map<number, HumanProfile[]>();

  for (const human of humans) {
    const overlapCount = countCategoryOverlap(human.interests || [], inferredCategories);
    if (overlapCount <= 0) continue;

    const group = humansByOverlap.get(overlapCount) ?? [];
    group.push(human);
    humansByOverlap.set(overlapCount, group);
  }

  const selectedRecipients: DeliveryRecipient[] = [];
  const sortedOverlapCounts = [...humansByOverlap.keys()].sort((a, b) => b - a);

  for (const overlapCount of sortedOverlapCounts) {
    const group = humansByOverlap.get(overlapCount);
    if (!group) continue;

    for (const candidate of shuffle(group)) {
      appendRecipientIfUnselected(
        selectedRecipients,
        toRecipient(candidate, overlapCount, 'matched', inferredCategories)
      );

      if (selectedRecipients.length === TARGET_RECIPIENT_COUNT) {
        break;
      }
    }

    if (selectedRecipients.length === TARGET_RECIPIENT_COUNT) {
      break;
    }
  }

  const matchedSelectedCount = selectedRecipients.length;

  if (matchedSelectedCount < TARGET_RECIPIENT_COUNT) {
    const aiRecipient = getNextUnselectedAiRecipient(
      selectedRecipients,
      'ai',
      inferredCategories,
      aiBotProfiles
    );
    if (aiRecipient) {
      appendRecipientIfUnselected(selectedRecipients, aiRecipient);
    }

    const fallbackHumanSlots =
      matchedSelectedCount === 1
        ? 1
        : matchedSelectedCount === 0
          ? 2
          : 0;

    const randomFallbackHumans = takeRandomUnselectedHumans(
      humans,
      selectedRecipients,
      fallbackHumanSlots,
      inferredCategories,
      shuffle
    );

    for (const recipient of randomFallbackHumans) {
      appendRecipientIfUnselected(selectedRecipients, recipient);
    }

    while (selectedRecipients.length < TARGET_RECIPIENT_COUNT) {
      const safetyRecipient = getNextUnselectedAiRecipient(
        selectedRecipients,
        'ai_safety_fallback',
        inferredCategories,
        aiBotProfiles
      );

      if (!safetyRecipient) {
        break;
      }

      appendRecipientIfUnselected(selectedRecipients, safetyRecipient);
    }
  }

  if (!hasExactlyUniqueRecipients(selectedRecipients)) {
    return {
      status: 'invariant_failed',
      reason: 'Could not select exactly 3 unique recipients for worry publication.',
    };
  }

  return { status: 'selected', recipients: selectedRecipients };
}
