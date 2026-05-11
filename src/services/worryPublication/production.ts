import { db } from '../../firebase';
import { createProductionWorryPublisher } from './productionFactory';

export const publishWorryWithProductionAdapters = createProductionWorryPublisher({ db });
