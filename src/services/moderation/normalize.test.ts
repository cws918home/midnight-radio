import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSimpleModeration, normalizeWorryModeration } from './normalize';

test('normalizes approved worry moderation with valid categories', () => {
  assert.deepEqual(
    normalizeWorryModeration({
      status: 'approved',
      categories: ['취업', ' 취업 ', 'unknown', '', '잡담'],
    }),
    { status: 'approved', categories: ['취업', '잡담'] }
  );
});

test('normalizes approved worry moderation with a legacy category string', () => {
  assert.deepEqual(
    normalizeWorryModeration({ status: 'approved', category: '진로' }),
    { status: 'approved', categories: ['진로'] }
  );
});

test('rejects invalid worry approvals', () => {
  assert.deepEqual(normalizeWorryModeration({ status: 'approved', categories: [] }), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration({ status: 'approved', categories: ['unknown'] }), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration({ status: 'approved' }), { status: 'invalid' });
});

test('rejects worry moderation rejections with missing or empty reason', () => {
  assert.deepEqual(normalizeWorryModeration({ status: 'rejected' }), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration({ status: 'rejected', reason: '' }), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration({ status: 'rejected', reason: '   ' }), { status: 'invalid' });
});

test('normalizes worry moderation rejection with a non-empty reason', () => {
  assert.deepEqual(
    normalizeWorryModeration({ status: 'rejected', reason: ' blocked ' }),
    { status: 'rejected', reason: 'blocked' }
  );
});

test('rejects malformed worry moderation values', () => {
  assert.deepEqual(normalizeWorryModeration(null), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration('approved'), { status: 'invalid' });
  assert.deepEqual(normalizeWorryModeration({ status: 'unknown' }), { status: 'invalid' });
});

test('normalizes simple moderation approval and rejection', () => {
  assert.deepEqual(normalizeSimpleModeration({ status: 'approved' }), { status: 'approved' });
  assert.deepEqual(
    normalizeSimpleModeration({ status: 'rejected', reason: ' blocked ' }),
    { status: 'rejected', reason: 'blocked' }
  );
});

test('rejects invalid simple moderation shapes', () => {
  assert.deepEqual(normalizeSimpleModeration({ status: 'rejected' }), { status: 'invalid' });
  assert.deepEqual(normalizeSimpleModeration({ status: 'rejected', reason: '' }), { status: 'invalid' });
  assert.deepEqual(normalizeSimpleModeration({ status: 'unknown' }), { status: 'invalid' });
  assert.deepEqual(normalizeSimpleModeration(null), { status: 'invalid' });
});
