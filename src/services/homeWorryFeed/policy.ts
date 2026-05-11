import type {
  HomeWorryFeedLetter,
  HomeWorryFeedProfile,
} from './types';

export function selectVisibleHomeWorryFeed(
  worries: HomeWorryFeedLetter[],
  profile: HomeWorryFeedProfile
): HomeWorryFeedLetter[] {
  const filtered = worries.filter(w => {
    if (w.receiverId === 'public') return true;

    if (w.receiverId === profile.uid) {
      return true;
    }
    return false;
  });

  filtered.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  return filtered;
}
