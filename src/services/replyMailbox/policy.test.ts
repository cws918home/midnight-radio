import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGivenReplyNotifications,
  getReceivedReplyNotifications,
} from './policy';
import type { ReplyMailboxLetter } from './types';

const reply = (overrides: Partial<ReplyMailboxLetter> = {}): ReplyMailboxLetter => ({
  id: 'reply-1',
  isRead: false,
  ...overrides,
});

test('received initial snapshot emits no notification', () => {
  const notifications = getReceivedReplyNotifications({
    isInitialSnapshot: true,
    permission: 'granted',
    changes: [{ type: 'added', reply: reply() }],
  });

  assert.deepEqual(notifications, []);
});

test('received later added change emits the new-reply notification', () => {
  const notifications = getReceivedReplyNotifications({
    isInitialSnapshot: false,
    permission: 'granted',
    changes: [{ type: 'added', reply: reply() }],
  });

  assert.deepEqual(notifications, [{
    title: `📻 갈피`,
    options: {
      body: "누군가 내 고민에 답변을 보냈어요. 지금 확인해보세요.",
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
    },
  }]);
});

test('given initial snapshot emits no notification', () => {
  const notifications = getGivenReplyNotifications({
    isInitialSnapshot: true,
    permission: 'granted',
    changes: [{ type: 'modified', reply: reply({ publisherComment: '고마워요' }) }],
  });

  assert.deepEqual(notifications, []);
});

test('given later modified change without publisherComment emits no notification', () => {
  const notifications = getGivenReplyNotifications({
    isInitialSnapshot: false,
    permission: 'granted',
    changes: [{ type: 'modified', reply: reply() }],
  });

  assert.deepEqual(notifications, []);
});

test('given later modified change with publisherComment emits the comment notification', () => {
  const notifications = getGivenReplyNotifications({
    isInitialSnapshot: false,
    permission: 'granted',
    changes: [{ type: 'modified', reply: reply({ publisherComment: '고마워요' }) }],
  });

  assert.deepEqual(notifications, [{
    title: `💌 따뜻한 코멘트 도착`,
    options: {
      body: `상대방이 감사 인사를 남겼어요: "고마워요"`,
      icon: '/pwa-192x192.png',
    },
  }]);
});

test('denied or default permission emits no notification', () => {
  assert.deepEqual(getReceivedReplyNotifications({
    isInitialSnapshot: false,
    permission: 'denied',
    changes: [{ type: 'added', reply: reply() }],
  }), []);
  assert.deepEqual(getGivenReplyNotifications({
    isInitialSnapshot: false,
    permission: 'default',
    changes: [{ type: 'modified', reply: reply({ publisherComment: '고마워요' }) }],
  }), []);
});
