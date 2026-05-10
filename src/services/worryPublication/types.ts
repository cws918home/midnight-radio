import type {
  CreatedWorryLetterMetadata,
  DeliveryRecipient,
  HumanProfile,
} from '@midnight-radio/domain';
import type { Shuffle } from './policy/recipientSelection';

export type ModerationResult =
  | { status: 'approved'; categories: string[] }
  | { status: 'rejected'; reason: string };

export type PublishWorryResult =
  | {
      status: 'published';
      recipients: DeliveryRecipient[];
      createdLetters: CreatedWorryLetterMetadata[];
      publicationGroupId: string;
      warnings: string[];
    }
  | { status: 'rejected'; reason: string }
  | { status: 'failed'; stage: PublishWorryFailureStage; reason: string };

export type PublishWorryFailureStage =
  | 'moderation'
  | 'recipient_selection'
  | 'letter_creation';

export interface WorryPublicationAdapters {
  moderateWorry(content: string): Promise<ModerationResult>;
  fetchActiveHumans(params: {
    authorUid: string;
    activeSince: Date;
    limit: number;
  }): Promise<HumanProfile[]>;
  createPublicationGroupId(): string;
  createWorryLetters(params: {
    authorUid: string;
    content: string;
    inferredCategories: string[];
    publicationGroupId: string;
    recipients: DeliveryRecipient[];
  }): Promise<CreatedWorryLetterMetadata[]>;
  scheduleBotReply(params: {
    worryId: string;
    worryContent: string;
    authorUid: string;
    botInfo: DeliveryRecipient;
  }): Promise<void>;
  notifyNewWorry(params: {
    receiverUids: string[];
  }): Promise<void>;
  now(): Date;
  shuffle: Shuffle;
}
