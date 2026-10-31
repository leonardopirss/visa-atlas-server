import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { QueryConcurrencyService } from '../../src/common/database/query-concurrency.service.js';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter.js';

@Controller('capacity')
class CapacityController {
  private releaseHeldQuery: (() => void) | undefined;
  private markStarted: (() => void) | undefined;
  readonly started = new Promise<void>((resolve) => (this.markStarted = resolve));

  constructor(private readonly concurrency: QueryConcurrencyService) {}

  @Get('hold')
  hold(): Promise<{ ok: true }> {
    return this.concurrency.run(
      () =>
        new Promise((resolve) => {
          this.markStarted?.();
          this.releaseHeldQuery = () => resolve({ ok: true });
        }),
    );
  }

  @Get('fast')
  fast(): Promise<{ ok: true }> {
    return this.concurrency.run(() => Promise.resolve({ ok: true }));
  }

  @Get('pool-timeout')
  poolTimeout(): never {
    throw Object.assign(new Error('sensitive pool details'), { code: 'P2024' });
  }

  release(): void {
    this.releaseHeldQuery?.();
  }
}

@Module({
  controllers: [CapacityController],
  providers: [
    QueryConcurrencyService,
    {
      provide: ConfigService,
      useValue: new ConfigService({
        DATABASE_QUERY_CONCURRENCY: 1,
        DATABASE_QUERY_QUEUE_MAX: 1,
        DATABASE_QUERY_QUEUE_TIMEOUT_MS: 30,
      }),
    },
  ],
})
class BackpressureTestModule {}

describe('database backpressure integration', () => {
  let app: INestApplication;
  let controller: CapacityController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BackpressureTestModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((_request: Request, response: Response, next: NextFunction) => {
      response.locals.correlationId = 'database-backpressure-test';
      next();
    });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    controller = app.get(CapacityController);
  });

  afterAll(async () => app.close());

  it('returns a sanitized 503 after bounded queue wait and recovers', async () => {
    const heldRequest = request(app.getHttpServer()).get('/capacity/hold');
    const heldPromise = heldRequest.then((response) => response);
    await controller.started;

    const saturated = await request(app.getHttpServer()).get('/capacity/fast').expect(503);
    expect(saturated.headers['cache-control']).toBe('no-store');
    expect(saturated.body).toEqual({
      code: 'DATABASE_CAPACITY_EXCEEDED',
      message: 'Service temporarily unavailable',
      correlationId: 'database-backpressure-test',
    });

    controller.release();
    await expect(heldPromise).resolves.toMatchObject({ status: 200, body: { ok: true } });
    await request(app.getHttpServer()).get('/capacity/fast').expect(200, { ok: true });
  });

  it('maps Prisma pool acquisition timeout without leaking details', async () => {
    const response = await request(app.getHttpServer()).get('/capacity/pool-timeout').expect(503);
    expect(response.body).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Service temporarily unavailable',
      correlationId: 'database-backpressure-test',
    });
    expect(response.text).not.toContain('sensitive');
  });
});
