import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReplyMailboxController } from './controller';
import { productionReplyMailboxAdapter } from './production';
import type { ReplyMailboxAdapter, ReplyMailboxLetter } from './types';

export function useReplyMailbox<Reply extends ReplyMailboxLetter>(params: {
  user: { uid: string } | null;
  adapter?: ReplyMailboxAdapter<Reply>;
}) {
  const { user, adapter = productionReplyMailboxAdapter as ReplyMailboxAdapter<Reply> } = params;
  const [inboxReplies, setInboxReplies] = useState<Reply[]>([]);
  const [myGivenReplies, setMyGivenReplies] = useState<Reply[]>([]);

  useEffect(() => {
    if (!user) {
      setInboxReplies([]);
      setMyGivenReplies([]);
      return;
    }

    const controller = new ReplyMailboxController(adapter, {
      setInboxReplies,
      setMyGivenReplies,
    });
    const unsubscribeInbox = adapter.subscribeToInboxReplies(user.uid, snapshot => {
      controller.applyReceivedSnapshot(snapshot);
    });
    const unsubscribeGiven = adapter.subscribeToGivenReplies(user.uid, snapshot => {
      controller.applyGivenSnapshot(snapshot);
    });

    return () => {
      unsubscribeInbox();
      unsubscribeGiven();
    };
  }, [adapter, user]);

  const markReplyRead = useCallback(
    (replyId: string) => adapter.markReplyRead(replyId),
    [adapter]
  );

  const unreadRepliesCount = useMemo(
    () => inboxReplies.filter(reply => !reply.isRead).length,
    [inboxReplies]
  );

  return {
    inboxReplies,
    myGivenReplies,
    unreadRepliesCount,
    markReplyRead,
  };
}
