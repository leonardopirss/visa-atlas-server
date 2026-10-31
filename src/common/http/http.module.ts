import { Module } from '@nestjs/common';
import { CacheControlInterceptor } from './cache-control.interceptor.js';
import { RateLimitMiddleware } from './rate-limit.middleware.js';
import { RateLimitPolicyRegistry } from './rate-limit.policy.js';
import { RATE_LIMIT_STORE, RedisRateLimitStore } from './redis-rate-limit.store.js';

@Module({
  providers: [
    CacheControlInterceptor,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    RedisRateLimitStore,
    { provide: RATE_LIMIT_STORE, useExisting: RedisRateLimitStore },
  ],
  exports: [
    CacheControlInterceptor,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    RATE_LIMIT_STORE,
  ],
})
export class HttpModule {}
