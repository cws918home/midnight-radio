import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { selectVisibleHomeWorryFeed } from './policy';
import type {
  HomeWorryFeedLetter,
  HomeWorryFeedProfile,
} from './types';

export function useHomeWorryFeed(params: {
  profile: HomeWorryFeedProfile | null;
}): { feedWorries: HomeWorryFeedLetter[] } {
  const { profile } = params;
  const [feedWorries, setFeedWorries] = useState<HomeWorryFeedLetter[]>([]);

  useEffect(() => {
    if (!profile) {
      setFeedWorries([]);
      return;
    }

    const q = query(
      collection(db, 'letters'),
      where('type', '==', 'worry'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        console.log(`Received snapshot with ${snapshot.size} worries.`);
        const allWorries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HomeWorryFeedLetter));
        const filtered = selectVisibleHomeWorryFeed(allWorries, profile);

        console.log(`Feed updated: ${filtered.length} worries visible.`);
        setFeedWorries(filtered);
      } catch (err) {
        console.error("Error processing worries:", err);
      }
    }, (err) => {
      console.error("Feed Listener CRITICAL Error:", err);
    });

    return () => unsubscribe();
  }, [profile]);

  return { feedWorries };
}
