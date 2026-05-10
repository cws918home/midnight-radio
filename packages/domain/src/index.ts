export const WORRY_CATEGORIES = [
  '취업',
  '진로',
  '학업',
  '시험',
  '소득',
  '주거',
  '연애',
  '결혼',
  '부모',
  '자녀',
  '우울',
  '불안',
  '외로움',
  '직장',
  '워라밸',
  '외모',
  '자존감',
  '건강',
  '노후',
  '미래',
  '잡담',
] as const;

export type WorryCategory = (typeof WORRY_CATEGORIES)[number];

export const WORRY_CATEGORY_SET = new Set<string>(WORRY_CATEGORIES);

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
