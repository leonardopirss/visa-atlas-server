import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseCapacityError } from '../errors/domain.error.js';

interface QueueEntry {
  readonly enteredAt: number;
  readonly resolve: () => void;
  readonly reject: (error: DatabaseCapacityError) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

@Injectable()
export class QueryConcurrencyService {
  private readonly logger = new Logger(QueryConcurrencyService.name);
  private readonly concurrency: number;
  private readonly queueMax: number;
  private readonly queueTimeoutMs: number;
  private readonly queue: QueueEntry[] = [];
  private active = 0;

  constructor(config: ConfigService) {
    this.concurrency = config.get<number>('DATABASE_QUERY_CONCURRENCY', 2);
    this.queueMax = config.get<number>('DATABASE_QUERY_QUEUE_MAX', 8);
    this.queueTimeoutMs = config.get<number>('DATABASE_QUERY_QUEUE_TIMEOUT_MS', 250);
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.queueMax) {
      this.logger.warn({ event: 'database.query_rejected', reason: 'queue-full' });
      return Promise.reject(new DatabaseCapacityError());
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        enteredAt: performance.now(),
        resolve,
        reject,
      };
      entry.timeout = setTimeout(() => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        this.logger.warn({
          event: 'database.query_rejected',
          reason: 'queue-timeout',
          waitedMs: Number((performance.now() - entry.enteredAt).toFixed(3)),
        });
        reject(new DatabaseCapacityError());
      }, this.queueTimeoutMs);
      this.queue.push(entry);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (!next) {
      this.active = Math.max(0, this.active - 1);
      return;
    }
    if (next.timeout) clearTimeout(next.timeout);
    this.logger.debug({
      event: 'database.query_dequeued',
      waitedMs: Number((performance.now() - next.enteredAt).toFixed(3)),
    });
    next.resolve();
  }
}
