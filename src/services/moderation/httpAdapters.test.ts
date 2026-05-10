import test from 'node:test';
import assert from 'node:assert/strict';
import { moderateCommentViaHttp, moderateReplyViaHttp } from '../replyPublication/adapters';
import { moderateWorryViaHttp } from '../worryPublication/adapters/http';

function mockFetch(status: number, body: unknown) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('moderateWorryViaHttp returns valid normalized responses', async () => {
  const restore = mockFetch(200, { status: 'approved', categories: ['취업'] });
  try {
    assert.deepEqual(await moderateWorryViaHttp('content'), {
      status: 'approved',
      categories: ['취업'],
    });
  } finally {
    restore();
  }
});

test('moderateWorryViaHttp throws on non-2xx and invalid response shape', async () => {
  let restore = mockFetch(502, { error: 'bad gateway' });
  try {
    await assert.rejects(() => moderateWorryViaHttp('content'), /process-worry HTTP 502/);
  } finally {
    restore();
  }

  restore = mockFetch(200, { status: 'approved', categories: [] });
  try {
    await assert.rejects(() => moderateWorryViaHttp('content'), /Invalid process-worry response/);
  } finally {
    restore();
  }
});

test('moderateReplyViaHttp returns valid normalized responses', async () => {
  const restore = mockFetch(200, { status: 'rejected', reason: 'blocked' });
  try {
    assert.deepEqual(await moderateReplyViaHttp('content'), {
      status: 'rejected',
      reason: 'blocked',
    });
  } finally {
    restore();
  }
});

test('moderateReplyViaHttp throws on non-2xx and invalid response shape', async () => {
  let restore = mockFetch(500, { error: 'failed' });
  try {
    await assert.rejects(() => moderateReplyViaHttp('content'), /process-reply HTTP 500/);
  } finally {
    restore();
  }

  restore = mockFetch(200, { status: 'rejected', reason: '' });
  try {
    await assert.rejects(() => moderateReplyViaHttp('content'), /Invalid process-reply response/);
  } finally {
    restore();
  }
});

test('moderateCommentViaHttp returns valid normalized responses', async () => {
  const restore = mockFetch(200, { status: 'approved' });
  try {
    assert.deepEqual(await moderateCommentViaHttp('content'), { status: 'approved' });
  } finally {
    restore();
  }
});

test('moderateCommentViaHttp throws on non-2xx and invalid response shape', async () => {
  let restore = mockFetch(503, { error: 'failed' });
  try {
    await assert.rejects(() => moderateCommentViaHttp('content'), /process-comment HTTP 503/);
  } finally {
    restore();
  }

  restore = mockFetch(200, { status: 'unknown' });
  try {
    await assert.rejects(() => moderateCommentViaHttp('content'), /Invalid process-comment response/);
  } finally {
    restore();
  }
});
