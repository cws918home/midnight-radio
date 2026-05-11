import test from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase/firestore';
import { createProductionReplyPublisher } from './productionFactory';
import { createProductionReplyPublisher as createProductionReplyPublisherFromBarrel } from './index';
import type { ReplyPublicationAdapters, ReplyPublicationResult } from './types';

const fakeDb = {} as Firestore;
const publishedResult: ReplyPublicationResult = { type: 'published' };

const worry = {
  id: 'worry-1',
  senderId: 'sender-1',
  originalContent: 'original worry',
};

test('delegates reply params unchanged and supplies production adapters', async () => {
  let captured:
    | {
        authorUid: string;
        content: string;
        worry: typeof worry;
        adapters: ReplyPublicationAdapters;
      }
    | null = null;
  const publishReplyUseCase = async (params: {
    authorUid: string;
    content: string;
    worry: typeof worry;
    adapters: ReplyPublicationAdapters;
  }) => {
    captured = params;
    return publishedResult;
  };

  const { publishReplyWithProductionAdapters } = createProductionReplyPublisher({
    db: fakeDb,
    publishReplyUseCase,
  });
  const result = await publishReplyWithProductionAdapters({
    authorUid: 'author-1',
    content: 'reply content',
    worry,
  });

  assert.deepEqual(result, publishedResult);
  assert.ok(captured);
  assert.equal(captured.authorUid, 'author-1');
  assert.equal(captured.content, 'reply content');
  assert.equal(captured.worry, worry);
  assert.equal(typeof captured.adapters.createReplyLetter, 'function');
});

test('delegates publisher comment params unchanged and supplies production adapters', async () => {
  let captured:
    | {
        replyId: string;
        replierId: string;
        content: string;
        adapters: ReplyPublicationAdapters;
      }
    | null = null;
  const publishPublisherCommentUseCase = async (params: {
    replyId: string;
    replierId: string;
    content: string;
    adapters: ReplyPublicationAdapters;
  }) => {
    captured = params;
    return publishedResult;
  };

  const { publishPublisherCommentWithProductionAdapters } = createProductionReplyPublisher({
    db: fakeDb,
    publishPublisherCommentUseCase,
  });
  const result = await publishPublisherCommentWithProductionAdapters({
    replyId: 'reply-1',
    replierId: 'human-1',
    content: 'publisher comment',
  });

  assert.deepEqual(result, publishedResult);
  assert.ok(captured);
  assert.equal(captured.replyId, 'reply-1');
  assert.equal(captured.replierId, 'human-1');
  assert.equal(captured.content, 'publisher comment');
  assert.equal(typeof captured.adapters.updatePublisherComment, 'function');
});

test('barrel export exposes factory without importing production entrypoint', async () => {
  let published = false;
  const publishReplyUseCase = async (params: {
    authorUid: string;
    content: string;
    worry: typeof worry;
    adapters: ReplyPublicationAdapters;
  }) => {
    published = true;
    assert.equal(typeof params.adapters.notifyNewReply, 'function');
    return publishedResult;
  };

  const { publishReplyWithProductionAdapters } = createProductionReplyPublisherFromBarrel({
    db: fakeDb,
    publishReplyUseCase,
  });
  await publishReplyWithProductionAdapters({
    authorUid: 'author-1',
    content: 'reply content',
    worry,
  });

  assert.equal(published, true);
});
