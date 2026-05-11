import type { Firestore } from 'firebase/firestore';
import { createReplyPublicationAdapters } from './adapters';
import { publishPublisherComment } from './publishPublisherComment';
import { publishReply } from './publishReply';

type PublishReplyUseCase = typeof publishReply;
type PublishPublisherCommentUseCase = typeof publishPublisherComment;

type PublishReplyProductionParams = Omit<Parameters<PublishReplyUseCase>[0], 'adapters'>;
type PublishPublisherCommentProductionParams = Omit<
  Parameters<PublishPublisherCommentUseCase>[0],
  'adapters'
>;

export function createProductionReplyPublisher(options: {
  db: Firestore;
  publishReplyUseCase?: PublishReplyUseCase;
  publishPublisherCommentUseCase?: PublishPublisherCommentUseCase;
}) {
  const {
    db,
    publishReplyUseCase = publishReply,
    publishPublisherCommentUseCase = publishPublisherComment,
  } = options;
  const adapters = createReplyPublicationAdapters(db);

  return {
    publishReplyWithProductionAdapters: (params: PublishReplyProductionParams) =>
      publishReplyUseCase({ ...params, adapters }),
    publishPublisherCommentWithProductionAdapters: (
      params: PublishPublisherCommentProductionParams,
    ) => publishPublisherCommentUseCase({ ...params, adapters }),
  };
}
