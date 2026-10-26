import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitMiddleware } from '../../src/common/http/rate-limit.middleware.js';

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

describe('RateLimitMiddleware', () => {
  it('returns a non-cacheable 429 with retry guidance after the configured limit', () => {
    const middleware = new RateLimitMiddleware(
      new ConfigService({ RATE_LIMIT_TTL_MS: 60_000, RATE_LIMIT_MAX: 1 }),
    );
    const request = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    let nextCalls = 0;
    const next: NextFunction = () => {
      nextCalls += 1;
    };

    middleware.use(request, createResponse().response, next);
    const limited = createResponse();
    middleware.use(request, limited.response, next);

    expect(nextCalls).toBe(1);
    expect(limited.state.statusCode).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.state.body).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      correlationId: 'rate-limit-test',
    });
  });
});
