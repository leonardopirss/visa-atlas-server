import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheStampedeService } from './cache-stampede.service.js';
import { createCacheKey } from './cache-key.js';
import { RedisService } from '../redis/redis.service.js';

export type CacheGroup = 'defaults' | 'countries' | 'map' | 'detail' | 'timeseries';

interface CachePolicy {
  readonly ttlSeconds: number;
  readonly maxBytes: number;
}

export type CacheWriteResult = 'stored' | 'disabled' | 'oversize' | 'invalid' | 'unavailable';

const GROUP_TTLS: Readonly<Record<CacheGroup, number>> = {
  defaults: 300,
  countries: 21_600,
  map: 900,
  detail: 900,
  timeseries: 1_800,
};

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly enabled: boolean;
  private readonly environment: string;
  private readonly maxItemBytes: number;
  private readonly jitterPercent: number;

  constructor(
    private readonly redis: RedisService,
    private readonly stampede: CacheStampedeService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('CACHE_ENABLED', false);
    this.environment = config.get<string>('NODE_ENV', 'development');
    this.maxItemBytes = config.get<number>('CACHE_MAX_ITEM_BYTES', 131_072);
    this.jitterPercent = config.get<number>('CACHE_TTL_JITTER_PERCENT', 10);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async getOrLoad<T>(options: {
    readonly group: CacheGroup;
    readonly route: string;
    readonly releaseVersion: string;
    readonly query: unknown;
    readonly load: () => Promise<T>;
  }): Promise<T> {
    if (!this.enabled) {
      this.log('cache.bypass', options.group);
      return options.load();
    }
    const key = createCacheKey({
      environment: this.environment,
      contractVersion: 'v1',
      route: options.route,
      releaseVersion: options.releaseVersion,
      query: options.query,
    });
    const cached = await this.get<T>(key, options.group);
    if (cached !== undefined) return cached;

    return this.stampede.run({
      key,
      readCached: () => this.get<T>(key, options.group),
      load: async () => {
        const value = await options.load();
        await this.set(key, value, this.policy(options.group), options.group);
        return value;
      },
    });
  }

  async get<T>(key: string, group: CacheGroup = 'map'): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    const startedAt = performance.now();
    const result = await this.redis.get(key);
    if (result.status !== 'ok') {
      this.log('cache.error', group, startedAt, { operation: 'get', reason: result.status });
      return undefined;
    }
    if (result.value === null) {
      this.log('cache.miss', group, startedAt);
      return undefined;
    }
    try {
      const value = JSON.parse(result.value) as T;
      this.log('cache.hit', group, startedAt, { bytes: Buffer.byteLength(result.value) });
      return value;
    } catch {
      this.log('cache.error', group, startedAt, { operation: 'parse', reason: 'invalid-json' });
      return undefined;
    }
  }

  async set(
    key: string,
    value: unknown,
    policy: CachePolicy = this.policy('map'),
    group: CacheGroup = 'map',
  ): Promise<CacheWriteResult> {
    if (!this.enabled) return 'disabled';
    if (value instanceof Error || value === undefined) {
      this.log('cache.bypass', group, undefined, { reason: 'invalid-value' });
      return 'invalid';
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      this.log('cache.bypass', group, undefined, { reason: 'serialization-failed' });
      return 'invalid';
    }
    const bytes = Buffer.byteLength(serialized);
    if (bytes > policy.maxBytes) {
      this.log('cache.oversize', group, undefined, { bytes });
      return 'oversize';
    }
    const result = await this.redis.set(key, serialized, this.jitteredTtlMs(policy.ttlSeconds));
    if (result.status !== 'ok' || result.value !== 'OK') {
      this.log('cache.error', group, undefined, { operation: 'set', reason: result.status });
      return 'unavailable';
    }
    this.log('cache.stored', group, undefined, { bytes });
    return 'stored';
  }

  private policy(group: CacheGroup): CachePolicy {
    return {
      ttlSeconds: GROUP_TTLS[group],
      maxBytes: group === 'defaults' ? Math.min(this.maxItemBytes, 16_384) : this.maxItemBytes,
    };
  }

  private jitteredTtlMs(ttlSeconds: number): number {
    const base = ttlSeconds * 1_000;
    const spread = (base * this.jitterPercent) / 100;
    return Math.max(1, Math.round(base - spread + Math.random() * spread * 2));
  }

  private log(
    event: string,
    group: CacheGroup,
    startedAt?: number,
    detail: Readonly<Record<string, unknown>> = {},
  ): void {
    this.logger.debug({
      event,
      group,
      ...(startedAt === undefined
        ? {}
        : { durationMs: Number((performance.now() - startedAt).toFixed(3)) }),
      ...detail,
    });
  }
}
