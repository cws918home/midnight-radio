import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { processComment, processReply } from '../geminiService';
import type {
  CommentNotificationPayload,
  PublisherCommentPayload,
  ReplyLetterPayload,
  ReplyModerationResult,
  ReplyNotificationPayload,
} from './types';

export async function moderateReplyViaHttp(content: string): Promise<ReplyModerationResult> {
  return await processReply(content);
}

export async function moderateCommentViaHttp(content: string): Promise<ReplyModerationResult> {
  return await processComment(content);
}

export async function createReplyLetterInFirestore(params: {
  db: Firestore;
  payload: ReplyLetterPayload;
}) {
  await addDoc(collection(params.db, 'letters'), params.payload);
}

export async function updatePublisherCommentInFirestore(params: {
  db: Firestore;
  payload: PublisherCommentPayload;
}) {
  await updateDoc(doc(params.db, 'letters', params.payload.replyId), {
    publisherComment: params.payload.publisherComment,
  });
}

export async function notifyNewReplyViaHttp(payload: ReplyNotificationPayload) {
  const response = await fetch('/api/notify-new-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`notify-new-reply HTTP ${response.status}`);
  }
}

export async function notifyNewCommentViaHttp(payload: CommentNotificationPayload) {
  const response = await fetch('/api/notify-new-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`notify-new-comment HTTP ${response.status}`);
  }
}

export const createReplyPublicationAdapters = (db: Firestore) => ({
  moderateReply: moderateReplyViaHttp,
  moderateComment: moderateCommentViaHttp,
  createReplyLetter: (payload: ReplyLetterPayload) =>
    createReplyLetterInFirestore({ db, payload }),
  updatePublisherComment: (payload: PublisherCommentPayload) =>
    updatePublisherCommentInFirestore({ db, payload }),
  notifyNewReply: notifyNewReplyViaHttp,
  notifyNewComment: notifyNewCommentViaHttp,
  createdAt: serverTimestamp,
  logNotificationFailure: (error: unknown) => {
    console.error('Notification failed', error);
  },
});
