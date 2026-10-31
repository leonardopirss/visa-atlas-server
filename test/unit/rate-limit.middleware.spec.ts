import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitMiddleware } from '../../src/common/http/rate-limit.middleware.js';
import { RateLimitPolicyRegistry } from '../../src/common/http/rate-limit.policy.js';
import type {
  RateLimitDecision,
  RateLimitStore,
  RateLimitStoreResult,
} from '../../src/common/http/redis-rate-limit.store.js';

function createResponse() {
  const headers = new Map<string, string>();
  const state: { statusCode?: number; body?: unknown } = {};
  const response = {
    locals: { correlationId: 'rate-limit-test' },
    setHeader(name: string, value: string | number) {
      headers.set(name.toLowerCase(), String(value));
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  };
  return { response: response as unknown as Response, headers, state };
}

function request(path = '/api/v1/stats/map'): Request {
  return {
    ip: '127.0.0.1',
    path,
    originalUrl: path,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

function decision(overrides: Partial<RateLimitDecision> = {}): RateLimitDecision {
  return {
    allowed: false,
    limit: 60,
    remaining: 0,
    resetAtMs: 1_700_000_060_000,
    retryAfterMs: 60_000,
    policy: 'heavy',
    ...overrides,
  };
}

function createMiddleware(mode: 'observe' | 'enforce' | 'fallback', result: RateLimitStoreResult) {
  const config = new ConfigService({
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_MODE: mode,
    RATE_LIMIT_MAX: 120,
    RATE_LIMIT_HEAVY_MAX: 60,
    RATE_LIMIT_DAILY_MAX: 1_000,
  });
  const consume = jest.fn<RateLimitStore['consume']>();
  consume.mockResolvedValue(result);
  const store: RateLimitStore = { consume };
  return {
    middleware: new RateLimitMiddleware(new RateLimitPolicyRegistry(config), store),
    consume,
  };
}

describe('RateLimitMiddleware', () => {
  it('returns the compatible non-cacheable 429 contract in enforce mode', async () => {
    const { middleware } = createMiddleware('enforce', {
      status: 'ok',
      decision: decision(),
    });
    const limited = createResponse();
    let nextCalls = 0;

    await middleware.use(request(), limited.response, () => {
      nextCalls += 1;
    });

    expect(nextCalls).toBe(0);
    expect(limited.state.statusCode).toBe(429);
    expect(limited.headers.get('ratelimit-limit')).toBe('60');
    expect(limited.headers.get('ratelimit-remaining')).toBe('0');
    expect(limited.headers.get('ratelimit-reset')).toBe('1700000060');
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.state.body).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      correlationId: 'rate-limit-test',
    });
  });

  it('records the same decision but does not reject in observe mode', async () => {
    const { middleware } = createMiddleware('observe', {
      status: 'ok',
      decision: decision(),
    });
    const observed = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware.use(request(), observed.response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(observed.state.statusCode).toBeUndefined();
    expect(observed.headers.get('ratelimit-remaining')).toBe('0');
    expect(observed.headers.has('retry-after')).toBe(false);
  });

  it('fails open with safe headers when Redis is unavailable', async () => {
    const { middleware } = createMiddleware('enforce', { status: 'fallback' });
    const fallback = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware.use(request(), fallback.response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(fallback.state.statusCode).toBeUndefined();
    expect(fallback.headers.get('ratelimit-limit')).toBe('60');
    expect(fallback.headers.get('ratelimit-remaining')).toBe('60');
  });

  it('uses fallback mode as a Redis-free rollback switch', async () => {
    const { middleware, consume } = createMiddleware('fallback', {
      status: 'ok',
      decision: decision(),
    });
    const fallback = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware.use(request('/api/v1/countries'), fallback.response, next);

    expect(consume).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(fallback.headers.get('ratelimit-limit')).toBe('120');
  });
});
