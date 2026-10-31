export const REDIS_CLIENT_FACTORY = Symbol('REDIS_CLIENT_FACTORY');

export type RedisLifecycleEvent = 'connect' | 'ready' | 'reconnecting' | 'end' | 'error';

export interface RedisClientFactoryOptions {
  readonly url: string;
  readonly keyPrefix: string;
  readonly connectTimeoutMs: number;
  readonly disableOfflineQueue: true;
  readonly reconnectStrategy: (retries: number) => number | false;
}

export interface RedisClientPort {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<void>;
  close(): Promise<void>;
  destroy(): void;
  on(event: RedisLifecycleEvent, listener: (error?: unknown) => void): void;
  ping(signal: AbortSignal): Promise<string>;
  get(key: string, signal: AbortSignal): Promise<string | null>;
  setWithTtl(
    key: string,
    value: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<string | null>;
  eval(
    script: string,
    keys: readonly string[],
    args: readonly string[],
    signal: AbortSignal,
  ): Promise<unknown>;
}

export type RedisClientFactory = (options: RedisClientFactoryOptions) => RedisClientPort;

export type RedisServiceStatus =
  | 'disabled'
  | 'connecting'
  | 'ready'
  | 'degraded'
  | 'circuit-open'
  | 'disconnected';

export type RedisOperationResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'disabled' | 'unavailable' | 'timeout' | 'circuit-open' };
