import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';

const ACQUIRE_LOCK_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return 1
end
return 0
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

interface StampedeOptions<T> {
  readonly key: string;
  readonly load: () => Promise<T>;
  readonly readCached: () => Promise<T | undefined>;
}

@Injectable()
export class CacheStampedeService {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly lockTtlMs: number;
  private readonly waitTimeoutMs: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.lockTtlMs = config.get<number>('CACHE_LOCK_TTL_MS', 2_000);
    this.waitTimeoutMs = config.get<number>('CACHE_LOCK_WAIT_MS', 250);
  }

  run<T>(options: StampedeOptions<T>): Promise<T> {
    const current = this.inFlight.get(options.key) as Promise<T> | undefined;
    if (current) return current;

    const flight = this.runDistributed(options).finally(() => {
      if (this.inFlight.get(options.key) === flight) this.inFlight.delete(options.key);
    });
    this.inFlight.set(options.key, flight);
    return flight;
  }

  private async runDistributed<T>(options: StampedeOptions<T>): Promise<T> {
    const lockKey = `lock:${options.key}`;
    const token = randomUUID();
    const acquired = await this.redis.eval(
      ACQUIRE_LOCK_SCRIPT,
      [lockKey],
      [token, this.lockTtlMs.toString()],
    );

    if (acquired.status !== 'ok' || Number(acquired.value) === 1) {
      try {
        const cached = await options.readCached();
        return cached === undefined ? await options.load() : cached;
      } finally {
        if (acquired.status === 'ok') {
          await this.redis.eval(RELEASE_LOCK_SCRIPT, [lockKey], [token]);
        }
      }
    }

    const deadline = Date.now() + this.waitTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(25, this.waitTimeoutMs)));
      const cached = await options.readCached();
      if (cached !== undefined) return cached;
    }

    return options.load();
  }
}
