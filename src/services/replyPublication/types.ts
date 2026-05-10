export type ReplyModerationResult =
  | { status: 'approved' }
  | { status: 'rejected'; reason: string };

export type ReplyPublicationResult =
  | { type: 'published' }
  | { type: 'rejected'; reason: string }
  | { type: 'failed'; error: unknown };

export interface ReplyLetterPayload {
  senderId: string;
  receiverId: string;
  originalContent: string;
  refinedContent: string;
  type: 'reply';
  replyTo: string;
  replyToContent: string;
  createdAt: unknown;
  isRead: false;
  feedback: null;
}

export interface PublisherCommentPayload {
  replyId: string;
  publisherComment: string;
}

export interface ReplyNotificationPayload {
  receiverUid: string;
}

export interface CommentNotificationPayload {
  receiverUid: string;
}

export interface ReplyPublicationAdapters {
  moderateReply(content: string): Promise<ReplyModerationResult>;
  moderateComment(content: string): Promise<ReplyModerationResult>;
  createReplyLetter(payload: ReplyLetterPayload): Promise<void>;
  updatePublisherComment(payload: PublisherCommentPayload): Promise<void>;
  notifyNewReply(payload: ReplyNotificationPayload): Promise<void>;
  notifyNewComment(payload: CommentNotificationPayload): Promise<void>;
  createdAt(): unknown;
  logNotificationFailure(error: unknown): void;
}
