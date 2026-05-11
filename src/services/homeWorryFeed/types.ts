export interface HomeWorryFeedProfile {
  uid: string;
}

export interface HomeWorryFeedTimestamp {
  toMillis?: () => number;
}

export interface HomeWorryFeedLetter {
  id: string;
  senderId: string;
  receiverId: string;
  originalContent: string;
  refinedContent: string;
  categories?: string[];
  category?: string;
  createdAt?: HomeWorryFeedTimestamp | null;
}
