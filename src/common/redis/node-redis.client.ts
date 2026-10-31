import { createClient } from 'redis';
import type {
  RedisClientFactory,
  RedisClientFactoryOptions,
  RedisClientPort,
  RedisLifecycleEvent,
} from './redis.types.js';

class NodeRedisClient implements RedisClientPort {
  private readonly client;

  constructor(options: RedisClientFactoryOptions) {
    this.client = createClient({
      url: options.url,
      keyPrefix: options.keyPrefix,
      disableOfflineQueue: options.disableOfflineQueue,
      socket: {
        connectTimeout: options.connectTimeoutMs,
        reconnectStrategy: options.reconnectStrategy,
      },
    });
  }

  get isOpen(): boolean {
    return this.client.isOpen;
  }

  get isReady(): boolean {
    return this.client.isReady;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  close(): Promise<void> {
    return this.client.close();
  }

  destroy(): void {
    this.client.destroy();
  }

  on(event: RedisLifecycleEvent, listener: (error?: unknown) => void): void {
    if (event === 'error') {
      this.client.on('error', (error) => listener(error));
      return;
    }
    this.client.on(event, () => listener());
  }

  ping(signal: AbortSignal): Promise<string> {
    return this.client.withAbortSignal(signal).ping();
  }

  get(key: string, signal: AbortSignal): Promise<string | null> {
    return this.client.withAbortSignal(signal).get(key);
  }

  setWithTtl(
    key: string,
    value: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<string | null> {
    return this.client
      .withAbortSignal(signal)
      .set(key, value, { expiration: { type: 'PX', value: ttlMs } });
  }

  eval(
    script: string,
    keys: readonly string[],
    args: readonly string[],
    signal: AbortSignal,
  ): Promise<unknown> {
    return this.client.withAbortSignal(signal).eval(script, {
      keys: [...keys],
      arguments: [...args],
    });
  }
}

export const createNodeRedisClient: RedisClientFactory = (options) => new NodeRedisClient(options);
