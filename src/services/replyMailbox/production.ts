import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type {
  ReplyMailboxAdapter,
  ReplyMailboxLetter,
  ReplyMailboxNotification,
  ReplyMailboxSnapshot,
} from './types';

const toMailboxSnapshot = <Reply extends ReplyMailboxLetter>(
  snapshot: QuerySnapshot<DocumentData>
): ReplyMailboxSnapshot<Reply> => ({
  replies: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reply)),
  changes: snapshot.docChanges().map(change => ({
    type: change.type,
    reply: { id: change.doc.id, ...change.doc.data() } as Reply,
  })),
});

const deliverBrowserNotification = (notification: ReplyMailboxNotification) => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(notification.title, notification.options);
    });
    return;
  }

  new Notification(notification.title, notification.options);
};

export function createProductionReplyMailboxAdapter<Reply extends ReplyMailboxLetter>(
  firestore: Firestore
): ReplyMailboxAdapter<Reply> {
  return {
    subscribeToInboxReplies(uid, handleSnapshot) {
      const inboxQuery = query(
        collection(firestore, 'letters'),
        where('type', '==', 'reply'),
        where('receiverId', '==', uid),
        orderBy('createdAt', 'desc')
      );

      return onSnapshot(inboxQuery, snapshot => {
        handleSnapshot(toMailboxSnapshot<Reply>(snapshot));
      });
    },
    subscribeToGivenReplies(uid, handleSnapshot) {
      const givenQuery = query(
        collection(firestore, 'letters'),
        where('type', '==', 'reply'),
        where('senderId', '==', uid),
        orderBy('createdAt', 'desc')
      );

      return onSnapshot(givenQuery, snapshot => {
        handleSnapshot(toMailboxSnapshot<Reply>(snapshot));
      });
    },
    markReplyRead(replyId) {
      return updateDoc(doc(firestore, 'letters', replyId), { isRead: true });
    },
    getNotificationPermission() {
      return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    },
    deliverNotification: deliverBrowserNotification,
  };
}

export const productionReplyMailboxAdapter = createProductionReplyMailboxAdapter(db);
