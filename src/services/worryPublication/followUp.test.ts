import test from 'node:test';
import assert from 'node:assert/strict';
import type { CreatedWorryLetterMetadata, DeliveryRecipient } from '@midnight-radio/domain';
import { createPublicationFollowUpRunner } from './followUp';

const recipient = (uid: string): DeliveryRecipient => ({
  uid,
  gender: 'hidden',
  interests: [],
  matchOverlapCount: 0,
  matchSelectionType: uid.startsWith('bot_') ? 'ai' : 'matched',
  matchCategoriesSnapshot: ['취업'],
});

const letter = (id: string, receiverId: string): CreatedWorryLetterMetadata => ({
  id,
  receiverId,
  publicationGroupId: 'group-1',
  matchOverlapCount: 0,
  matchSelectionType: receiverId.startsWith('bot_') ? 'ai' : 'matched',
  matchCategoriesSnapshot: ['취업'],
});

test('schedules one bot reply per created bot-recipient letter', async () => {
  const calls: unknown[] = [];
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async params => {
      calls.push(params);
    },
    notifyNewWorry: async () => {},
  });

  await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('bot_empathy'), recipient('bot_logic')],
    createdLetters: [letter('letter-1', 'bot_empathy'), letter('letter-2', 'bot_logic')],
  });

  assert.deepEqual(calls, [
    {
      worryId: 'letter-1',
      worryContent: 'content',
      authorUid: 'author',
      botInfo: recipient('bot_empathy'),
    },
    {
      worryId: 'letter-2',
      worryContent: 'content',
      authorUid: 'author',
      botInfo: recipient('bot_logic'),
    },
  ]);
});

test('skips human recipients for bot scheduling', async () => {
  const calls: unknown[] = [];
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async params => {
      calls.push(params);
    },
    notifyNewWorry: async () => {},
  });

  await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('human-a'), recipient('bot_empathy')],
    createdLetters: [letter('letter-1', 'human-a'), letter('letter-2', 'bot_empathy')],
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    worryId: 'letter-2',
    worryContent: 'content',
    authorUid: 'author',
    botInfo: recipient('bot_empathy'),
  });
});

test('notification targets all selected recipient ids', async () => {
  const calls: unknown[] = [];
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async () => {},
    notifyNewWorry: async params => {
      calls.push(params);
    },
  });

  await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('human-a'), recipient('bot_empathy'), recipient('human-b')],
    createdLetters: [letter('letter-1', 'human-a')],
  });

  assert.deepEqual(calls, [{ receiverUids: ['human-a', 'bot_empathy', 'human-b'] }]);
});

test('returns exact bot scheduling warning string', async () => {
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async () => {
      throw new Error('bot failed');
    },
    notifyNewWorry: async () => {},
  });

  const warnings = await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('bot_empathy')],
    createdLetters: [letter('letter-1', 'bot_empathy')],
  });

  assert.deepEqual(warnings, ['bot_scheduling_failed:bot_empathy:bot failed']);
});

test('returns exact notification warning string', async () => {
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async () => {},
    notifyNewWorry: async () => {
      throw new Error('notify failed');
    },
  });

  const warnings = await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('human-a')],
    createdLetters: [letter('letter-1', 'human-a')],
  });

  assert.deepEqual(warnings, ['notification_failed:notify failed']);
});

test('ignores mismatched created letter without warning', async () => {
  const calls: unknown[] = [];
  const runPublicationFollowUps = createPublicationFollowUpRunner({
    scheduleBotReply: async params => {
      calls.push(params);
    },
    notifyNewWorry: async () => {},
  });

  const warnings = await runPublicationFollowUps({
    authorUid: 'author',
    worryContent: 'content',
    recipients: [recipient('bot_empathy')],
    createdLetters: [letter('letter-1', 'bot_missing')],
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(warnings, []);
});
