import type { Firestore } from 'firebase/firestore';
import { createPublicationFollowUpRunner } from './followUp';
import { publishWorry } from './publishWorry';
import type { PublishWorryResult } from './types';
import {
  createFirestorePublicationGroupId,
  createWorryLettersInFirestore,
  fetchActiveHumansFromFirestore,
} from './adapters/firestore';
import {
  moderateWorryViaHttp,
  notifyNewWorryViaHttp,
  scheduleBotReplyViaHttp,
} from './adapters/http';
import { createFisherYatesShuffle } from './adapters/random';

export function createProductionWorryPublisher(options: {
  db: Firestore;
  now?: () => Date;
  random?: () => number;
  publish?: typeof publishWorry;
}): (params: { authorUid: string; content: string }) => Promise<PublishWorryResult> {
  const {
    db,
    now = () => new Date(),
    random = Math.random,
    publish = publishWorry,
  } = options;

  return params =>
    publish({
      ...params,
      adapters: {
        moderateWorry: moderateWorryViaHttp,
        fetchActiveHumans: ({ activeSince, limit }) =>
          fetchActiveHumansFromFirestore({
            db,
            activeSince,
            limitCount: limit,
          }),
        createPublicationGroupId: () => createFirestorePublicationGroupId(db),
        createWorryLetters: letterParams => createWorryLettersInFirestore({ db, ...letterParams }),
        runPublicationFollowUps: createPublicationFollowUpRunner({
          scheduleBotReply: scheduleBotReplyViaHttp,
          notifyNewWorry: notifyNewWorryViaHttp,
        }),
        now,
        shuffle: createFisherYatesShuffle(random),
      },
    });
}
