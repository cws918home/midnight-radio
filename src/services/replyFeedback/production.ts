import { db } from '../../firebase';
import { createFirestoreReplyFeedbackPersistence } from './firestoreAdapters';
import { submitReplyFeedback } from './submitReplyFeedback';
import type { ReplyFeedback, ReplyFeedbackTarget } from './types';

const productionPersistence = createFirestoreReplyFeedbackPersistence(db);

export function submitReplyFeedbackWithProductionAdapters(params: {
  reply: ReplyFeedbackTarget;
  feedbackType: ReplyFeedback;
}) {
  return submitReplyFeedback({
    ...params,
    persistence: productionPersistence,
  });
}
