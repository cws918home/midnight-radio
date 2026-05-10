import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPublisherComment } from './publishPublisherComment';
import { publishReply } from './publishReply';
import type { ReplyPublicationAdapters, ReplyModerationResult } from './types';

const createdAt = { sentinel: 'serverTimestamp' };

function createAdapters(overrides: Partial<ReplyPublicationAdapters> = {}) {
  const calls = {
    createReplyLetter: [] as unknown[],
    updatePublisherComment: [] as unknown[],
    notifyNewReply: [] as unknown[],
    notifyNewComment: [] as unknown[],
    logNotificationFailure: [] as unknown[],
  };

  const adapters: ReplyPublicationAdapters = {
    moderateReply: async () => ({ status: 'approved' }),
    moderateComment: async () => ({ status: 'approved' }),
    createReplyLetter: async payload => {
      calls.createReplyLetter.push(payload);
    },
    updatePublisherComment: async payload => {
      calls.updatePublisherComment.push(payload);
    },
    notifyNewReply: async payload => {
      calls.notifyNewReply.push(payload);
    },
    notifyNewComment: async payload => {
      calls.notifyNewComment.push(payload);
    },
    createdAt: () => createdAt,
    logNotificationFailure: error => {
      calls.logNotificationFailure.push(error);
    },
    ...overrides,
  };

  return { adapters, calls };
}

const worry = {
  id: 'worry-1',
  senderId: 'sender-1',
  originalContent: 'original worry',
};

test('publishReply returns rejected without creating a letter when moderation rejects content', async () => {
  const { adapters, calls } = createAdapters({
    moderateReply: async (): Promise<ReplyModerationResult> => ({
      status: 'rejected',
      reason: 'blocked',
    }),
  });

  const result = await publishReply({
    authorUid: 'reply-author',
    content: 'reply content',
    worry,
    adapters,
  });

  assert.deepEqual(result, { type: 'rejected', reason: 'blocked' });
  assert.equal(calls.createReplyLetter.length, 0);
  assert.equal(calls.notifyNewReply.length, 0);
});

test('publishReply creates the expected reply letter fields and attempts notification', async () => {
  const { adapters, calls } = createAdapters();

  const result = await publishReply({
    authorUid: 'reply-author',
    content: 'reply content',
    worry,
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.deepEqual(calls.createReplyLetter, [
    {
      senderId: 'reply-author',
      receiverId: 'sender-1',
      originalContent: 'reply content',
      refinedContent: 'reply content',
      type: 'reply',
      replyTo: 'worry-1',
      replyToContent: 'original worry',
      createdAt,
      isRead: false,
      feedback: null,
    },
  ]);
  assert.deepEqual(calls.notifyNewReply, [{ receiverUid: 'sender-1' }]);
});

test('publishReply returns published when notification fails after the letter is created', async () => {
  const notifyError = new Error('notify failed');
  const { adapters, calls } = createAdapters({
    notifyNewReply: async payload => {
      calls.notifyNewReply.push(payload);
      throw notifyError;
    },
  });

  const result = await publishReply({
    authorUid: 'reply-author',
    content: 'reply content',
    worry,
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.equal(calls.createReplyLetter.length, 1);
  assert.deepEqual(calls.logNotificationFailure, [notifyError]);
});

test('publishReply returns failed when moderation throws', async () => {
  const error = new Error('moderation failed');
  const { adapters, calls } = createAdapters({
    moderateReply: async () => {
      throw error;
    },
  });

  const result = await publishReply({
    authorUid: 'reply-author',
    content: 'reply content',
    worry,
    adapters,
  });

  assert.deepEqual(result, { type: 'failed', error });
  assert.equal(calls.createReplyLetter.length, 0);
  assert.equal(calls.notifyNewReply.length, 0);
});

test('publishReply returns failed when creating the letter throws', async () => {
  const error = new Error('create failed');
  const { adapters, calls } = createAdapters({
    createReplyLetter: async payload => {
      calls.createReplyLetter.push(payload);
      throw error;
    },
  });

  const result = await publishReply({
    authorUid: 'reply-author',
    content: 'reply content',
    worry,
    adapters,
  });

  assert.deepEqual(result, { type: 'failed', error });
  assert.equal(calls.createReplyLetter.length, 1);
  assert.equal(calls.notifyNewReply.length, 0);
});

test('publishPublisherComment returns rejected without updating Firestore when moderation rejects content', async () => {
  const { adapters, calls } = createAdapters({
    moderateComment: async (): Promise<ReplyModerationResult> => ({
      status: 'rejected',
      reason: 'blocked',
    }),
  });

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'rejected', reason: 'blocked' });
  assert.equal(calls.updatePublisherComment.length, 0);
  assert.equal(calls.notifyNewComment.length, 0);
});

test('publishPublisherComment updates the expected publisher comment field', async () => {
  const { adapters, calls } = createAdapters();

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.deepEqual(calls.updatePublisherComment, [
    { replyId: 'reply-1', publisherComment: 'publisher comment' },
  ]);
});

test('publishPublisherComment skips notification for bot reply authors', async () => {
  const { adapters, calls } = createAdapters();

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'bot_empathy',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.equal(calls.updatePublisherComment.length, 1);
  assert.equal(calls.notifyNewComment.length, 0);
});

test('publishPublisherComment attempts notification for human reply authors', async () => {
  const { adapters, calls } = createAdapters();

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.deepEqual(calls.notifyNewComment, [{ receiverUid: 'human-1' }]);
});

test('publishPublisherComment returns published when human notification fails after the comment is updated', async () => {
  const notifyError = new Error('notify failed');
  const { adapters, calls } = createAdapters({
    notifyNewComment: async payload => {
      calls.notifyNewComment.push(payload);
      throw notifyError;
    },
  });

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'published' });
  assert.equal(calls.updatePublisherComment.length, 1);
  assert.deepEqual(calls.logNotificationFailure, [notifyError]);
});

test('publishPublisherComment returns failed when moderation throws', async () => {
  const error = new Error('moderation failed');
  const { adapters, calls } = createAdapters({
    moderateComment: async () => {
      throw error;
    },
  });

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'failed', error });
  assert.equal(calls.updatePublisherComment.length, 0);
  assert.equal(calls.notifyNewComment.length, 0);
});

test('publishPublisherComment returns failed when updating the comment throws', async () => {
  const error = new Error('update failed');
  const { adapters, calls } = createAdapters({
    updatePublisherComment: async payload => {
      calls.updatePublisherComment.push(payload);
      throw error;
    },
  });

  const result = await publishPublisherComment({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
    adapters,
  });

  assert.deepEqual(result, { type: 'failed', error });
  assert.equal(calls.updatePublisherComment.length, 1);
  assert.equal(calls.notifyNewComment.length, 0);
});
