export type ReplyFeedback = 'helpful' | 'not_helpful';

export interface ReplyFeedbackTarget {
  id: string;
  senderId: string;
  isAiGenerated?: boolean;
}

export interface SubmitReplyFeedbackResult {
  feedback: ReplyFeedback;
}

export interface ReplyFeedbackPersistence {
  saveReplyFeedback(replyId: string, feedbackType: ReplyFeedback): Promise<void>;
  incrementHelpedCount(replierId: string): Promise<void>;
}
