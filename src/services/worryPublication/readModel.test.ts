import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSentPublicationGroups,
  type SentPublicationGroupLetter,
} from './readModel';

interface SentPublicationTimestamp {
  toMillis(): number;
}

const at = (millis: number): SentPublicationTimestamp => ({
  toMillis: () => millis,
});

const letter = (
  id: string,
  overrides: Partial<SentPublicationGroupLetter> = {}
): SentPublicationGroupLetter => ({
  id,
  senderId: 'sender',
  originalContent: 'original',
  category: '진로',
  createdAt: at(1_000),
  ...overrides,
});

test('groups letters with the same publicationGroupId', () => {
  const groups = buildSentPublicationGroups([
    letter('a', { publicationGroupId: 'group-1', createdAt: at(1_000) }),
    letter('b', { publicationGroupId: 'group-1', createdAt: at(2_000) }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey, 'group:group-1');
  assert.deepEqual(groups[0].letters.map(({ id }) => id), ['a', 'b']);
});

test('publicationGroupId uses the first encountered representative content and categories', () => {
  const groups = buildSentPublicationGroups([
    letter('a', {
      publicationGroupId: 'group-1',
      originalContent: 'first',
      categories: ['연애'],
      category: '진로',
    }),
    letter('b', {
      publicationGroupId: 'group-1',
      originalContent: 'second',
      categories: ['취업'],
    }),
  ]);

  assert.equal(groups[0].originalContent, 'first');
  assert.deepEqual(groups[0].categories, ['연애']);
});

test('publicationGroupId uses the newest usable timestamp', () => {
  const newest = at(3_000);
  const groups = buildSentPublicationGroups([
    letter('a', { publicationGroupId: 'group-1', createdAt: at(2_000) }),
    letter('b', { publicationGroupId: 'group-1', createdAt: newest }),
    letter('c', { publicationGroupId: 'group-1', createdAt: at(1_000) }),
  ]);

  assert.equal(groups[0].createdAt, newest);
});

test('legacy grouping buckets by sender, original content, and sorted category fingerprint', () => {
  const groups = buildSentPublicationGroups([
    letter('a', { senderId: 'sender-1', originalContent: 'same', categories: ['연애'], createdAt: at(1_000) }),
    letter('b', { senderId: 'sender-2', originalContent: 'same', categories: ['연애'], createdAt: at(2_000) }),
    letter('c', { senderId: 'sender-1', originalContent: 'other', categories: ['연애'], createdAt: at(3_000) }),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.letters.map(({ id }) => id)), [['c'], ['b'], ['a']]);
});

test('legacy category fingerprint normalizes category order', () => {
  const groups = buildSentPublicationGroups([
    letter('a', { categories: ['연애', '진로'], createdAt: at(1_000) }),
    letter('b', { categories: ['진로', '연애'], createdAt: at(2_000) }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].letters.map(({ id }) => id), ['a', 'b']);
});

test('empty categories win over legacy category and render as an empty category list', () => {
  const groups = buildSentPublicationGroups([
    letter('a', { categories: [], category: '진로', createdAt: at(1_000) }),
    letter('b', { categories: [], category: '진로', createdAt: at(2_000) }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].categories, []);
});

test('legacy grouping clusters timestamps within the publication window', () => {
  const groups = buildSentPublicationGroups([
    letter('a', { createdAt: at(1_000) }),
    letter('b', { createdAt: at(16_000) }),
    letter('c', { createdAt: at(16_001) }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.letters.map(({ id }) => id)), [['c'], ['a', 'b']]);
});

test('legacy input is sorted before clustering and representative values come from the sorted cluster', () => {
  const latest = at(3_000);
  const groups = buildSentPublicationGroups([
    letter('late', { originalContent: 'same', categories: ['진로'], createdAt: latest }),
    letter('early', { originalContent: 'same', categories: ['진로'], createdAt: at(1_000) }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].letters.map(({ id }) => id), ['early', 'late']);
  assert.equal(groups[0].originalContent, 'same');
  assert.deepEqual(groups[0].categories, ['진로']);
  assert.equal(groups[0].createdAt, latest);
});

test('missing, null, and no-toMillis timestamps become singleton legacy groups', () => {
  const groups = buildSentPublicationGroups([
    letter('missing', { createdAt: undefined }),
    letter('null', { createdAt: null }),
    letter('invalid', { createdAt: {} as SentPublicationTimestamp }),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map(group => group.groupKey).sort(),
    ['legacy-single:invalid', 'legacy-single:missing', 'legacy-single:null']
  );
});

test('NaN timestamps keep non-null legacy grouping behavior', () => {
  const groups = buildSentPublicationGroups([
    letter('nan', { createdAt: at(Number.NaN) }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey, 'legacy:sender::original::진로:NaN');
  assert.deepEqual(groups[0].letters.map(({ id }) => id), ['nan']);
});

test('final groups are sorted newest first', () => {
  const groups = buildSentPublicationGroups([
    letter('old', { publicationGroupId: 'old', createdAt: at(1_000) }),
    letter('legacy-new', { createdAt: at(3_000) }),
    letter('new', { publicationGroupId: 'new', createdAt: at(5_000) }),
  ]);

  assert.deepEqual(groups.map(group => group.letters.map(({ id }) => id)), [['new'], ['legacy-new'], ['old']]);
});
