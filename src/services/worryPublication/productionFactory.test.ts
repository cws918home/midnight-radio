import test from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase/firestore';
import { createProductionWorryPublisher } from './productionFactory';
import { createProductionWorryPublisher as createProductionWorryPublisherFromBarrel } from './index';
import { getActiveHumanCutoff } from './policy/recipientSelection';
import type { PublishWorryResult, WorryPublicationAdapters } from './types';

const fakeDb = {} as Firestore;

const publishedResult: PublishWorryResult = {
  status: 'published',
  recipients: [],
  createdLetters: [],
  publicationGroupId: 'group-1',
  warnings: [],
};

test('delegates authorUid and content unchanged to injected publish', async () => {
  const calls: Array<{ authorUid: string; content: string }> = [];
  const publish = async (params: {
    authorUid: string;
    content: string;
    adapters: WorryPublicationAdapters;
  }) => {
    calls.push({ authorUid: params.authorUid, content: params.content });
    return publishedResult;
  };

  const publishWorry = createProductionWorryPublisher({ db: fakeDb, publish });
  const result = await publishWorry({ authorUid: 'author-1', content: 'worry content' });

  assert.equal(result.status, 'published');
  assert.deepEqual(calls, [{ authorUid: 'author-1', content: 'worry content' }]);
});

test('supplies callable production adapter properties to publish', async () => {
  let capturedAdapters: WorryPublicationAdapters | null = null;
  const publish = async (params: {
    authorUid: string;
    content: string;
    adapters: WorryPublicationAdapters;
  }) => {
    capturedAdapters = params.adapters;
    return publishedResult;
  };

  await createProductionWorryPublisher({ db: fakeDb, publish })({
    authorUid: 'author-1',
    content: 'worry content',
  });

  assert.ok(capturedAdapters);
  assert.equal(typeof capturedAdapters.moderateWorry, 'function');
  assert.equal(typeof capturedAdapters.fetchActiveHumans, 'function');
  assert.equal(typeof capturedAdapters.createPublicationGroupId, 'function');
  assert.equal(typeof capturedAdapters.createWorryLetters, 'function');
  assert.equal(typeof capturedAdapters.runPublicationFollowUps, 'function');
  assert.equal(typeof capturedAdapters.now, 'function');
  assert.equal(typeof capturedAdapters.shuffle, 'function');
});

test('injected now affects the active-human cutoff seen by publish', async () => {
  let observedCutoff: Date | null = null;
  const publish = async (params: {
    authorUid: string;
    content: string;
    adapters: WorryPublicationAdapters;
  }) => {
    observedCutoff = getActiveHumanCutoff(params.adapters.now());
    return publishedResult;
  };

  await createProductionWorryPublisher({
    db: fakeDb,
    now: () => new Date('2026-05-10T12:00:00.000Z'),
    publish,
  })({ authorUid: 'author-1', content: 'worry content' });

  assert.equal(observedCutoff?.toISOString(), '2026-05-09T12:00:00.000Z');
});

test('injected random affects assembled shuffle behavior', async () => {
  let shuffled: string[] = [];
  const publish = async (params: {
    authorUid: string;
    content: string;
    adapters: WorryPublicationAdapters;
  }) => {
    shuffled = params.adapters.shuffle(['a', 'b', 'c']);
    return publishedResult;
  };

  await createProductionWorryPublisher({
    db: fakeDb,
    random: () => 0,
    publish,
  })({ authorUid: 'author-1', content: 'worry content' });

  assert.deepEqual(shuffled, ['b', 'c', 'a']);
});

test('barrel export exposes factory without importing production entrypoint', async () => {
  let published = false;
  const publish = async (params: {
    authorUid: string;
    content: string;
    adapters: WorryPublicationAdapters;
  }) => {
    published = true;
    return publishedResult;
  };

  const publishWorry = createProductionWorryPublisherFromBarrel({ db: fakeDb, publish });
  await publishWorry({ authorUid: 'author-1', content: 'worry content' });

  assert.equal(published, true);
});
