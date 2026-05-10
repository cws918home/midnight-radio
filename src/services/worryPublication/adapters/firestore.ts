import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type {
  CreatedWorryLetterMetadata,
  DeliveryRecipient,
  HumanProfile,
} from '@midnight-radio/domain';

export async function fetchActiveHumansFromFirestore(params: {
  db: Firestore;
  activeSince: Date;
  limitCount: number;
}): Promise<HumanProfile[]> {
  const usersSnap = await getDocs(
    query(
      collection(params.db, 'users'),
      where('lastActive', '>=', Timestamp.fromDate(params.activeSince)),
      limit(params.limitCount)
    )
  );

  return usersSnap.docs.map(d => {
    const data = d.data() as HumanProfile;
    return {
      uid: data.uid,
      gender: data.gender,
      interests: data.interests || [],
    };
  });
}

export function createFirestorePublicationGroupId(db: Firestore) {
  return doc(collection(db, 'letters')).id;
}

export async function createWorryLettersInFirestore(params: {
  db: Firestore;
  authorUid: string;
  content: string;
  inferredCategories: string[];
  publicationGroupId: string;
  recipients: DeliveryRecipient[];
}): Promise<CreatedWorryLetterMetadata[]> {
  const batch = writeBatch(params.db);
  const createdLetters: CreatedWorryLetterMetadata[] = [];

  for (const recipient of params.recipients) {
    const letterRef = doc(collection(params.db, 'letters'));

    batch.set(letterRef, {
      senderId: params.authorUid,
      receiverId: recipient.uid,
      originalContent: params.content,
      refinedContent: params.content,
      type: 'worry',
      categories: params.inferredCategories,
      category: params.inferredCategories[0],
      publicationGroupId: params.publicationGroupId,
      matchOverlapCount: recipient.matchOverlapCount,
      matchSelectionType: recipient.matchSelectionType,
      matchCategoriesSnapshot: [...recipient.matchCategoriesSnapshot],
      createdAt: serverTimestamp(),
      isRead: false,
    });

    createdLetters.push({
      id: letterRef.id,
      receiverId: recipient.uid,
      publicationGroupId: params.publicationGroupId,
      matchOverlapCount: recipient.matchOverlapCount,
      matchSelectionType: recipient.matchSelectionType,
      matchCategoriesSnapshot: [...recipient.matchCategoriesSnapshot],
    });
  }

  await batch.commit();
  return createdLetters;
}
