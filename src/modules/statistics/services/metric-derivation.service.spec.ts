import { DataStatus, MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';
import { MetricDerivationService } from './metric-derivation.service.js';

type DecisionOperand = Parameters<MetricDerivationService['deriveRate']>[0]['numerator'][number];

const service = new MetricDerivationService();

function operand(
  metricType: MetricType,
  value: bigint | null,
  overrides: Partial<DecisionOperand> = {},
): DecisionOperand {
  return {
    id: `${metricType.toLowerCase()}-${String(value)}`,
    releaseId: 'release-vis-d02-2025',
    datasetId: 'uk-home-office-vis-d02',
    destinationIso3: 'GBR',
    populationBasis: PopulationBasis.CITIZENSHIP,
    populationKey: 'BRA',
    programKey: 'Skilled Worker',
    citizenshipIso3: 'BRA',
    purposeCode: VisaPurposeCode.WORK,
    metricType,
    sourceCategoryCode: 'Worker:Skilled Worker',
    period: '2025',
    unit: 'COUNT',
    value,
    dataStatus: DataStatus.AVAILABLE,
    methodologyVersion: 'vis-d02-v1',
    completePeriod: true,
    estimated: false,
    ...overrides,
  };
}

function approval(granted: bigint | null = 3n, refused: bigint | null = 1n) {
  const grantedOperand = operand(MetricType.DECISIONS_GRANTED, granted);
  const refusedOperand = operand(MetricType.DECISIONS_REFUSED, refused);
  return {
    formula: MetricType.APPROVAL_RATE,
    numerator: [grantedOperand],
    denominator: [grantedOperand, refusedOperand],
  } as const;
}

function refusal(granted: bigint | null = 3n, refused: bigint | null = 1n) {
  const grantedOperand = operand(MetricType.DECISIONS_GRANTED, granted);
  const refusedOperand = operand(MetricType.DECISIONS_REFUSED, refused);
  return {
    formula: MetricType.REFUSAL_RATE,
    numerator: [refusedOperand],
    denominator: [grantedOperand, refusedOperand],
  } as const;
}

describe('MetricDerivationService', () => {
  it.each([
    ['approval', approval(), 7_500n, MetricType.APPROVAL_RATE],
    ['refusal', refusal(), 2_500n, MetricType.REFUSAL_RATE],
  ] as const)(
    'derives %s in integer basis points with auditable operands',
    (_label, input, expectedValue, expectedMetricType) => {
      expect(service.deriveRate(input)).toEqual({
        metricType: expectedMetricType,
        value: expectedValue,
        unit: 'BASIS_POINTS',
        precision: 2,
        dataStatus: DataStatus.AVAILABLE,
        formula: expectedMetricType,
        numerator: input.numerator,
        denominator: input.denominator,
      });
    },
  );

  it('preserves a confirmed zero numerator instead of treating it as absence', () => {
    expect(service.deriveRate(approval(0n, 25n))).toMatchObject({
      value: 0n,
      dataStatus: DataStatus.AVAILABLE,
    });
  });

  it('aggregates a reviewed set of visa categories before calculating the rate', () => {
    const skilledGranted = operand(MetricType.DECISIONS_GRANTED, 3n);
    const skilledRefused = operand(MetricType.DECISIONS_REFUSED, 1n);
    const temporaryGranted = operand(MetricType.DECISIONS_GRANTED, 2n, {
      sourceCategoryCode: 'Worker:Temporary Worker',
    });
    const temporaryRefused = operand(MetricType.DECISIONS_REFUSED, 4n, {
      sourceCategoryCode: 'Worker:Temporary Worker',
    });

    expect(
      service.deriveRate({
        formula: MetricType.APPROVAL_RATE,
        numerator: [skilledGranted, temporaryGranted],
        denominator: [skilledGranted, skilledRefused, temporaryGranted, temporaryRefused],
      }),
    ).toMatchObject({ value: 5_000n, unit: 'BASIS_POINTS' });
  });

  it.each([
    ['zero denominator', approval(0n, 0n), 'DERIVATION_DENOMINATOR_NOT_POSITIVE'],
    ['null denominator component', approval(10n, null), 'DERIVATION_OPERAND_VALUE_UNAVAILABLE'],
    [
      'suppressed component',
      {
        ...approval(),
        denominator: [
          approval().denominator[0],
          operand(MetricType.DECISIONS_REFUSED, null, { dataStatus: DataStatus.SUPPRESSED }),
        ],
      },
      'DERIVATION_OPERAND_VALUE_UNAVAILABLE',
    ],
    [
      'estimated component',
      {
        ...approval(),
        denominator: [
          approval().denominator[0],
          operand(MetricType.DECISIONS_REFUSED, 1n, { estimated: true }),
        ],
      },
      'DERIVATION_ESTIMATED_OPERAND',
    ],
  ] as const)('rejects %s', (_label, input, code) => {
    expect(() => service.deriveRate(input)).toThrow(code);
  });

  it('rejects a numerator greater than the aggregated denominator', () => {
    const numerator = operand(MetricType.DECISIONS_GRANTED, 101n);
    const denominator = operand(MetricType.DECISIONS_REFUSED, 100n);
    expect(() =>
      service.deriveRate({
        formula: MetricType.APPROVAL_RATE,
        numerator: [numerator],
        denominator: [denominator],
      }),
    ).toThrow('DERIVATION_NUMERATOR_EXCEEDS_DENOMINATOR');
  });

  it.each([
    ['release', { releaseId: 'other-release' }],
    ['dataset', { datasetId: 'other-dataset' }],
    ['destination', { destinationIso3: 'CAN' }],
    ['population basis', { populationBasis: PopulationBasis.NATIONAL }],
    ['population key', { populationKey: 'ALL' }],
    ['program', { programKey: 'Global Talent' }],
    ['citizenship', { citizenshipIso3: 'ARG' }],
    ['purpose', { purposeCode: VisaPurposeCode.STUDY }],
    ['source category set', { sourceCategoryCode: 'Worker:Temporary Worker' }],
    ['period', { period: '2024' }],
    ['unit', { unit: 'APPLICATIONS' }],
    ['methodology', { methodologyVersion: 'vis-d02-v2' }],
  ] as const)('rejects incompatible %s dimensions', (_label, overrides) => {
    const input = approval();
    const incompatible = operand(MetricType.DECISIONS_REFUSED, 1n, overrides);
    expect(() =>
      service.deriveRate({ ...input, denominator: [input.denominator[0], incompatible] }),
    ).toThrow('DERIVATION_INCOMPATIBLE_DIMENSIONS');
  });

  it('rejects an incomplete annual period', () => {
    const input = approval();
    const incomplete = operand(MetricType.DECISIONS_REFUSED, 1n, {
      completePeriod: false,
    });
    expect(() =>
      service.deriveRate({ ...input, denominator: [input.denominator[0], incomplete] }),
    ).toThrow('DERIVATION_INCOMPLETE_PERIOD');
  });

  it.each([
    [1n, 32n, 313n],
    [1n, 40n, 250n],
    [31n, 32n, 9_688n],
  ] as const)(
    'rounds half up deterministically for %s/%s without floating point',
    (numeratorValue, denominatorValue, expected) => {
      const numerator = operand(MetricType.DECISIONS_GRANTED, numeratorValue);
      const remainder = operand(MetricType.DECISIONS_REFUSED, denominatorValue - numeratorValue);
      expect(
        service.deriveRate({
          formula: MetricType.APPROVAL_RATE,
          numerator: [numerator],
          denominator: [numerator, remainder],
        }).value,
      ).toBe(expected);
    },
  );

  it('propagates REVISED when any compatible operand is revised', () => {
    const input = refusal();
    const revised = operand(MetricType.DECISIONS_GRANTED, 3n, {
      dataStatus: DataStatus.REVISED,
    });
    expect(
      service.deriveRate({ ...input, denominator: [revised, input.denominator[1]] }),
    ).toMatchObject({ dataStatus: DataStatus.REVISED });
  });
});
