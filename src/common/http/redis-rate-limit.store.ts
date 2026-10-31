import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import type { RateLimitPolicy } from './rate-limit.policy.js';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtMs: number;
  readonly retryAfterMs: number;
  readonly policy: RateLimitPolicy['name'];
}

export type RateLimitStoreResult =
  | { readonly status: 'ok'; readonly decision: RateLimitDecision }
  | { readonly status: 'fallback' };

export interface RateLimitStore {
  consume(identity: string, policies: readonly RateLimitPolicy[]): Promise<RateLimitStoreResult>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

const GCRA_SCRIPT = `
local nowParts = redis.call('TIME')
local now = (tonumber(nowParts[1]) * 1000) + math.floor(tonumber(nowParts[2]) / 1000)
local allowed = 1
local selected = 1
local selectedRemaining = 2147483647
local selectedRetry = 0
local selectedReset = now

for index = 1, #KEYS do
  local offset = (index - 1) * 4
  local interval = tonumber(ARGV[offset + 1])
  local burst = tonumber(ARGV[offset + 2])
  local ttl = tonumber(ARGV[offset + 3])
  local limit = tonumber(ARGV[offset + 4])
  local tat = tonumber(redis.call('GET', KEYS[index])) or now
  local burstOffset = interval * (burst - 1)
  local allowAt = tat - burstOffset
  local retry = math.max(0, allowAt - now)
  local policyAllowed = retry == 0
  local nextTat = math.max(tat, now) + interval
  local remaining = math.max(0, math.min(limit - 1, math.floor((now + burstOffset - nextTat) / interval) + 1))
  local reset = math.max(now, nextTat)

  if not policyAllowed then
    allowed = 0
    remaining = 0
  end
  if remaining < selectedRemaining or (remaining == selectedRemaining and retry > selectedRetry) then
    selected = index
    selectedRemaining = remaining
    selectedRetry = retry
    selectedReset = reset
  end
end

if allowed == 1 then
  for index = 1, #KEYS do
    local offset = (index - 1) * 4
    local interval = tonumber(ARGV[offset + 1])
    local ttl = tonumber(ARGV[offset + 3])
    local tat = tonumber(redis.call('GET', KEYS[index])) or now
    local nextTat = math.max(tat, now) + interval
    redis.call('SET', KEYS[index], nextTat, 'PX', ttl)
  end
end

return {allowed, selected, selectedRemaining, selectedReset, selectedRetry}
`;

@Injectable()
export class RedisRateLimitStore implements RateLimitStore {
  private readonly secret: string | null;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.secret = config.get<string | null>('RATE_LIMIT_IDENTITY_SECRET', null);
  }

  async consume(
    identity: string,
    policies: readonly RateLimitPolicy[],
  ): Promise<RateLimitStoreResult> {
    if (!this.secret || policies.length === 0) return { status: 'fallback' };
    const identityHash = createHmac('sha256', this.secret)
      .update(normalizeClientIdentity(identity))
      .digest('hex')
      .slice(0, 32);
    const keys = policies.map((policy) => `ratelimit:v1:${policy.name}:${identityHash}`);
    const args = policies.flatMap((policy) => {
      const intervalMs = Math.max(1, Math.ceil(policy.windowMs / policy.limit));
      const ttlMs = policy.windowMs + Math.max(1_000, intervalMs);
      return [String(intervalMs), String(policy.burst), String(ttlMs), String(policy.limit)];
    });
    const result = await this.redis.eval(GCRA_SCRIPT, keys, args);
    if (result.status !== 'ok') return { status: 'fallback' };
    const values = this.parseResult(result.value);
    if (!values) return { status: 'fallback' };
    const policy = policies[values.selectedIndex];
    if (!policy) return { status: 'fallback' };
    return {
      status: 'ok',
      decision: {
        allowed: values.allowed,
        limit: policy.limit,
        remaining: values.remaining,
        resetAtMs: values.resetAtMs,
        retryAfterMs: values.retryAfterMs,
        policy: policy.name,
      },
    };
  }

  private parseResult(value: unknown): {
    allowed: boolean;
    selectedIndex: number;
    remaining: number;
    resetAtMs: number;
    retryAfterMs: number;
  } | null {
    if (!Array.isArray(value) || value.length !== 5) return null;
    const numbers = value.map(Number);
    if (numbers.some((item) => !Number.isFinite(item))) return null;
    const [allowed, selected, remaining, resetAtMs, retryAfterMs] = numbers;
    if (
      allowed === undefined ||
      selected === undefined ||
      remaining === undefined ||
      resetAtMs === undefined ||
      retryAfterMs === undefined
    ) {
      return null;
    }
    return {
      allowed: allowed === 1,
      selectedIndex: selected - 1,
      remaining: Math.max(0, Math.floor(remaining)),
      resetAtMs: Math.max(0, Math.floor(resetAtMs)),
      retryAfterMs: Math.max(0, Math.floor(retryAfterMs)),
    };
  }
}

export function normalizeClientIdentity(identity: string): string {
  const withoutZone = identity.trim().toLowerCase().split('%', 1)[0] ?? '';
  const ipv4Mapped = withoutZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  const candidate = ipv4Mapped ?? withoutZone;
  const version = isIP(candidate);
  if (version === 0) return 'unknown';
  if (version === 4) return candidate;
  return new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
}

export { GCRA_SCRIPT };
