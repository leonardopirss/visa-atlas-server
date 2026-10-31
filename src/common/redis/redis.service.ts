import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REDIS_CLIENT_FACTORY,
  type RedisClientFactory,
  type RedisClientPort,
  type RedisOperationResult,
  type RedisServiceStatus,
} from './redis.types.js';

class RedisCommandTimeoutError extends Error {}
class RedisConnectTimeoutError extends Error {}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly enabled: boolean;
  private readonly connectTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitResetMs: number;
  private client: RedisClientPort | null = null;
  private currentStatus: RedisServiceStatus;
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT_FACTORY) private readonly clientFactory: RedisClientFactory,
  ) {
    this.enabled = this.config.get<boolean>('REDIS_ENABLED', false);
    this.connectTimeoutMs = this.config.get<number>('REDIS_CONNECT_TIMEOUT_MS', 1_000);
    this.commandTimeoutMs = this.config.get<number>('REDIS_COMMAND_TIMEOUT_MS', 250);
    this.circuitFailureThreshold = this.config.get<number>('REDIS_CIRCUIT_FAILURE_THRESHOLD', 5);
    this.circuitResetMs = this.config.get<number>('REDIS_CIRCUIT_RESET_MS', 10_000);
    this.currentStatus = this.enabled ? 'disconnected' : 'disabled';
  }

  get status(): RedisServiceStatus {
    return this.currentStatus;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    const url = this.config.get<string | null>('REDIS_URL', null);
    if (!url) {
      this.currentStatus = 'degraded';
      this.logFailure('redis.configuration_missing', 'ConfigurationError');
      return;
    }
    const reconnectMaxDelayMs = this.config.get<number>('REDIS_RECONNECT_MAX_DELAY_MS', 1_000);
    const reconnectMaxAttempts = this.config.get<number>('REDIS_RECONNECT_MAX_ATTEMPTS', 3);
    const prefix = this.config.get<string>('REDIS_KEY_PREFIX', 'visa-atlas:development');
    this.client = this.clientFactory({
      url,
      keyPrefix: `${prefix}:`,
      connectTimeoutMs: this.connectTimeoutMs,
      disableOfflineQueue: true,
      reconnectStrategy: (retries) => {
        if (retries >= reconnectMaxAttempts) return false;
        const exponentialDelay = Math.min(50 * 2 ** retries, reconnectMaxDelayMs);
        return Math.floor(Math.random() * (exponentialDelay + 1));
      },
    });
    this.attachLifecycleLogging(this.client);
    this.currentStatus = 'connecting';
    const startedAt = performance.now();
    try {
      await this.client.connect();
      this.recordSuccess();
      this.logger.log({
        event: 'redis.connected',
        durationMs: this.elapsedMilliseconds(startedAt),
      });
    } catch (error: unknown) {
      this.recordFailure();
      this.logFailure(
        'redis.connection_failed',
        this.errorKind(error),
        undefined,
        this.elapsedMilliseconds(startedAt),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) {
      this.currentStatus = this.enabled ? 'disconnected' : 'disabled';
      return;
    }
    this.shuttingDown = true;
    this.currentStatus = 'disconnected';
    try {
      if (client.isOpen) await client.close();
      else client.destroy();
    } catch (error: unknown) {
      client.destroy();
      this.logFailure('redis.shutdown_failed', this.errorKind(error));
    } finally {
      this.currentStatus = 'disconnected';
      this.shuttingDown = false;
    }
  }

  ping(): Promise<RedisOperationResult<string>> {
    return this.execute('ping', (client, signal) => client.ping(signal));
  }

  get(key: string): Promise<RedisOperationResult<string | null>> {
    return this.execute('get', (client, signal) => client.get(key, signal));
  }

  set(key: string, value: string, ttlMs: number): Promise<RedisOperationResult<string | null>> {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      return Promise.resolve({ status: 'unavailable' });
    }
    return this.execute('set', (client, signal) => client.setWithTtl(key, value, ttlMs, signal));
  }

  eval(
    script: string,
    keys: readonly string[],
    args: readonly string[],
  ): Promise<RedisOperationResult<unknown>> {
    return this.execute('eval', (client, signal) => client.eval(script, keys, args, signal));
  }

  private async execute<T>(
    operation: string,
    command: (client: RedisClientPort, signal: AbortSignal) => Promise<T>,
  ): Promise<RedisOperationResult<T>> {
    if (!this.enabled) return { status: 'disabled' };
    const client = this.client;
    if (!client) return { status: 'unavailable' };
    if (!this.mayProbeCircuit()) return { status: 'circuit-open' };
    if (!(await this.ensureClientReady(client))) {
      this.recordFailure();
      this.logFailure('redis.command_failed', 'ClientNotReady', operation);
      return { status: 'unavailable' };
    }
    const startedAt = performance.now();
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new RedisCommandTimeoutError());
      }, this.commandTimeoutMs);
    });
    try {
      const value = await Promise.race([command(client, controller.signal), timeoutPromise]);
      this.recordSuccess();
      this.logger.debug({
        event: 'redis.command_succeeded',
        operation,
        durationMs: this.elapsedMilliseconds(startedAt),
      });
      return { status: 'ok', value };
    } catch (error: unknown) {
      this.recordFailure();
      const timedOut = error instanceof RedisCommandTimeoutError;
      this.logFailure(
        'redis.command_failed',
        timedOut ? 'CommandTimeout' : this.errorKind(error),
        operation,
        this.elapsedMilliseconds(startedAt),
      );
      return { status: timedOut ? 'timeout' : 'unavailable' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async ensureClientReady(client: RedisClientPort): Promise<boolean> {
    if (client.isReady) return true;
    if (client.isOpen) return false;
    const startedAt = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        client.destroy();
        reject(new RedisConnectTimeoutError());
      }, this.connectTimeoutMs);
    });
    try {
      await Promise.race([client.connect(), timeoutPromise]);
      this.logger.log({
        event: 'redis.reconnected',
        durationMs: this.elapsedMilliseconds(startedAt),
      });
      return client.isReady;
    } catch (error: unknown) {
      this.logFailure(
        'redis.reconnect_failed',
        error instanceof RedisConnectTimeoutError ? 'ConnectTimeout' : this.errorKind(error),
        undefined,
        this.elapsedMilliseconds(startedAt),
      );
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private mayProbeCircuit(): boolean {
    if (this.circuitOpenedAt === null) return true;
    if (Date.now() - this.circuitOpenedAt < this.circuitResetMs) return false;
    this.currentStatus = 'degraded';
    this.logger.warn({ event: 'redis.circuit_half_open' });
    return true;
  }

  private recordSuccess(): void {
    const closedCircuit = this.circuitOpenedAt !== null;
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = null;
    this.currentStatus = 'ready';
    if (closedCircuit) this.logger.log({ event: 'redis.circuit_closed' });
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailureThreshold) {
      const openedNow = this.circuitOpenedAt === null;
      this.circuitOpenedAt = Date.now();
      this.currentStatus = 'circuit-open';
      if (openedNow) {
        this.logger.warn({
          event: 'redis.circuit_opened',
          failures: this.consecutiveFailures,
          resetAfterMs: this.circuitResetMs,
        });
      }
      return;
    }
    this.currentStatus = 'degraded';
  }

  private attachLifecycleLogging(client: RedisClientPort): void {
    client.on('error', (error) => this.logFailure('redis.client_error', this.errorKind(error)));
    client.on('reconnecting', () => {
      this.currentStatus = 'connecting';
      this.logger.warn({ event: 'redis.reconnecting' });
    });
    client.on('ready', () => {
      this.recordSuccess();
      this.logger.log({ event: 'redis.ready' });
    });
    client.on('end', () => {
      if (this.shuttingDown) return;
      this.currentStatus = 'degraded';
      this.logger.warn({ event: 'redis.disconnected' });
    });
  }

  private errorKind(error: unknown): string {
    return error instanceof Error && error.name ? error.name : 'UnknownError';
  }

  private elapsedMilliseconds(startedAt: number): number {
    return Number((performance.now() - startedAt).toFixed(3));
  }

  private logFailure(
    event: string,
    errorKind: string,
    operation?: string,
    durationMs?: number,
  ): void {
    this.logger.warn({
      event,
      errorKind,
      ...(operation ? { operation } : {}),
      ...(durationMs === undefined ? {} : { durationMs }),
    });
  }
}
