import { Module } from '@nestjs/common';
import { CacheControlInterceptor } from './cache-control.interceptor.js';
import { CloudflareOriginLockMiddleware } from './cloudflare-origin-lock.middleware.js';
import { RateLimitMiddleware } from './rate-limit.middleware.js';
import { RateLimitPolicyRegistry } from './rate-limit.policy.js';
import { RATE_LIMIT_STORE, RedisRateLimitStore } from './redis-rate-limit.store.js';

@Module({
  providers: [
    CacheControlInterceptor,
    CloudflareOriginLockMiddleware,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    RedisRateLimitStore,
    { provide: RATE_LIMIT_STORE, useExisting: RedisRateLimitStore },
  ],
  exports: [
    CacheControlInterceptor,
    CloudflareOriginLockMiddleware,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    RATE_LIMIT_STORE,
  ],
})
export class HttpModule {}
