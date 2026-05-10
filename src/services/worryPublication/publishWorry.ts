import {
  ACTIVE_HUMAN_QUERY_LIMIT,
  filterEligibleHumans,
  getActiveHumanCutoff,
  selectWorryRecipients,
} from './policy/recipientSelection';
import type { PublishWorryResult, WorryPublicationAdapters } from './types';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류';

export async function publishWorry(params: {
  authorUid: string;
  content: string;
  adapters: WorryPublicationAdapters;
  selectRecipients?: typeof selectWorryRecipients;
}): Promise<PublishWorryResult> {
  const { authorUid, content, adapters, selectRecipients = selectWorryRecipients } = params;

  let moderationResult;
  let humans;

  try {
    const activeSince = getActiveHumanCutoff(adapters.now());
    [moderationResult, humans] = await Promise.all([
      adapters.moderateWorry(content),
      adapters.fetchActiveHumans({
        authorUid,
        activeSince,
        limit: ACTIVE_HUMAN_QUERY_LIMIT,
      }),
    ]);
  } catch (error) {
    return {
      status: 'failed',
      stage: 'moderation',
      reason: getErrorMessage(error),
    };
  }

  if (moderationResult.status === 'rejected') {
    return { status: 'rejected', reason: moderationResult.reason };
  }

  const eligibleHumans = filterEligibleHumans(humans, authorUid);
  const selectionResult = selectRecipients({
    humans: eligibleHumans,
    inferredCategories: moderationResult.categories,
    shuffle: adapters.shuffle,
  });

  if (selectionResult.status === 'invariant_failed') {
    return {
      status: 'failed',
      stage: 'recipient_selection',
      reason: selectionResult.reason,
    };
  }

  const publicationGroupId = adapters.createPublicationGroupId();
  let createdLetters;

  try {
    createdLetters = await adapters.createWorryLetters({
      authorUid,
      content,
      inferredCategories: moderationResult.categories,
      publicationGroupId,
      recipients: selectionResult.recipients,
    });
  } catch (error) {
    return {
      status: 'failed',
      stage: 'letter_creation',
      reason: getErrorMessage(error),
    };
  }

  const warnings = await adapters.runPublicationFollowUps({
    authorUid,
    worryContent: content,
    recipients: selectionResult.recipients,
    createdLetters,
  });

  return {
    status: 'published',
    recipients: selectionResult.recipients,
    createdLetters,
    publicationGroupId,
    warnings,
  };
}
