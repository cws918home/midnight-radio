import type {
  ReplyFeedback,
  ReplyFeedbackPersistence,
  ReplyFeedbackTarget,
  SubmitReplyFeedbackResult,
} from './types';

interface SubmitReplyFeedbackParams {
  reply: ReplyFeedbackTarget;
  feedbackType: ReplyFeedback;
  persistence: ReplyFeedbackPersistence;
}

export async function submitReplyFeedback({
  reply,
  feedbackType,
  persistence,
}: SubmitReplyFeedbackParams): Promise<SubmitReplyFeedbackResult> {
  await persistence.saveReplyFeedback(reply.id, feedbackType);

  if (feedbackType !== 'helpful') {
    return { feedback: feedbackType };
  }

  if (reply.isAiGenerated === true || reply.senderId.startsWith('bot_')) {
    return { feedback: feedbackType };
  }

  try {
    await persistence.incrementHelpedCount(reply.senderId);
  } catch {
    // Helped-count persistence is intentionally hidden from the caller.
  }

  return { feedback: feedbackType };
}
