import { doc, getDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { ReplyFeedback, ReplyFeedbackPersistence } from './types';

export function createFirestoreReplyFeedbackPersistence(db: Firestore): ReplyFeedbackPersistence {
  return {
    async saveReplyFeedback(replyId: string, feedbackType: ReplyFeedback) {
      await updateDoc(doc(db, 'letters', replyId), { feedback: feedbackType });
    },

    async incrementHelpedCount(replierId: string) {
      const replierRef = doc(db, 'users', replierId);
      const replierSnap = await getDoc(replierRef);
      if (replierSnap.exists()) {
        const currentCount = replierSnap.data().helpedCount || 0;
        await updateDoc(replierRef, { helpedCount: currentCount + 1 });
      }
    },
  };
}
