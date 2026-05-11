import { db } from '../../firebase';
import { createProductionReplyPublisher } from './productionFactory';

export const {
  publishReplyWithProductionAdapters,
  publishPublisherCommentWithProductionAdapters,
} = createProductionReplyPublisher({ db });
