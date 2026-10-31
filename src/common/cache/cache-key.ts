import { createHash } from 'node:crypto';

export interface CacheKeyInput {
  readonly environment: string;
  readonly contractVersion: string;
  readonly route: string;
  readonly releaseVersion: string;
  readonly query: unknown;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalizeCacheQuery(query: unknown): string {
  return JSON.stringify(canonicalValue(query));
}

function hash(value: string, length = 32): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function boundedSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');
  return normalized.length > 0 && normalized.length <= 48 ? normalized : hash(value, 16);
}

export function createCacheKey(input: CacheKeyInput): string {
  const queryHash = hash(canonicalizeCacheQuery(input.query));
  const releaseHash = hash(input.releaseVersion, 16);
  return [
    'cache',
    boundedSegment(input.environment),
    boundedSegment(input.contractVersion),
    boundedSegment(input.route),
    releaseHash,
    queryHash,
  ].join(':');
}
