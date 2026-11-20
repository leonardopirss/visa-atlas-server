import { MetricType, PopulationBasis, type DataStatus, type Prisma } from '@prisma/client';
import type {
  DerivationOperand,
  MetricDerivation,
  SourceRef,
  Statistic,
} from '../../../common/contracts/public-api.types.js';

export const OBSERVATION_INCLUDE = {
  release: { include: { dataset: { include: { organization: true } } } },
  derivationResult: {
    include: { operands: { include: { observation: true } } },
  },
} satisfies Prisma.MetricObservationInclude;

export interface ObservationView {
  metricType: MetricType;
  populationBasis: PopulationBasis;
  populationKey: string;
  programKey: string;
  citizenshipIso3: string | null;
  value: bigint | null;
  dataStatus: DataStatus;
  unit: string;
  period: string;
  comparisonGroupId: string;
  approximate: boolean;
  roundingIncrement: number | null;
  precision: number | null;
  release: {
    id: string;
    fetchedAt: Date;
    publishedAt: Date | null;
    dataset: {
      code: string;
      url: string;
      methodologyUrl: string | null;
      organization: { name: string };
    };
  };
  derivationResult?: {
    formula: 'APPROVAL_RATE' | 'REFUSAL_RATE';
    precision: number;
    operands: Array<{
      role: 'NUMERATOR_COMPONENT' | 'DENOMINATOR_COMPONENT';
      coefficient: number;
      observation: {
        id: string;
        metricType: MetricType;
        value: bigint | null;
        unit: string;
        period: string;
        releaseId: string;
        comparisonGroupId: string;
        sourceCategoryCode: string;
      };
    }>;
  } | null;
}

export function presentSource(observation: ObservationView): SourceRef {
  return {
    organization: observation.release.dataset.organization.name,
    datasetCode: observation.release.dataset.code,
    releaseId: observation.release.id,
    url: observation.release.dataset.url,
    methodologyUrl: observation.release.dataset.methodologyUrl,
    fetchedAt: observation.release.fetchedAt.toISOString(),
    publishedAt: observation.release.publishedAt?.toISOString() ?? null,
  };
}

export function presentStatistic(observation: ObservationView): Statistic {
  const statistic: Statistic = {
    metricType: observation.metricType,
    value: presentInteger(observation.value),
    dataStatus: observation.dataStatus,
    freshness: 'CURRENT',
    unit: observation.unit,
    period: observation.period,
    comparisonGroupId: observation.comparisonGroupId,
    source: presentSource(observation),
    populationScope:
      observation.populationBasis === PopulationBasis.NATIONAL
        ? {
            basis: PopulationBasis.NATIONAL,
            populationKey: 'ALL',
            programKey: observation.programKey,
            label: `População nacional · ${observation.programKey}`,
          }
        : {
            basis: PopulationBasis.CITIZENSHIP,
            populationKey: observation.populationKey,
            citizenshipIso3: observation.citizenshipIso3 ?? observation.populationKey,
            programKey: observation.programKey,
            label: `Cidadania ${observation.populationKey} · ${observation.programKey}`,
          },
  };
  const derivation = presentDerivation(observation.derivationResult);
  if (derivation !== undefined) statistic.derivation = derivation;
  if (
    observation.approximate ||
    observation.roundingIncrement !== null ||
    observation.precision !== null
  ) {
    statistic.measurement = {
      approximate: observation.approximate,
      roundingIncrement: observation.roundingIncrement,
      precision: observation.precision,
    };
  }
  return statistic;
}

export function presentAggregateStatistic(observations: readonly ObservationView[]): Statistic {
  const first = observations[0];
  if (!first) throw new RangeError('Cannot present an empty observation aggregate');
  if (
    observations.length > 1 &&
    observations.some(
      ({ metricType }) =>
        metricType === MetricType.APPROVAL_RATE || metricType === MetricType.REFUSAL_RATE,
    )
  ) {
    throw new RangeError('Derived rates cannot be additively aggregated');
  }
  const hasSuppressed = observations.some((observation) => observation.dataStatus === 'SUPPRESSED');
  const hasUnavailable = observations.some((observation) => observation.value === null);
  const value = hasUnavailable
    ? null
    : observations.reduce((total, observation) => total + (observation.value ?? 0n), 0n);
  const dataStatus = hasSuppressed
    ? 'SUPPRESSED'
    : hasUnavailable
      ? 'UNAVAILABLE'
      : observations.some((observation) => observation.dataStatus === 'ESTIMATED')
        ? 'ESTIMATED'
        : observations.some((observation) => observation.dataStatus === 'REVISED')
          ? 'REVISED'
          : 'AVAILABLE';
  return presentStatistic({ ...first, value, dataStatus });
}

function presentInteger(value: bigint | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new RangeError('Statistic exceeds the JSON safe integer range');
  }
  return numeric;
}

function presentDerivation(
  derivation: ObservationView['derivationResult'],
): MetricDerivation | undefined {
  if (derivation === null || derivation === undefined) return undefined;
  if (derivation.precision !== 2) {
    throw new RangeError('Unsupported derivation precision');
  }
  const operands = derivation.operands.map(({ observation, coefficient, role }) => ({
    role,
    operand: presentOperand(observation, coefficient),
  }));
  return {
    formula: derivation.formula,
    numerator: operands
      .filter(({ role }) => role === 'NUMERATOR_COMPONENT')
      .map(({ operand }) => operand),
    denominator: operands
      .filter(({ role }) => role === 'DENOMINATOR_COMPONENT')
      .map(({ operand }) => operand),
    precision: 2,
  };
}

function presentOperand(
  observation: NonNullable<ObservationView['derivationResult']>['operands'][number]['observation'],
  coefficient: number,
): DerivationOperand {
  const value = presentInteger(observation.value);
  if (value === null || observation.unit !== 'COUNT' || coefficient !== 1) {
    throw new RangeError('Invalid derivation operand');
  }
  return {
    observationId: observation.id,
    metricType: observation.metricType,
    value,
    unit: 'COUNT',
    period: observation.period,
    releaseId: observation.releaseId,
    comparisonGroupId: observation.comparisonGroupId,
    sourceCategoryCode: observation.sourceCategoryCode,
    coefficient: 1,
  };
}
