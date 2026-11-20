import { readFile } from 'node:fs/promises';
import {
  Controller,
  Get,
  type INestApplication,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parse } from 'yaml';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import { CorrelationIdMiddleware } from '../../src/common/errors/correlation-id.middleware.js';
import { RateLimitMiddleware } from '../../src/common/http/rate-limit.middleware.js';
import { RateLimitPolicyRegistry } from '../../src/common/http/rate-limit.policy.js';
import {
  RATE_LIMIT_STORE,
  type RateLimitStore,
} from '../../src/common/http/redis-rate-limit.store.js';
import {
  prisma,
  resetDatabase,
  seedPublishedFixture,
  seedPublishedStudyFixture,
} from '../helpers/database.js';

type ContractSchema = {
  $ref?: string;
  enum?: unknown[];
  items?: ContractSchema;
  nullable?: boolean;
  oneOf?: ContractSchema[];
  properties?: Record<string, ContractSchema>;
  required?: string[];
  type?: unknown;
};

type ContractOperation = {
  parameters?: Array<{ $ref?: string }>;
};

type ContractDocument = {
  components?: {
    parameters?: Record<string, unknown>;
    schemas?: Record<string, ContractSchema>;
  };
  paths?: Record<string, { get?: ContractOperation }>;
};

const LEGACY_METRIC_TYPES = [
  'FIRST_RESIDENCE_PERMITS_GRANTED',
  'WORK_VISAS_ISSUED',
  'APPLICATIONS_RECEIVED',
  'APPLICATIONS_REFUSED',
  'DECISIONS_GRANTED',
  'VALID_PERMIT_HOLDERS',
] as const;

const VISA_INSIGHT_METRIC_TYPES = [
  'DECISIONS_REFUSED',
  'DECISIONS_WITHDRAWN',
  'DECISIONS_LAPSED',
  'APPROVAL_RATE',
  'REFUSAL_RATE',
  'PENDING_APPLICATIONS',
] as const;

async function loadContract(): Promise<ContractDocument> {
  const source = await readFile('contracts/openapi.yaml', 'utf8');
  return parse(source) as ContractDocument;
}

function schemaAllowsNull(schema: ContractSchema | undefined): boolean {
  if (schema === undefined) return false;
  if (schema.nullable === true || schema.type === 'null') return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  return schema.oneOf?.some((candidate) => schemaAllowsNull(candidate)) ?? false;
}

function operationParameterRefs(document: ContractDocument, path: string): string[] {
  return (document.paths?.[path]?.get?.parameters ?? [])
    .map((parameter) => parameter.$ref)
    .filter((reference): reference is string => reference !== undefined);
}

