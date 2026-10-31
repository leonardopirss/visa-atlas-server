import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { RedisService } from '../../src/common/redis/redis.service.js';
import type {
  RedisClientFactory,
  RedisClientFactoryOptions,
  RedisClientPort,
  RedisLifecycleEvent,
} from '../../src/common/redis/redis.types.js';

class FakeRedisClient implements RedisClientPort {
  isOpen = false;
  isReady = false;
  readonly listeners = new Map<RedisLifecycleEvent, Array<(error?: unknown) => void>>();
  connect = jest.fn(() => {
    this.isOpen = true;
    this.isReady = true;
    return Promise.resolve();
  });
  close = jest.fn(() => {
    this.isOpen = false;
    this.isReady = false;
    return Promise.resolve();
  });
  destroy = jest.fn(() => {
    this.isOpen = false;
    this.isReady = false;
  });
  ping = jest.fn(() => Promise.resolve('PONG'));
  get = jest.fn(() => Promise.resolve(null as string | null));
  setWithTtl = jest.fn(() => Promise.resolve('OK'));
  eval = jest.fn((): Promise<unknown> => Promise.resolve(null));

  on(event: RedisLifecycleEvent, listener: (error?: unknown) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }
}

function createEnabledConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return new ConfigService({
    REDIS_ENABLED: true,
    REDIS_URL: 'rediss://user:secret@redis.example.test:6379',
    REDIS_CONNECT_TIMEOUT_MS: 1_000,
    REDIS_COMMAND_TIMEOUT_MS: 20,
    REDIS_KEY_PREFIX: 'visa-atlas:test',
    REDIS_CIRCUIT_FAILURE_THRESHOLD: 2,
    REDIS_CIRCUIT_RESET_MS: 100,
    REDIS_RECONNECT_MAX_DELAY_MS: 1_000,
    REDIS_RECONNECT_MAX_ATTEMPTS: 3,
    ...overrides,
  });
}

function createFactory(client: FakeRedisClient) {
  const captured: RedisClientFactoryOptions[] = [];
  const factory: RedisClientFactory = (options) => {
    captured.push(options);
    return client;
  };
  return { factory, captured };
}

describe('RedisService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not create a client while Redis is disabled', async () => {
    const client = new FakeRedisClient();
    const { factory } = createFactory(client);
    const service = new RedisService(new ConfigService({ REDIS_ENABLED: false }), factory);

    await service.onModuleInit();

    expect(client.connect).not.toHaveBeenCalled();
    await expect(service.ping()).resolves.toEqual({ status: 'disabled' });
    expect(service.status).toBe('disabled');
  });

  it('creates one bounded client and closes it cleanly', async () => {
    const client = new FakeRedisClient();
    const { factory, captured } = createFactory(client);
    const service = new RedisService(createEnabledConfig(), factory);

    await service.onModuleInit();

    expect(captured).toEqual([
      expect.objectContaining({
        url: 'rediss://user:secret@redis.example.test:6379',
        keyPrefix: 'visa-atlas:test:',
        connectTimeoutMs: 1_000,
        disableOfflineQueue: true,
      }),
    ]);
    expect(captured[0]?.reconnectStrategy(0)).toBeGreaterThanOrEqual(0);
    expect(captured[0]?.reconnectStrategy(3)).toBe(false);
    await expect(service.ping()).resolves.toEqual({ status: 'ok', value: 'PONG' });

    await service.onModuleDestroy();

    expect(client.close).toHaveBeenCalledTimes(1);
    expect(service.status).toBe('disconnected');
  });

  it('starts in degraded mode instead of failing the application when connect rejects', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const client = new FakeRedisClient();
    client.connect.mockRejectedValueOnce(
      new Error('rediss://user:secret@redis.example.test is unavailable'),
    );
    const { factory } = createFactory(client);
    const service = new RedisService(createEnabledConfig(), factory);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.status).toBe('degraded');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');

    await expect(service.get('after-reconnect')).resolves.toEqual({ status: 'ok', value: null });
    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(service.status).toBe('ready');
  });

  it('times out commands without waiting for a stalled client', async () => {
    const client = new FakeRedisClient();
    client.ping.mockImplementation(() => new Promise<string>(() => undefined));
    const { factory } = createFactory(client);
    const service = new RedisService(createEnabledConfig({ REDIS_COMMAND_TIMEOUT_MS: 5 }), factory);
    await service.onModuleInit();

    await expect(service.ping()).resolves.toEqual({ status: 'timeout' });
  });

  it('opens and later probes the circuit without logging credentials', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const client = new FakeRedisClient();
    client.get.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED rediss://user:secret@redis.example.test:6379'),
    );
    client.get.mockRejectedValueOnce(new Error('socket failed with secret'));
    client.get.mockResolvedValueOnce('recovered');
    const { factory } = createFactory(client);
    const service = new RedisService(createEnabledConfig(), factory);
    await service.onModuleInit();

    await expect(service.get('key')).resolves.toEqual({ status: 'unavailable' });
    await expect(service.get('key')).resolves.toEqual({ status: 'unavailable' });
    await expect(service.get('key')).resolves.toEqual({ status: 'circuit-open' });
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('rediss://');

    now += 101;
    await expect(service.get('key')).resolves.toEqual({ status: 'ok', value: 'recovered' });
    expect(service.status).toBe('ready');
  });

  it('sanitizes asynchronous client errors', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const client = new FakeRedisClient();
    const { factory } = createFactory(client);
    const service = new RedisService(createEnabledConfig(), factory);
    await service.onModuleInit();

    for (const listener of client.listeners.get('error') ?? []) {
      listener(new Error('rediss://user:secret@redis.example.test'));
    }

    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(warn.mock.calls)).toContain('redis.client_error');
  });
});
