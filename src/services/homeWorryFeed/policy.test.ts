import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVisibleHomeWorryFeed } from './policy';
import type { HomeWorryFeedLetter } from './types';

const at = (millis: number) => ({
  toMillis: () => millis,
});

const worry = (
  id: string,
  overrides: Partial<HomeWorryFeedLetter> = {}
): HomeWorryFeedLetter => ({
  id,
  senderId: 'sender',
  receiverId: 'public',
  originalContent: 'original',
  refinedContent: 'refined',
  createdAt: at(1_000),
  ...overrides,
});

test('public worries are visible', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('public', { receiverId: 'public' }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), ['public']);
});

test('worries addressed to the current user are visible', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('mine', { receiverId: 'current-user' }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), ['mine']);
});

test('other users non-public worries are hidden', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('other', { receiverId: 'other-user' }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), []);
});

test('visible worries sort newest first', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('old', { createdAt: at(1_000) }),
    worry('new', { createdAt: at(3_000) }),
    worry('middle', { createdAt: at(2_000) }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), ['new', 'middle', 'old']);
});

test('missing createdAt falls back to 0', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('missing', { createdAt: undefined }),
    worry('new', { createdAt: at(1) }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), ['new', 'missing']);
});

test('createdAt without truthy toMillis falls back to 0', () => {
  const feed = selectVisibleHomeWorryFeed([
    worry('without-toMillis', { createdAt: {} }),
    worry('new', { createdAt: at(1) }),
  ], { uid: 'current-user' });

  assert.deepEqual(feed.map(({ id }) => id), ['new', 'without-toMillis']);
});
