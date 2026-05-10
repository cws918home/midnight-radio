interface SentPublicationTimestamp {
  toMillis(): number;
}

export interface SentPublicationGroupLetter {
  id: string;
  senderId: string;
  originalContent: string;
  categories?: string[];
  category?: string;
  createdAt?: SentPublicationTimestamp | null;
  publicationGroupId?: string;
}

export interface SentPublicationGroup {
  groupKey: string;
  publicationGroupId?: string;
  originalContent: string;
  categories: string[];
  createdAt: SentPublicationTimestamp | null;
  letters: SentPublicationGroupLetter[];
}

const LEGACY_PUBLICATION_WINDOW_MS = 15_000;

const getLetterCategories = (letter: SentPublicationGroupLetter) =>
  (letter.categories ?? (letter.category ? [letter.category] : [])).filter(Boolean) as string[];

const getTimestampMillis = (timestamp?: SentPublicationTimestamp | null) =>
  timestamp && typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : null;

const buildLegacyPublicationFingerprint = (letter: SentPublicationGroupLetter) => {
  const normalizedCategories = [...getLetterCategories(letter)].sort().join('|');
  return [letter.senderId, letter.originalContent, normalizedCategories].join('::');
};

export const buildSentPublicationGroups = (
  letters: SentPublicationGroupLetter[]
): SentPublicationGroup[] => {
  const publicationGroups = new Map<string, SentPublicationGroup>();
  const legacyBuckets = new Map<string, SentPublicationGroupLetter[]>();
  const singletonGroups: SentPublicationGroup[] = [];

  for (const letter of letters) {
    if (letter.publicationGroupId) {
      const groupKey = `group:${letter.publicationGroupId}`;
      const existingGroup = publicationGroups.get(groupKey);

      if (existingGroup) {
        existingGroup.letters.push(letter);

        const existingMillis = getTimestampMillis(existingGroup.createdAt);
        const nextMillis = getTimestampMillis(letter.createdAt);
        if (nextMillis !== null && (existingMillis === null || nextMillis > existingMillis)) {
          existingGroup.createdAt = letter.createdAt ?? null;
        }
      } else {
        publicationGroups.set(groupKey, {
          groupKey,
          publicationGroupId: letter.publicationGroupId,
          originalContent: letter.originalContent,
          categories: getLetterCategories(letter),
          createdAt: letter.createdAt ?? null,
          letters: [letter],
        });
      }
      continue;
    }

    const createdAtMillis = getTimestampMillis(letter.createdAt);
    if (createdAtMillis === null) {
      singletonGroups.push({
        groupKey: `legacy-single:${letter.id}`,
        originalContent: letter.originalContent,
        categories: getLetterCategories(letter),
        createdAt: letter.createdAt ?? null,
        letters: [letter],
      });
      continue;
    }

    const fingerprint = buildLegacyPublicationFingerprint(letter);
    const bucket = legacyBuckets.get(fingerprint) ?? [];
    bucket.push(letter);
    legacyBuckets.set(fingerprint, bucket);
  }

  const legacyGroups: SentPublicationGroup[] = [];

  for (const [fingerprint, bucket] of legacyBuckets) {
    bucket.sort((a, b) => (getTimestampMillis(a.createdAt) ?? 0) - (getTimestampMillis(b.createdAt) ?? 0));

    let anchorCreatedAtMillis: number | null = null;
    let cluster: SentPublicationGroupLetter[] = [];

    const flushCluster = () => {
      if (cluster.length === 0 || anchorCreatedAtMillis === null) return;

      const latestLetter = cluster[cluster.length - 1];
      legacyGroups.push({
        groupKey: `legacy:${fingerprint}:${anchorCreatedAtMillis}`,
        originalContent: cluster[0].originalContent,
        categories: getLetterCategories(cluster[0]),
        createdAt: latestLetter.createdAt ?? null,
        letters: [...cluster],
      });

      cluster = [];
      anchorCreatedAtMillis = null;
    };

    for (const letter of bucket) {
      const createdAtMillis = getTimestampMillis(letter.createdAt);

      if (createdAtMillis === null) {
        flushCluster();
        singletonGroups.push({
          groupKey: `legacy-single:${letter.id}`,
          originalContent: letter.originalContent,
          categories: getLetterCategories(letter),
          createdAt: letter.createdAt ?? null,
          letters: [letter],
        });
        continue;
      }

      if (anchorCreatedAtMillis === null) {
        anchorCreatedAtMillis = createdAtMillis;
        cluster = [letter];
        continue;
      }

      if (createdAtMillis - anchorCreatedAtMillis <= LEGACY_PUBLICATION_WINDOW_MS) {
        cluster.push(letter);
        continue;
      }

      flushCluster();
      anchorCreatedAtMillis = createdAtMillis;
      cluster = [letter];
    }

    flushCluster();
  }

  return [...publicationGroups.values(), ...legacyGroups, ...singletonGroups].sort((a, b) => {
    return (getTimestampMillis(b.createdAt) ?? 0) - (getTimestampMillis(a.createdAt) ?? 0);
  });
};
