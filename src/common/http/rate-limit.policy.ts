import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export type RateLimitMode = 'observe' | 'enforce' | 'fallback';

export interface RateLimitPolicy {
  readonly name: 'global' | 'heavy' | 'daily';
  readonly limit: number;
  readonly windowMs: number;
  readonly burst: number;
}

@Injectable()
export class RateLimitPolicyRegistry {
  readonly enabled: boolean;
  readonly mode: RateLimitMode;
  private readonly globalPolicy: RateLimitPolicy;
  private readonly heavyPolicy: RateLimitPolicy;
  private readonly dailyPolicy: RateLimitPolicy;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('RATE_LIMIT_ENABLED', false);
    this.mode = config.get<RateLimitMode>('RATE_LIMIT_MODE', 'observe');
    const globalWindowMs = config.get<number>('RATE_LIMIT_TTL_MS', 60_000);
    const globalLimit = config.get<number>('RATE_LIMIT_MAX', 120);
    const heavyLimit = config.get<number>('RATE_LIMIT_HEAVY_MAX', 60);
    const dailyLimit = config.get<number>('RATE_LIMIT_DAILY_MAX', 1_000);
    this.globalPolicy = {
      name: 'global',
      limit: globalLimit,
      windowMs: globalWindowMs,
      burst: globalLimit,
    };
    this.heavyPolicy = {
      name: 'heavy',
      limit: heavyLimit,
      windowMs: 60_000,
      burst: heavyLimit,
    };
    this.dailyPolicy = {
      name: 'daily',
      limit: dailyLimit,
      windowMs: 86_400_000,
      burst: dailyLimit,
    };
  }

  forRequest(request: Request): readonly RateLimitPolicy[] {
    const path = request.path || request.originalUrl.split('?', 1)[0] || '';
    return this.isHeavy(path)
      ? [this.globalPolicy, this.heavyPolicy, this.dailyPolicy]
      : [this.globalPolicy, this.dailyPolicy];
  }

  headerPolicy(request: Request): RateLimitPolicy {
    return this.isHeavy(request.path || request.originalUrl.split('?', 1)[0] || '')
      ? this.heavyPolicy
      : this.globalPolicy;
  }

  private isHeavy(path: string): boolean {
    const normalized = path.replace(/^\/api\/v1/, '');
    return (
      normalized === '/stats/map' ||
      /^\/countries\/[A-Za-z]{3}(?:\/timeseries)?\/?$/.test(normalized)
    );
  }
}
