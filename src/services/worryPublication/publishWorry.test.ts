import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CreatedWorryLetterMetadata,
  HumanProfile,
} from '@midnight-radio/domain';
import { publishWorry } from './publishWorry';
import type { ModerationResult, WorryPublicationAdapters } from './types';

const identityShuffle = <T>(items: T[]) => [...items];

const human = (uid: string, interests: string[]): HumanProfile => ({
  uid,
  gender: 'hidden',
  interests,
});

function createAdapters(overrides: Partial<WorryPublicationAdapters> = {}) {
  const calls = {
    createWorryLetters: [] as unknown[],
    runPublicationFollowUps: [] as unknown[],
  };

  const adapters: WorryPublicationAdapters = {
    moderateWorry: async () => ({ status: 'approved', categories: ['취업'] }),
    fetchActiveHumans: async () => [
      human('human-a', ['취업']),
      human('human-b', ['취업']),
      human('human-c', ['취업']),
    ],
    createPublicationGroupId: () => 'group-1',
    createWorryLetters: async params => {
      calls.createWorryLetters.push(params);
      return params.recipients.map((recipient, index): CreatedWorryLetterMetadata => ({
        id: `letter-${index + 1}`,
        receiverId: recipient.uid,
        publicationGroupId: params.publicationGroupId,
        matchOverlapCount: recipient.matchOverlapCount,
        matchSelectionType: recipient.matchSelectionType,
        matchCategoriesSnapshot: [...recipient.matchCategoriesSnapshot],
      }));
    },
    runPublicationFollowUps: async params => {
      calls.runPublicationFollowUps.push(params);
      return [];
    },
    now: () => new Date('2026-05-10T00:00:00.000Z'),
    shuffle: identityShuffle,
    ...overrides,
  };

  return { adapters, calls };
}

test('moderation rejection returns rejected and creates no letters', async () => {
  const { adapters, calls } = createAdapters({
    moderateWorry: async (): Promise<ModerationResult> => ({
      status: 'rejected',
      reason: 'blocked',
    }),
  });

  const result = await publishWorry({ authorUid: 'author', content: 'content', adapters });

  assert.deepEqual(result, { status: 'rejected', reason: 'blocked' });
  assert.equal(calls.createWorryLetters.length, 0);
});

test('moderation API failure returns failed and creates no letters', async () => {
  const { adapters, calls } = createAdapters({
    moderateWorry: async () => {
      throw new Error('network down');
    },
  });

  const result = await publishWorry({ authorUid: 'author', content: 'content', adapters });

  assert.deepEqual(result, { status: 'failed', stage: 'moderation', reason: 'network down' });
  assert.equal(calls.createWorryLetters.length, 0);
});

test('recipient invariant failure returns failed', async () => {
  const { adapters } = createAdapters();

  const result = await publishWorry({
    authorUid: 'author',
    content: 'content',
    adapters,
    selectRecipients: () => ({ status: 'invariant_failed', reason: 'not enough recipients' }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.status === 'failed' ? result.stage : null, 'recipient_selection');
});

test('successful publication creates one letter per selected recipient with one publicationGroupId', async () => {
  const { adapters } = createAdapters();

  const result = await publishWorry({ authorUid: 'author', content: 'content', adapters });

  assert.equal(result.status, 'published');
  if (result.status !== 'published') return;

  assert.equal(result.createdLetters.length, 3);
  assert.equal(result.publicationGroupId, 'group-1');
  assert.deepEqual(
    [...new Set(result.createdLetters.map(({ publicationGroupId }) => publicationGroupId))],
    ['group-1']
  );
  assert.deepEqual(
    result.createdLetters.map(({ receiverId }) => receiverId),
    ['human-a', 'human-b', 'human-c']
  );
});

test('letter creation failure returns failed and skips follow-up', async () => {
  const { adapters, calls } = createAdapters({
    fetchActiveHumans: async () => [],
    createWorryLetters: async () => {
      calls.createWorryLetters.push({});
      throw new Error('commit failed');
    },
  });

  const result = await publishWorry({ authorUid: 'author', content: 'content', adapters });

  assert.deepEqual(result, {
    status: 'failed',
    stage: 'letter_creation',
    reason: 'commit failed',
  });
  assert.equal(calls.runPublicationFollowUps.length, 0);
});

test('follow-up warnings are returned unchanged', async () => {
  const { adapters } = createAdapters({
    runPublicationFollowUps: async () => [
      'bot_scheduling_failed:bot_empathy:bot failed',
      'notification_failed:notify failed',
    ],
  });

  const result = await publishWorry({ authorUid: 'author', content: 'content', adapters });

  assert.equal(result.status, 'published');
  if (result.status !== 'published') return;

  assert.deepEqual(result.warnings, [
    'bot_scheduling_failed:bot_empathy:bot failed',
    'notification_failed:notify failed',
  ]);
});
