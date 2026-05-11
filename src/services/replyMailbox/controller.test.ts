import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplyMailboxController } from './controller';
import type {
  ReplyMailboxLetter,
  ReplyMailboxNotification,
  ReplyMailboxSnapshot,
} from './types';

const reply = (
  id: string,
  overrides: Partial<ReplyMailboxLetter> = {}
): ReplyMailboxLetter => ({
  id,
  isRead: false,
  ...overrides,
});

const snapshot = (
  replies: ReplyMailboxLetter[],
  changes: ReplyMailboxSnapshot['changes']
): ReplyMailboxSnapshot => ({ replies, changes });

test('received and given initial-load state are independent', () => {
  const delivered: ReplyMailboxNotification[] = [];
  const inboxStates: ReplyMailboxLetter[][] = [];
  const givenStates: ReplyMailboxLetter[][] = [];
  const controller = new ReplyMailboxController(
    {
      getNotificationPermission: () => 'granted',
      deliverNotification: notification => {
        delivered.push(notification);
      },
    },
    {
      setInboxReplies: replies => {
        inboxStates.push(replies);
      },
      setMyGivenReplies: replies => {
        givenStates.push(replies);
      },
    }
  );

  controller.applyReceivedSnapshot(snapshot(
    [reply('received-initial')],
    [{ type: 'added', reply: reply('received-initial') }]
  ));
  controller.applyReceivedSnapshot(snapshot(
    [reply('received-later')],
    [{ type: 'added', reply: reply('received-later') }]
  ));

  assert.equal(delivered.length, 1);
  assert.deepEqual(inboxStates.map(state => state.map(({ id }) => id)), [
    ['received-initial'],
    ['received-later'],
  ]);

  controller.applyGivenSnapshot(snapshot(
    [reply('given-initial', { publisherComment: '처음' })],
    [{ type: 'modified', reply: reply('given-initial', { publisherComment: '처음' }) }]
  ));

  assert.equal(delivered.length, 1);
  assert.deepEqual(givenStates.map(state => state.map(({ id }) => id)), [
    ['given-initial'],
  ]);

  controller.applyGivenSnapshot(snapshot(
    [reply('given-later', { publisherComment: '고마워요' })],
    [{ type: 'modified', reply: reply('given-later', { publisherComment: '고마워요' }) }]
  ));

  assert.equal(delivered.length, 2);
  assert.deepEqual(delivered.map(notification => notification.title), [
    `📻 갈피`,
    `💌 따뜻한 코멘트 도착`,
  ]);
});

test('given initial snapshot does not initialize the received stream', () => {
  const delivered: ReplyMailboxNotification[] = [];
  const controller = new ReplyMailboxController(
    {
      getNotificationPermission: () => 'granted',
      deliverNotification: notification => {
        delivered.push(notification);
      },
    },
    {
      setInboxReplies: () => {},
      setMyGivenReplies: () => {},
    }
  );

  controller.applyGivenSnapshot(snapshot(
    [reply('given-initial', { publisherComment: '처음' })],
    [{ type: 'modified', reply: reply('given-initial', { publisherComment: '처음' }) }]
  ));
  controller.applyReceivedSnapshot(snapshot(
    [reply('received-initial')],
    [{ type: 'added', reply: reply('received-initial') }]
  ));

  assert.deepEqual(delivered, []);
});
