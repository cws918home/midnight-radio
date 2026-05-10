import type { CreatedWorryLetterMetadata, DeliveryRecipient } from '@midnight-radio/domain';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류';

export function createPublicationFollowUpRunner(deps: {
  scheduleBotReply(params: {
    worryId: string;
    worryContent: string;
    authorUid: string;
    botInfo: DeliveryRecipient;
  }): Promise<void>;
  notifyNewWorry(params: { receiverUids: string[] }): Promise<void>;
}): (params: {
  authorUid: string;
  worryContent: string;
  recipients: DeliveryRecipient[];
  createdLetters: CreatedWorryLetterMetadata[];
}) => Promise<string[]> {
  return async params => {
    const warnings: string[] = [];

    for (const letter of params.createdLetters) {
      const recipient = params.recipients.find(({ uid }) => uid === letter.receiverId);
      if (!recipient || !recipient.uid.startsWith('bot_')) continue;

      try {
        await deps.scheduleBotReply({
          worryId: letter.id,
          worryContent: params.worryContent,
          authorUid: params.authorUid,
          botInfo: recipient,
        });
      } catch (error) {
        warnings.push(`bot_scheduling_failed:${recipient.uid}:${getErrorMessage(error)}`);
      }
    }

    try {
      await deps.notifyNewWorry({
        receiverUids: params.recipients.map(({ uid }) => uid),
      });
    } catch (error) {
      warnings.push(`notification_failed:${getErrorMessage(error)}`);
    }

    return warnings;
  };
}
