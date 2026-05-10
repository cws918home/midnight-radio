import {
  normalizeSimpleModeration,
  normalizeWorryModeration,
  type NormalizedSimpleModeration,
  type NormalizedWorryModeration,
} from '../services/moderation/normalize';

type ServerModerationResponse =
  | { statusCode: 200; body: NormalizedWorryModeration | NormalizedSimpleModeration }
  | { statusCode: 502; body: { error: string } };

export type WorryProvider = (content: string, strictRetry?: boolean) => Promise<unknown>;
export type SimpleProvider = (content: string) => Promise<unknown>;

export async function processWorryModerationResponse(
  content: unknown,
  provider: WorryProvider
): Promise<ServerModerationResponse> {
  if (typeof content !== 'string' || !content.trim()) {
    return { statusCode: 200, body: { status: 'rejected', reason: '고민 내용이 비어 있습니다.' } };
  }

  try {
    const firstAttempt = normalizeWorryModeration(await provider(content));
    if (firstAttempt.status === 'approved' || firstAttempt.status === 'rejected') {
      return { statusCode: 200, body: firstAttempt };
    }

    const secondAttempt = normalizeWorryModeration(await provider(content, true));
    if (secondAttempt.status === 'approved' || secondAttempt.status === 'rejected') {
      return { statusCode: 200, body: secondAttempt };
    }

    return { statusCode: 502, body: { error: 'Invalid worry moderation result' } };
  } catch {
    return { statusCode: 502, body: { error: 'Worry moderation provider failure' } };
  }
}

export async function processSimpleModerationResponse(
  content: unknown,
  provider: SimpleProvider
): Promise<ServerModerationResponse> {
  if (typeof content !== 'string') {
    return { statusCode: 502, body: { error: 'Invalid moderation request' } };
  }

  try {
    const result = normalizeSimpleModeration(await provider(content));
    if (result.status === 'approved' || result.status === 'rejected') {
      return { statusCode: 200, body: result };
    }

    return { statusCode: 502, body: { error: 'Invalid moderation result' } };
  } catch {
    return { statusCode: 502, body: { error: 'Moderation provider failure' } };
  }
}
