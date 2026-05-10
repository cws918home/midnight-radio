import type { Shuffle } from '../policy/recipientSelection';

export const createFisherYatesShuffle = (random: () => number): Shuffle => {
  return <T>(items: T[]) => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
};
