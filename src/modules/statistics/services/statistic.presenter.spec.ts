import { DataStatus, MetricType, PopulationBasis } from '@prisma/client';
import {
  presentAggregateStatistic,
  presentStatistic,
  type ObservationView,
} from './statistic.presenter.js';

function observation(overrides: Partial<ObservationView> = {}): ObservationView {
  return {
    metricType: MetricType.DECISIONS_GRANTED,
    populationBasis: PopulationBasis.CITIZENSHIP,
    populationKey: 'BRA',
    programKey: 'uk-entry-clearance:work',
    citizenshipIso3: 'BRA',
    value: 75n,
    dataStatus: DataStatus.AVAILABLE,
    unit: 'COUNT',
    period: '2025',
    comparisonGroupId: 'group-decisions-2025',
    approximate: false,
    roundingIncrement: null,
    precision: null,
    release: {
      id: 'release-vis-d02-2025',
      fetchedAt: new Date('2026-11-17T00:00:00.000Z'),
      publishedAt: new Date('2026-11-10T00:00:00.000Z'),
      dataset: {
        code: 'Vis_D02',
        url: 'https://example.test/vis-d02',
        methodologyUrl: 'https://example.test/vis-d02-methodology',
        organization: { name: 'UK Home Office' },
      },
    },
    derivationResult: null,
    ...overrides,
  };
}

function operand(
  metricType: MetricType,
  value: bigint,
  role: 'NUMERATOR_COMPONENT' | 'DENOMINATOR_COMPONENT',
) {
  return {
    role,
    coefficient: 1,
    observation: {
      id: `${role}-${metricType}`,
      metricType,
      value,
      unit: 'COUNT',
      period: '2025',
      releaseId: 'release-vis-d02-2025',
      comparisonGroupId: `group-${metricType}`,
      sourceCategoryCode: 'Worker:Skilled Worker',
    },
  } as const;
}

describe('statistic presenter: visa decision insights', () => {
  it('presents an explicit citizenship and program scope without legacy-field loss', () => {
    expect(presentStatistic(observation())).toMatchObject({
      metricType: MetricType.DECISIONS_GRANTED,
      value: 75,
      populationScope: {
        basis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        citizenshipIso3: 'BRA',
        programKey: 'uk-entry-clearance:work',
        label: 'Cidadania BRA · uk-entry-clearance:work',
      },
      source: {
        organization: 'UK Home Office',
        datasetCode: 'Vis_D02',
        releaseId: 'release-vis-d02-2025',
        fetchedAt: '2026-11-17T00:00:00.000Z',
        publishedAt: '2026-11-10T00:00:00.000Z',
      },
    });
  });

  it('presents national scope without inventing a citizenship and preserves measurement metadata', () => {
    const presented = presentStatistic(
      observation({
        metricType: MetricType.PENDING_APPLICATIONS,
        populationBasis: PopulationBasis.NATIONAL,
        populationKey: 'ALL',
        programKey: 'uk:work',
        citizenshipIso3: null,
        approximate: true,
        roundingIncrement: 5,
        precision: 0,
      }),
    );

    expect(presented.populationScope).toEqual({
      basis: PopulationBasis.NATIONAL,
      populationKey: 'ALL',
      programKey: 'uk:work',
      label: 'População nacional · uk:work',
    });
    expect(presented.populationScope).not.toHaveProperty('citizenshipIso3');
    expect(presented.measurement).toEqual({
      approximate: true,
      roundingIncrement: 5,
      precision: 0,
    });
  });

  it('serializes formula and auditable numerator/denominator operands', () => {
    const grantedNumerator = operand(
      MetricType.DECISIONS_GRANTED,
      3n,
      'NUMERATOR_COMPONENT',
    );
    const grantedDenominator = operand(
      MetricType.DECISIONS_GRANTED,
      3n,
      'DENOMINATOR_COMPONENT',
    );
    const refusedDenominator = operand(
      MetricType.DECISIONS_REFUSED,
      1n,
      'DENOMINATOR_COMPONENT',
    );

    expect(
      presentStatistic(
        observation({
          metricType: MetricType.APPROVAL_RATE,
          value: 7_500n,
          unit: 'BASIS_POINTS',
          precision: 2,
          derivationResult: {
            formula: 'APPROVAL_RATE',
            precision: 2,
            operands: [grantedNumerator, grantedDenominator, refusedDenominator],
          },
        }),
      ),
    ).toMatchObject({
      value: 7_500,
      measurement: { approximate: false, roundingIncrement: null, precision: 2 },
      derivation: {
        formula: 'APPROVAL_RATE',
        precision: 2,
        numerator: [
          {
            observationId: 'NUMERATOR_COMPONENT-DECISIONS_GRANTED',
            metricType: MetricType.DECISIONS_GRANTED,
            value: 3,
            unit: 'COUNT',
            coefficient: 1,
          },
        ],
        denominator: [
          expect.objectContaining({
            observationId: 'DENOMINATOR_COMPONENT-DECISIONS_GRANTED',
            value: 3,
          }),
          expect.objectContaining({
            observationId: 'DENOMINATOR_COMPONENT-DECISIONS_REFUSED',
            value: 1,
          }),
        ],
      },
    });
  });

  it('rejects malformed derivation operands instead of emitting unauditable metadata', () => {
    const invalid = operand(
      MetricType.DECISIONS_GRANTED,
      3n,
      'NUMERATOR_COMPONENT',
    );
    expect(() =>
      presentStatistic(
        observation({
          metricType: MetricType.APPROVAL_RATE,
          unit: 'BASIS_POINTS',
          derivationResult: {
            formula: 'APPROVAL_RATE',
            precision: 2,
            operands: [{ ...invalid, coefficient: 2 }],
          },
        }),
      ),
    ).toThrow('Invalid derivation operand');
  });

  it('never additively aggregates a derived rate, regardless of its array position', () => {
    const count = observation({ metricType: MetricType.DECISIONS_GRANTED, value: 1n });
    const rate = observation({
      metricType: MetricType.APPROVAL_RATE,
      value: 5_000n,
      unit: 'BASIS_POINTS',
    });

    expect(() => presentAggregateStatistic([rate, rate])).toThrow(
      'Derived rates cannot be additively aggregated',
    );
    expect(() => presentAggregateStatistic([count, rate])).toThrow(
      'Derived rates cannot be additively aggregated',
    );
  });
});
