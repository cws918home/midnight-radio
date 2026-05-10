import type { DeliveryRecipient } from '../../../../packages/domain/src';
import type { ModerationResult } from '../types';

export async function moderateWorryViaHttp(content: string): Promise<ModerationResult> {
  const response = await fetch('/api/process-worry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`process-worry HTTP ${response.status}`);
  }

  return await response.json();
}

export async function scheduleBotReplyViaHttp(params: {
  worryId: string;
  worryContent: string;
  authorUid: string;
  botInfo: DeliveryRecipient;
}) {
  const response = await fetch('/api/schedule-bot-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      worryId: params.worryId,
      worryContent: params.worryContent,
      receiverId: params.authorUid,
      botInfo: params.botInfo,
    }),
  });

  if (!response.ok) {
    throw new Error(`schedule-bot-reply HTTP ${response.status}`);
  }
}

export async function notifyNewWorryViaHttp(params: { receiverUids: string[] }) {
  const response = await fetch('/api/notify-new-worry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverUids: params.receiverUids }),
  });

  if (!response.ok) {
    throw new Error(`notify-new-worry HTTP ${response.status}`);
  }
}
