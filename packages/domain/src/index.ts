export type MatchSelectionType = 'matched' | 'random_fallback' | 'ai' | 'ai_safety_fallback';

export interface HumanProfile {
  uid: string;
  gender: string;
  interests: string[];
}

export interface DeliveryRecipient extends HumanProfile {
  matchOverlapCount: number;
  matchSelectionType: MatchSelectionType;
  matchCategoriesSnapshot: string[];
}

export interface CreatedWorryLetterMetadata {
  id: string;
  receiverId: string;
  publicationGroupId: string;
  matchOverlapCount: number;
  matchSelectionType: MatchSelectionType;
  matchCategoriesSnapshot: string[];
}
