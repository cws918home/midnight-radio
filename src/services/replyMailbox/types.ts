export interface ReplyMailboxLetter {
  id: string;
  isRead: boolean;
  publisherComment?: string;
}

export type ReplyMailboxChangeType = 'added' | 'modified' | 'removed';

export interface ReplyMailboxChange<Reply extends ReplyMailboxLetter = ReplyMailboxLetter> {
  type: ReplyMailboxChangeType;
  reply: Reply;
}

export interface ReplyMailboxSnapshot<Reply extends ReplyMailboxLetter = ReplyMailboxLetter> {
  replies: Reply[];
  changes: ReplyMailboxChange<Reply>[];
}

export interface ReplyMailboxNotification {
  title: string;
  options: NotificationOptions;
}

export interface ReplyMailboxAdapter<Reply extends ReplyMailboxLetter = ReplyMailboxLetter> {
  subscribeToInboxReplies(
    uid: string,
    onSnapshot: (snapshot: ReplyMailboxSnapshot<Reply>) => void
  ): () => void;
  subscribeToGivenReplies(
    uid: string,
    onSnapshot: (snapshot: ReplyMailboxSnapshot<Reply>) => void
  ): () => void;
  markReplyRead(replyId: string): Promise<void>;
  getNotificationPermission(): NotificationPermission;
  deliverNotification(notification: ReplyMailboxNotification): void;
}
