import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

interface RateWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly windows = new Map<string, RateWindow>();

  constructor(private readonly config: ConfigService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const now = Date.now();
    const ttl = this.config.get<number>('RATE_LIMIT_TTL_MS', 60_000);
    const limit = this.config.get<number>('RATE_LIMIT_MAX', 120);
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const current = this.windows.get(key);
    const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + ttl } : current;
    window.count += 1;
    this.windows.set(key, window);
    response.setHeader('RateLimit-Limit', limit);
    response.setHeader('RateLimit-Remaining', Math.max(0, limit - window.count));
    response.setHeader('RateLimit-Reset', Math.ceil(window.resetAt / 1000));
    if (window.count > limit) {
      response.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        correlationId: String(response.locals.correlationId ?? 'unknown'),
      });
      return;
    }
    this.pruneExpired(now);
    next();
  }

  private pruneExpired(now: number): void {
    if (this.windows.size < 1_000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