describe('public API contract: defaults, countries and map', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await seedPublishedStudyFixture();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('loads the shared OpenAPI document and keeps exactly five operations', async () => {
    const document = await loadContract();
    expect(Object.keys(document.paths ?? {})).toEqual([
      '/filters/defaults',
      '/countries',
      '/stats/map',
      '/countries/{iso3}',
      '/countries/{iso3}/timeseries',
    ]);
  });

  it('returns defaults only from a published comparable release', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/filters/defaults').expect(200);
    expect(response.body).toEqual({
      citizenship: 'BRA',
      purpose: 'WORK',
      year: 2025,
      metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
      comparisonGroupId: 'test-comparable-2025',
      unit: 'PER',
      dataAvailable: true,
      populationBasis: 'CITIZENSHIP',
      populationKey: 'BRA',
      programKey: 'ALL',
    });
  });

  it('paginates and searches the country catalog', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/countries?search=espanha&page=1&pageSize=10')
      .expect(200);
    expect(response.body).toMatchObject({
      data: [{ iso3: 'ESP', iso2: 'ES', name: 'Espanha', region: 'Europa' }],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['iso2', 'iso3', 'name', 'region']);
  });

  it('returns availability and statistics in one map payload', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/stats/map').expect(200);
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(response.headers['ratelimit-limit']).toBe('120');
    expect(response.body.year).toBe(2025);
    expect(response.body.countries).toHaveLength(3);
    expect(response.body.legendLabel).toContain('não representa vistos consulares');
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'citizenship',
        'countries',
        'legendLabel',
        'populationBasis',
        'programKey',
        'purpose',
        'year',
      ].sort(),
    );
    expect(Object.keys(response.body.countries[0].statistic).sort()).toEqual(
      [
        'comparisonGroupId',
        'dataStatus',
        'freshness',
        'metricType',
        'period',
        'populationScope',
        'source',
        'unit',
        'value',
      ].sort(),
    );
  });

  it('accepts study as a distinct purpose without reusing work observations', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?purpose=STUDY')
      .expect(200);

    expect(response.body).toMatchObject({ purpose: 'STUDY', year: 2025 });
    const countries = response.body.countries as Array<{
      statistic: { value: number | null };
    }>;
    expect(countries.find((country) => country.statistic.value === 24)).toBeDefined();
  });

  it.each(VISA_INSIGHT_METRIC_TYPES)(
    'accepts the visa insight metric type and returns typed absence: %s',
    async (metricType) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/filters/defaults?metricType=${metricType}`)
        .expect(200);

      expect(response.body).toMatchObject({
        citizenship: 'BRA',
        dataAvailable: false,
        metricType,
        populationBasis: 'CITIZENSHIP',
        programKey: 'ALL',
      });
    },
  );

  it('requires an explicit national scope and never labels it as Brazilian', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/filters/defaults?populationBasis=NATIONAL&programKey=ircc:study-permit&metricType=PENDING_APPLICATIONS',
      )
      .expect(200);

    expect(response.body).toMatchObject({
      citizenship: null,
      dataAvailable: false,
      metricType: 'PENDING_APPLICATIONS',
      populationBasis: 'NATIONAL',
      programKey: 'ircc:study-permit',
    });
  });

  it('rejects citizenship combined with an explicit national scope', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/filters/defaults?populationBasis=NATIONAL&citizenship=BRA&programKey=ircc:study-permit',
      )
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown migration purpose', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?purpose=TOURISM')
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('preserves body ordering, status, and cache headers across repeated responses', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/stats/map?purpose=WORK&citizenship=BRA')
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=BRA&purpose=WORK')
      .expect(200);

    expect(repeated.status).toBe(first.status);
    expect(repeated.text).toBe(first.text);
    expect(repeated.headers['content-type']).toBe(first.headers['content-type']);
    expect(repeated.headers['cache-control']).toBe(first.headers['cache-control']);
  });

  it('returns a typed validation error and correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contract-test')
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'contract-test',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    '/api/v1/stats/map?year=2101',
    '/api/v1/countries/ESP/timeseries?fromYear=1899',
    '/api/v1/countries?pageSize=101',
  ])('rejects a query outside the bounded public contract: %s', async (path) => {
    const response = await request(app.getHttpServer()).get(path).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('replaces an unsafe correlation id before reflecting it in headers or errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contains spaces')
      .expect(400);
    expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
  });
});

describe('public OpenAPI contract: visa decision insights', () => {
  it('adds the approved metric types without changing legacy metric names', async () => {
    const document = await loadContract();
    expect(document.components?.schemas?.MetricType?.enum).toEqual([
      ...LEGACY_METRIC_TYPES,
      ...VISA_INSIGHT_METRIC_TYPES,
    ]);
  });

  it('adds population and program parameters to every statistics operation', async () => {
    const document = await loadContract();
    expect(document.components?.parameters).toHaveProperty('PopulationBasis');
    expect(document.components?.parameters).toHaveProperty('ProgramKey');

    for (const path of [
      '/filters/defaults',
      '/stats/map',
      '/countries/{iso3}',
      '/countries/{iso3}/timeseries',
    ]) {
      expect(operationParameterRefs(document, path)).toEqual(
        expect.arrayContaining([
          '#/components/parameters/PopulationBasis',
          '#/components/parameters/ProgramKey',
        ]),
      );
    }
  });

  it('returns resolved scope in envelopes and permits null citizenship only there', async () => {
    const schemas = (await loadContract()).components?.schemas ?? {};

    for (const schemaName of ['FilterDefaults', 'MapStatisticsResponse', 'TimeseriesResponse']) {
      const schema = schemas[schemaName];
      expect(schema?.required).toEqual(
        expect.arrayContaining(['citizenship', 'populationBasis', 'programKey']),
      );
      expect(schema?.properties).toHaveProperty('citizenship');
      expect(schema?.properties).toHaveProperty('populationBasis');
      expect(schema?.properties).toHaveProperty('programKey');
      expect(schemaAllowsNull(schema?.properties?.citizenship)).toBe(true);
    }

    expect(schemaAllowsNull(schemas.CountryDetail?.properties?.country)).toBe(false);
    expect(schemaAllowsNull(schemas.Country?.properties?.iso3)).toBe(false);
    expect(schemas.CitizenshipPopulationScope?.required).toContain('citizenshipIso3');
    expect(schemas.NationalPopulationScope?.properties?.citizenshipIso3).toBeUndefined();
  });

  it('keeps visa insight metadata optional on Statistic for legacy payloads', async () => {
    const statistic = (await loadContract()).components?.schemas?.Statistic;
    expect(statistic?.properties).toHaveProperty('populationScope');
    expect(statistic?.properties).toHaveProperty('derivation');
    expect(statistic?.properties).toHaveProperty('measurement');
    for (const optionalField of ['populationScope', 'derivation', 'measurement']) {
      expect(statistic?.required).not.toContain(optionalField);
    }
  });

  it('keeps requirements and pathways optional on VisaProgram', async () => {
    const visaProgram = (await loadContract()).components?.schemas?.VisaProgram;
    expect(visaProgram?.properties?.requirements).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/VisaProgramRequirement' },
    });
    expect(visaProgram?.properties?.pathways).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/VisaProgramPathway' },
    });
    expect(visaProgram?.required).not.toContain('requirements');
    expect(visaProgram?.required).not.toContain('pathways');
  });
});

@Controller('stats/map')
class RateLimitContractController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

const rejectedStore: RateLimitStore = {
  consume: () =>
    Promise.resolve({
      status: 'ok',
      decision: {
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAtMs: Date.now() + 30_000,
        retryAfterMs: 30_000,
        policy: 'heavy',
      },
    }),
};

@Module({
  controllers: [RateLimitContractController],
  providers: [
    CorrelationIdMiddleware,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    {
      provide: ConfigService,
      useValue: new ConfigService({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MODE: 'enforce',
        RATE_LIMIT_MAX: 120,
        RATE_LIMIT_HEAVY_MAX: 60,
        RATE_LIMIT_DAILY_MAX: 1_000,
      }),
    },
    { provide: RATE_LIMIT_STORE, useValue: rejectedStore },
  ],
})
class RateLimitContractModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RateLimitMiddleware).forRoutes('{*path}');
  }
}

describe('distributed rate limit HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitContractModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('preserves status, body, Retry-After, and RateLimit headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/stats/map')
      .set('x-correlation-id', 'rate-limit-contract')
      .expect(429);

    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'ratelimit-limit': '60',
      'ratelimit-remaining': '0',
      'retry-after': '30',
    });
    expect(Number(response.headers['ratelimit-reset'])).toBeGreaterThan(
      Math.floor(Date.now() / 1_000),
    );
    expect(response.body).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      correlationId: 'rate-limit-contract',
    });
  });
});
