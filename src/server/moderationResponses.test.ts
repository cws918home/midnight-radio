import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processSimpleModerationResponse,
  processWorryModerationResponse,
} from './moderationResponses';

test('worry route response returns HTTP 200 for valid approval', async () => {
  const result = await processWorryModerationResponse('content', async () => ({
    status: 'approved',
    categories: ['취업'],
  }));

  assert.deepEqual(result, {
    statusCode: 200,
    body: { status: 'approved', categories: ['취업'] },
  });
});

test('worry route response returns HTTP 200 for valid content rejection', async () => {
  const result = await processWorryModerationResponse('content', async () => ({
    status: 'rejected',
    reason: 'blocked',
  }));

  assert.deepEqual(result, {
    statusCode: 200,
    body: { status: 'rejected', reason: 'blocked' },
  });
});

test('worry route response returns non-2xx after retry category inference failure', async () => {
  const calls: boolean[] = [];
  const result = await processWorryModerationResponse('content', async () => {
    calls.push(true);
    return { status: 'approved', categories: [] };
  });

  assert.equal(result.statusCode, 502);
  assert.equal(calls.length, 2);
});

test('worry route response returns non-2xx for provider failure', async () => {
  const result = await processWorryModerationResponse('content', async () => {
    throw new Error('provider down');
  });

  assert.equal(result.statusCode, 502);
});

test('worry route response returns non-2xx for missing or empty rejection reason', async () => {
  assert.equal(
    (await processWorryModerationResponse('content', async () => ({ status: 'rejected' }))).statusCode,
    502
  );
  assert.equal(
    (await processWorryModerationResponse('content', async () => ({ status: 'rejected', reason: '' }))).statusCode,
    502
  );
});

test('reply route response returns HTTP 200 for valid approval and rejection', async () => {
  assert.deepEqual(
    await processSimpleModerationResponse('content', async () => ({ status: 'approved' })),
    { statusCode: 200, body: { status: 'approved' } }
  );
  assert.deepEqual(
    await processSimpleModerationResponse('content', async () => ({ status: 'rejected', reason: 'blocked' })),
    { statusCode: 200, body: { status: 'rejected', reason: 'blocked' } }
  );
});

test('reply route response returns non-2xx for missing or empty rejection reason', async () => {
  assert.equal(
    (await processSimpleModerationResponse('content', async () => ({ status: 'rejected' }))).statusCode,
    502
  );
  assert.equal(
    (await processSimpleModerationResponse('content', async () => ({ status: 'rejected', reason: ' ' }))).statusCode,
    502
  );
});

test('reply route response returns non-2xx for provider failure', async () => {
  const result = await processSimpleModerationResponse('content', async () => {
    throw new Error('provider down');
  });

  assert.equal(result.statusCode, 502);
});

test('comment route response returns non-2xx for missing or empty rejection reason', async () => {
  assert.equal(
    (await processSimpleModerationResponse('content', async () => ({ status: 'rejected' }))).statusCode,
    502
  );
  assert.equal(
    (await processSimpleModerationResponse('content', async () => ({ status: 'rejected', reason: '' }))).statusCode,
    502
  );
});
