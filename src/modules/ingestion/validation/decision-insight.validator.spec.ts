import { DataStatus, MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { DecisionInsightValidator } from './decision-insight.validator.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

const RAW_DECISION_EVENTS = [
  MetricType.DECISIONS_GRANTED,
  MetricType.DECISIONS_REFUSED,
  MetricType.DECISIONS_WITHDRAWN,
  MetricType.DECISIONS_LAPSED,
] as const;

function observation(overrides: Partial<StagedObservation> = {}): StagedObservation {
  return {
    destinationIso3: 'GBR',
    citizenshipIso3: 'BRA',
    populationBasis: PopulationBasis.CITIZENSHIP,
    populationKey: 'BRA',
    programKey: 'uk-vis-d02:worker',
    purpose: VisaPurposeCode.WORK,
    metricType: MetricType.DECISIONS_GRANTED,
    sourceCategoryCode: 'Worker:Skilled Worker',
    sourceCategoryLabel: 'Worker — Skilled Worker',
    period: '2025',
    unit: 'COUNT',
    value: 125n,
    dataStatus: DataStatus.AVAILABLE,
    methodologyVersion: 'vis-d02-v1',
    ...overrides,
  };
}

function expectReason(candidate: StagedObservation, reason: string): void {
  const validator = new DecisionInsightValidator();
  try {
    validator.validate([candidate]);
    throw new Error(`Expected validation to fail with ${reason}`);
  } catch (error) {
    expect(error).toBeInstanceOf(IngestionValidationError);
    expect((error as IngestionValidationError).reason).toBe(reason);
  }
}

describe('DecisionInsightValidator', () => {
  const validator = new DecisionInsightValidator();

  it.each(RAW_DECISION_EVENTS)('accepts the admitted raw decision event %s', (metricType) => {
    expect(() => validator.validate([observation({ metricType })])).not.toThrow();
  });

  it.each([
    MetricType.APPROVAL_RATE,
    MetricType.REFUSAL_RATE,
    MetricType.APPLICATIONS_RECEIVED,
    MetricType.WORK_VISAS_ISSUED,
    MetricType.PENDING_APPLICATIONS,
  ])('rejects %s as a raw Vis_D02 event', (metricType) => {
    expectReason(observation({ metricType }), 'DECISION_EVENT_INVALID');
  });

  it.each([
    {
      name: 'national aggregate',
      change: {
        populationBasis: PopulationBasis.NATIONAL,
        populationKey: 'ALL',
        citizenshipIso3: null,
      },
    },
    {
      name: 'a citizenship other than Brazil',
      change: { populationKey: 'ARG', citizenshipIso3: 'ARG' },
    },
    {
      name: 'a population key different from citizenship',
      change: { populationKey: 'ALL' },
    },
  ])('rejects $name for the admitted Brazil population', ({ change }) => {
    expectReason(observation(change), 'DECISION_POPULATION_INVALID');
  });

  it('requires raw outcomes to use COUNT', () => {
    expectReason(observation({ unit: 'VISAS' }), 'DECISION_UNIT_INVALID');
  });

  it.each(['2025 Q4', '2025-12', '25', ''])('rejects the non-annual period %p', (period) => {
    expectReason(observation({ period }), 'DECISION_PERIOD_INVALID');
  });

  it('accepts revised operands so revision can propagate to a derived rate', () => {
    expect(() =>
      validator.validate([observation({ dataStatus: DataStatus.REVISED })]),
    ).not.toThrow();
  });

  it.each([
    { dataStatus: DataStatus.SUPPRESSED, value: null },
    { dataStatus: DataStatus.UNAVAILABLE, value: null },
    { dataStatus: DataStatus.ESTIMATED, value: 125n },
  ])('rejects a non-deterministic operand with status $dataStatus', (change) => {
    expectReason(observation(change), 'DECISION_STATUS_INVALID');
  });

  it('rejects an available event without an integer count', () => {
    expectReason(observation({ value: null }), 'DECISION_STATUS_INVALID');
  });

  it.each(['', ' ', 'Skilled Worker', 'Worker:', ':Skilled Worker'])(
    'rejects the source category %p when the reviewed visa type is not preserved',
    (sourceCategoryCode) => {
      expectReason(observation({ sourceCategoryCode }), 'DECISION_SOURCE_CATEGORY_INVALID');
    },
  );

  it('preserves one reviewed source category across every outcome event', () => {
    expect(() =>
      validator.validate(RAW_DECISION_EVENTS.map((metricType) => observation({ metricType }))),
    ).not.toThrow();
  });
});
