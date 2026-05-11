import {
  getGivenReplyNotifications,
  getReceivedReplyNotifications,
} from './policy';
import type {
  ReplyMailboxAdapter,
  ReplyMailboxLetter,
  ReplyMailboxSnapshot,
} from './types';

export interface ReplyMailboxControllerState<Reply extends ReplyMailboxLetter = ReplyMailboxLetter> {
  setInboxReplies(replies: Reply[]): void;
  setMyGivenReplies(replies: Reply[]): void;
}

export class ReplyMailboxController<Reply extends ReplyMailboxLetter = ReplyMailboxLetter> {
  private receivedInitialLoad = true;
  private givenInitialLoad = true;

  constructor(
    private readonly adapter: Pick<ReplyMailboxAdapter<Reply>, 'deliverNotification' | 'getNotificationPermission'>,
    private readonly state: ReplyMailboxControllerState<Reply>
  ) {}

  applyReceivedSnapshot(snapshot: ReplyMailboxSnapshot<Reply>) {
    const notifications = getReceivedReplyNotifications({
      isInitialSnapshot: this.receivedInitialLoad,
      permission: this.adapter.getNotificationPermission(),
      changes: snapshot.changes,
    });

    notifications.forEach(notification => this.adapter.deliverNotification(notification));
    this.state.setInboxReplies(snapshot.replies);
    this.receivedInitialLoad = false;
  }

  applyGivenSnapshot(snapshot: ReplyMailboxSnapshot<Reply>) {
    const notifications = getGivenReplyNotifications({
      isInitialSnapshot: this.givenInitialLoad,
      permission: this.adapter.getNotificationPermission(),
      changes: snapshot.changes,
    });

    notifications.forEach(notification => this.adapter.deliverNotification(notification));
    this.state.setMyGivenReplies(snapshot.replies);
    this.givenInitialLoad = false;
  }
}
