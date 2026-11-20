import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';

export interface DecisionOperand {
  id: string;
  releaseId: string;
  datasetId: string;
  destinationIso3: string;
  populationBasis: PopulationBasis;
  populationKey: string;
  programKey: string;
  citizenshipIso3: string | null;
  purposeCode: VisaPurposeCode;
  metricType: MetricType;
  sourceCategoryCode: string;
  period: string;
  unit: string;
  value: bigint | null;
  dataStatus: DataStatus;
  methodologyVersion: string;
  completePeriod: boolean;
  estimated: boolean;
}

export interface RateDerivationInput {
  formula: Extract<MetricType, 'APPROVAL_RATE' | 'REFUSAL_RATE'>;
  numerator: readonly DecisionOperand[];
  denominator: readonly DecisionOperand[];
}

export interface DerivedRate {
  metricType: Extract<MetricType, 'APPROVAL_RATE' | 'REFUSAL_RATE'>;
  value: bigint;
  unit: 'BASIS_POINTS';
  precision: 2;
  dataStatus: Extract<DataStatus, 'AVAILABLE' | 'REVISED'>;
  formula: Extract<MetricType, 'APPROVAL_RATE' | 'REFUSAL_RATE'>;
  numerator: readonly DecisionOperand[];
  denominator: readonly DecisionOperand[];
}

@Injectable()
export class MetricDerivationService {
  deriveRate(input: RateDerivationInput): DerivedRate {
    const operands = [...input.numerator, ...input.denominator];
    if (input.numerator.length === 0 || input.denominator.length === 0) {
      throw new Error('DERIVATION_OPERANDS_MISSING');
    }
    this.assertCompatible(operands);
    this.assertUsable(operands);

    const numerator = this.sum(input.numerator);
    const denominator = this.sum(input.denominator);
    if (denominator <= 0n) throw new Error('DERIVATION_DENOMINATOR_NOT_POSITIVE');
    if (numerator > denominator) {
      throw new Error('DERIVATION_NUMERATOR_EXCEEDS_DENOMINATOR');
    }
    this.assertCategoryCoverage(input);

    const scaledNumerator = numerator * 10_000n;
    const value = (scaledNumerator * 2n + denominator) / (denominator * 2n);
    const dataStatus = operands.some(({ dataStatus }) => dataStatus === DataStatus.REVISED)
      ? DataStatus.REVISED
      : DataStatus.AVAILABLE;

    return {
      metricType: input.formula,
      value,
      unit: 'BASIS_POINTS',
      precision: 2,
      dataStatus,
      formula: input.formula,
      numerator: input.numerator,
      denominator: input.denominator,
    };
  }

  private assertCompatible(operands: readonly DecisionOperand[]): void {
    const first = operands[0];
    if (!first) throw new Error('DERIVATION_OPERANDS_MISSING');
    const dimensions = [
      'releaseId',
      'datasetId',
      'destinationIso3',
      'populationBasis',
      'populationKey',
      'programKey',
      'citizenshipIso3',
      'purposeCode',
      'period',
      'unit',
      'methodologyVersion',
    ] as const;
    if (
      operands.some((operand) =>
        dimensions.some((dimension) => operand[dimension] !== first[dimension]),
      )
    ) {
      throw new Error('DERIVATION_INCOMPATIBLE_DIMENSIONS');
    }
    if (operands.some(({ completePeriod }) => !completePeriod)) {
      throw new Error('DERIVATION_INCOMPLETE_PERIOD');
    }
  }

  private assertCategoryCoverage(input: RateDerivationInput): void {
    const expectedNumeratorMetric =
      input.formula === MetricType.APPROVAL_RATE
        ? MetricType.DECISIONS_GRANTED
        : MetricType.DECISIONS_REFUSED;
    if (input.numerator.some(({ metricType }) => metricType !== expectedNumeratorMetric)) {
      throw new Error('DERIVATION_INCOMPATIBLE_DIMENSIONS');
    }
    const numeratorCategories = new Set(
      input.numerator.map(({ sourceCategoryCode }) => sourceCategoryCode),
    );
    const denominatorCategories = new Set(
      input.denominator.map(({ sourceCategoryCode }) => sourceCategoryCode),
    );
    if (
      numeratorCategories.size !== denominatorCategories.size ||
      [...numeratorCategories].some((category) => !denominatorCategories.has(category)) ||
      [...denominatorCategories].some((category) => {
        const categoryOperands = input.denominator.filter(
          ({ sourceCategoryCode }) => sourceCategoryCode === category,
        );
        return (
          categoryOperands.length !== 2 ||
          !categoryOperands.some(({ metricType }) => metricType === MetricType.DECISIONS_GRANTED) ||
          !categoryOperands.some(({ metricType }) => metricType === MetricType.DECISIONS_REFUSED)
        );
      })
    ) {
      throw new Error('DERIVATION_INCOMPATIBLE_DIMENSIONS');
    }
  }

  private assertUsable(operands: readonly DecisionOperand[]): void {
    for (const operand of operands) {
      if (operand.value === null) {
        throw new Error('DERIVATION_OPERAND_VALUE_UNAVAILABLE');
      }
      if (operand.estimated || operand.dataStatus === DataStatus.ESTIMATED) {
        throw new Error('DERIVATION_ESTIMATED_OPERAND');
      }
      if (
        operand.dataStatus !== DataStatus.AVAILABLE &&
        operand.dataStatus !== DataStatus.REVISED
      ) {
        throw new Error('DERIVATION_OPERAND_VALUE_UNAVAILABLE');
      }
      if (operand.value < 0n || operand.unit !== 'COUNT') {
        throw new Error('DERIVATION_OPERAND_INVALID');
      }
    }
  }

  private sum(operands: readonly DecisionOperand[]): bigint {
    return operands.reduce((total, operand) => total + (operand.value ?? 0n), 0n);
  }
}
