import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RATE_LIMIT_STORE, type RateLimitStore } from './redis-rate-limit.store.js';
import { RateLimitPolicyRegistry } from './rate-limit.policy.js';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(
    private readonly policies: RateLimitPolicyRegistry,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    const headerPolicy = this.policies.headerPolicy(request);
    if (!this.policies.enabled || this.policies.mode === 'fallback') {
      this.setHeaders(
        response,
        headerPolicy.limit,
        headerPolicy.limit,
        Date.now() + headerPolicy.windowMs,
      );
      next();
      return;
    }
    const result = await this.store.consume(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      this.policies.forRequest(request),
    );
    if (result.status === 'fallback') {
      this.setHeaders(
        response,
        headerPolicy.limit,
        headerPolicy.limit,
        Date.now() + headerPolicy.windowMs,
      );
      this.logger.warn({ event: 'rate_limit.fallback', mode: this.policies.mode });
      next();
      return;
    }
    const { decision } = result;
    this.setHeaders(response, decision.limit, decision.remaining, decision.resetAtMs);
    if (!decision.allowed && this.policies.mode === 'enforce') {
      response.setHeader('Retry-After', Math.max(1, Math.ceil(decision.retryAfterMs / 1_000)));
      response.setHeader('Cache-Control', 'no-store');
      response.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        correlationId: String(response.locals.correlationId ?? 'unknown'),
      });
      return;
    }
    if (!decision.allowed) {
      this.logger.warn({ event: 'rate_limit.observed', policy: decision.policy });
    }
    next();
  }

  private setHeaders(
    response: Response,
    limit: number,
    remaining: number,
    resetAtMs: number,
  ): void {
    response.setHeader('RateLimit-Limit', limit);
    response.setHeader('RateLimit-Remaining', Math.max(0, remaining));
    response.setHeader('RateLimit-Reset', Math.ceil(resetAtMs / 1_000));
  }
}
