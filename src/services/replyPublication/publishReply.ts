import type {
  ReplyPublicationAdapters,
  ReplyPublicationResult,
} from './types';

export async function publishReply(params: {
  authorUid: string;
  content: string;
  worry: {
    id: string;
    senderId: string;
    originalContent: string;
  };
  adapters: ReplyPublicationAdapters;
}): Promise<ReplyPublicationResult> {
  const { authorUid, content, worry, adapters } = params;

  try {
    const moderationResult = await adapters.moderateReply(content);
    if (moderationResult.status === 'rejected') {
      return { type: 'rejected', reason: moderationResult.reason };
    }

    await adapters.createReplyLetter({
      senderId: authorUid,
      receiverId: worry.senderId,
      originalContent: content,
      refinedContent: content,
      type: 'reply',
      replyTo: worry.id,
      replyToContent: worry.originalContent,
      createdAt: adapters.createdAt(),
      isRead: false,
      feedback: null,
    });
  } catch (error) {
    return { type: 'failed', error };
  }

  try {
    await params.adapters.notifyNewReply({ receiverUid: worry.senderId });
  } catch (error) {
    params.adapters.logNotificationFailure(error);
  }

  return { type: 'published' };
}
