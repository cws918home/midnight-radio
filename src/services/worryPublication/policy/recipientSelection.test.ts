import test from 'node:test';
import assert from 'node:assert/strict';
import type { HumanProfile } from '../../../../packages/domain/src';
import {
  ACTIVE_HUMAN_QUERY_LIMIT,
  filterEligibleHumans,
  getActiveHumanCutoff,
  selectWorryRecipients,
} from './recipientSelection';

const identityShuffle = <T>(items: T[]) => [...items];
const reverseShuffle = <T>(items: T[]) => [...items].reverse();

const human = (uid: string, interests: string[]): HumanProfile => ({
  uid,
  gender: 'hidden',
  interests,
});

test('active human eligibility fixture matches current query contract and excludes only author uid', () => {
  const now = new Date('2026-05-10T00:00:00.000Z');

  assert.equal(ACTIVE_HUMAN_QUERY_LIMIT, 50);
  assert.equal(getActiveHumanCutoff(now).toISOString(), '2026-05-09T00:00:00.000Z');
  assert.deepEqual(
    filterEligibleHumans(
      [
        human('author', ['취업']),
        human('blocked-user', ['취업']),
        human('deleted-user', ['취업']),
        human('bot-looking-user', ['취업']),
      ],
      'author'
    ).map(({ uid }) => uid),
    ['blocked-user', 'deleted-user', 'bot-looking-user']
  );
});

test('highest overlap humans are selected first', () => {
  const result = selectWorryRecipients({
    humans: [
      human('one-overlap', ['취업']),
      human('two-overlap-a', ['취업', '진로']),
      human('two-overlap-b', ['취업', '진로']),
      human('zero-overlap', ['건강']),
    ],
    inferredCategories: ['취업', '진로'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(result.recipients.map(({ uid }) => uid), ['two-overlap-a', 'two-overlap-b', 'one-overlap']);
});

test('same-overlap tie-breaking is deterministic with injected shuffle', () => {
  const result = selectWorryRecipients({
    humans: [
      human('first', ['취업']),
      human('second', ['취업']),
      human('third', ['취업']),
    ],
    inferredCategories: ['취업'],
    shuffle: reverseShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(result.recipients.map(({ uid }) => uid), ['third', 'second', 'first']);
});

test('matched count 2 adds one ai bot and no random fallback human', () => {
  const result = selectWorryRecipients({
    humans: [
      human('matched-a', ['취업']),
      human('matched-b', ['취업']),
      human('fallback-human', ['건강']),
    ],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(
    result.recipients.map(({ uid, matchSelectionType }) => [uid, matchSelectionType]),
    [
      ['matched-a', 'matched'],
      ['matched-b', 'matched'],
      ['bot_empathy', 'ai'],
    ]
  );
});

test('matched count 1 adds ai, one random fallback human, then safety bots if needed', () => {
  const result = selectWorryRecipients({
    humans: [
      human('matched', ['취업']),
      human('fallback-a', ['건강']),
      human('fallback-b', ['건강']),
    ],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(
    result.recipients.map(({ uid, matchSelectionType }) => [uid, matchSelectionType]),
    [
      ['matched', 'matched'],
      ['bot_empathy', 'ai'],
      ['fallback-a', 'random_fallback'],
    ]
  );
});

test('matched count 0 adds ai, up to two random fallback humans, then safety bots if needed', () => {
  const result = selectWorryRecipients({
    humans: [
      human('fallback-a', ['건강']),
      human('fallback-b', ['건강']),
      human('fallback-c', ['건강']),
    ],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(
    result.recipients.map(({ uid, matchSelectionType }) => [uid, matchSelectionType]),
    [
      ['bot_empathy', 'ai'],
      ['fallback-a', 'random_fallback'],
      ['fallback-b', 'random_fallback'],
    ]
  );
});

test('no eligible humans produces exactly 3 unique recipients through AI fallback', () => {
  const result = selectWorryRecipients({
    humans: [],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.deepEqual(result.recipients.map(({ uid }) => uid), ['bot_empathy', 'bot_logic', 'bot_friend']);
  assert.equal(new Set(result.recipients.map(({ uid }) => uid)).size, 3);
});

test('insufficient unique recipients returns invariant failure', () => {
  const result = selectWorryRecipients({
    humans: [],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
    aiBotProfiles: [human('bot_empathy', [])],
  });

  assert.equal(result.status, 'invariant_failed');
});

test('selected recipients are exactly 3 and unique', () => {
  const result = selectWorryRecipients({
    humans: [
      human('matched', ['취업']),
      human('fallback', ['건강']),
    ],
    inferredCategories: ['취업'],
    shuffle: identityShuffle,
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.recipients.length, 3);
  assert.equal(new Set(result.recipients.map(({ uid }) => uid)).size, 3);
});
