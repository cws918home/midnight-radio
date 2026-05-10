import type {
  ReplyPublicationAdapters,
  ReplyPublicationResult,
} from './types';

export async function publishPublisherComment(params: {
  replyId: string;
  replierId: string;
  content: string;
  adapters: ReplyPublicationAdapters;
}): Promise<ReplyPublicationResult> {
  const { replyId, replierId, content, adapters } = params;

  try {
    const moderationResult = await adapters.moderateComment(content);
    if (moderationResult.status === 'rejected') {
      return { type: 'rejected', reason: moderationResult.reason };
    }

    await adapters.updatePublisherComment({
      replyId,
      publisherComment: content,
    });
  } catch (error) {
    return { type: 'failed', error };
  }

  if (!replierId.startsWith('bot_')) {
    try {
      await adapters.notifyNewComment({ receiverUid: replierId });
    } catch (error) {
      adapters.logNotificationFailure(error);
    }
  }

  return { type: 'published' };
}
