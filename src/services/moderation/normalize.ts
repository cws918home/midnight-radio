import { WORRY_CATEGORY_SET } from '@midnight-radio/domain';

export type NormalizedWorryModeration =
  | { status: 'approved'; categories: string[] }
  | { status: 'rejected'; reason: string }
  | { status: 'invalid' };

export type NormalizedSimpleModeration =
  | { status: 'approved' }
  | { status: 'rejected'; reason: string }
  | { status: 'invalid' };

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeWorryCategories(rawCategories: unknown): string[] {
  const values = Array.isArray(rawCategories)
    ? rawCategories
    : typeof rawCategories === 'string'
      ? rawCategories.split(',')
      : [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = nonEmptyString(value);
    if (!trimmed || seen.has(trimmed) || !WORRY_CATEGORY_SET.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function normalizeWorryModeration(raw: unknown): NormalizedWorryModeration {
  if (!raw || typeof raw !== 'object') {
    return { status: 'invalid' };
  }

  const result = raw as { status?: unknown; reason?: unknown; categories?: unknown; category?: unknown };

  if (result.status === 'rejected') {
    const reason = nonEmptyString(result.reason);
    return reason ? { status: 'rejected', reason } : { status: 'invalid' };
  }

  if (result.status === 'approved') {
    const rawCategories = result.categories ?? result.category;
    const categories = normalizeWorryCategories(rawCategories);
    return categories.length > 0 ? { status: 'approved', categories } : { status: 'invalid' };
  }

  return { status: 'invalid' };
}

export function normalizeSimpleModeration(raw: unknown): NormalizedSimpleModeration {
  if (!raw || typeof raw !== 'object') {
    return { status: 'invalid' };
  }

  const result = raw as { status?: unknown; reason?: unknown };

  if (result.status === 'approved') {
    return { status: 'approved' };
  }

  if (result.status === 'rejected') {
    const reason = nonEmptyString(result.reason);
    return reason ? { status: 'rejected', reason } : { status: 'invalid' };
  }

  return { status: 'invalid' };
}
