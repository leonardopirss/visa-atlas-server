import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  DerivationOperandRole,
  IngestionJobStatus,
  MetricType,
  PopulationBasis,
  type Prisma,
  ReleaseStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service.js';
import { MetricDerivationService } from '../statistics/services/metric-derivation.service.js';
import type { StagedObservation } from './adapters/eurostat/eurostat.types.js';
import { IngestionLogger } from './observability/ingestion-logger.service.js';
import { IngestionValidationError } from './validation/ingestion-validation.error.js';
import { ObservationValidator } from './validation/observation.validator.js';

const INGESTION_TRANSACTION_MAX_WAIT_MS = 5_000;
const INGESTION_TRANSACTION_TIMEOUT_MS = 60_000;

export interface StageReleaseInput {
  datasetId: string;
  rawPayload: string;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
  observations: readonly StagedObservation[];
}

export interface StageReleaseResult {
  releaseId: string;
  duplicate: boolean;
  status: ReleaseStatus;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ObservationValidator,
    private readonly logger: IngestionLogger,
    private readonly metricDerivation: MetricDerivationService = new MetricDerivationService(),
  ) {}

  async stage(input: StageReleaseInput): Promise<StageReleaseResult> {
    const checksum = createHash('sha256').update(input.rawPayload).digest('hex');
    const existing = await this.prisma.datasetRelease.findUnique({
      where: { datasetId_checksum: { datasetId: input.datasetId, checksum } },
    });
    if (existing) return { releaseId: existing.id, duplicate: true, status: existing.status };

    const job = await this.prisma.ingestionJob.create({
      data: {
        sourceDatasetId: input.datasetId,
        startedAt: new Date(),
        status: IngestionJobStatus.RUNNING,
      },
    });
    this.logger.started(job.id, input.datasetId);

    try {
      this.validator.validate(input.observations);
      const observations = this.deduplicate(input.observations);
      const release = await this.prisma.$transaction(
        async (transaction) => {
          const stagedRelease = await transaction.datasetRelease.create({
            data: {
              datasetId: input.datasetId,
              sourcePublishedAt: input.sourcePublishedAt,
              fetchedAt: input.fetchedAt,
              checksum,
              status: ReleaseStatus.STAGING,
            },
          });
          const comparisonGroups = new Map<
            string,
            {
              id: string;
              datasetId: string;
              metricType: StagedObservation['metricType'];
              populationBasis: PopulationBasis;
              populationKey: string;
              programKey: string;
              citizenshipIso3: string | null;
              purposeCode: StagedObservation['purpose'];
              period: string;
              unit: string;
              methodologyVersion: string;
            }
          >();
          const metricObservations = observations.map((observation) => {
            const scope = this.scopeFor(observation);
            const comparisonGroupId = this.comparisonGroupId(input.datasetId, observation);
            comparisonGroups.set(comparisonGroupId, {
              id: comparisonGroupId,
              datasetId: input.datasetId,
              metricType: observation.metricType,
              ...scope,
              citizenshipIso3: observation.citizenshipIso3,
              purposeCode: observation.purpose,
              period: observation.period,
              unit: observation.unit,
              methodologyVersion: observation.methodologyVersion,
            });
            return {
              releaseId: stagedRelease.id,
              destinationIso3: observation.destinationIso3,
              ...scope,
              citizenshipIso3: observation.citizenshipIso3,
              purposeCode: observation.purpose,
              metricType: observation.metricType,
              sourceCategoryCode: observation.sourceCategoryCode,
              sourceCategoryLabel: observation.sourceCategoryLabel,
              period: observation.period,
              unit: observation.unit,
              value: observation.value,
              dataStatus: observation.dataStatus,
              comparisonGroupId,
            };
          });
          await transaction.comparisonGroup.createMany({
            data: [...comparisonGroups.values()],
            skipDuplicates: true,
          });
          await transaction.metricObservation.createMany({ data: metricObservations });
          const derivedObservationCount = await this.deriveDecisionRates(
            transaction,
            stagedRelease.id,
            input.datasetId,
            observations,
          );
          return transaction.datasetRelease.update({
            where: { id: stagedRelease.id },
            data: {
              status: ReleaseStatus.VERIFIED,
              validatedAt: new Date(),
              qualityReport: {
                observationCount: observations.length + derivedObservationCount,
                rawObservationCount: observations.length,
                derivedObservationCount,
                validation: 'passed',
              },
            },
          });
        },
        {
          maxWait: INGESTION_TRANSACTION_MAX_WAIT_MS,
          timeout: INGESTION_TRANSACTION_TIMEOUT_MS,
        },
      );
      await this.prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: IngestionJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          report: {
            releaseId: release.id,
            observationCount:
              typeof release.qualityReport === 'object' &&
              release.qualityReport !== null &&
              'observationCount' in release.qualityReport
                ? release.qualityReport.observationCount
                : observations.length,
          },
        },
      });
      this.logger.completed(job.id, release.id, observations.length);
      return { releaseId: release.id, duplicate: false, status: release.status };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown ingestion failure';
      await this.prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: IngestionJobStatus.FAILED,
          finishedAt: new Date(),
          report: { reason },
        },
      });
      if (error instanceof IngestionValidationError) {
        await this.prisma.datasetRelease.upsert({
          where: { datasetId_checksum: { datasetId: input.datasetId, checksum } },
          create: {
            datasetId: input.datasetId,
            sourcePublishedAt: input.sourcePublishedAt,
            fetchedAt: input.fetchedAt,
            checksum,
            status: ReleaseStatus.REJECTED,
            qualityReport: { reason },
          },
          update: {},
        });
      }
      this.logger.failed(job.id, reason);
      throw error;
    }
  }

  private deduplicate(observations: readonly StagedObservation[]): StagedObservation[] {
    const unique = new Map<string, StagedObservation>();
    for (const observation of observations) {
      const key = [
        observation.destinationIso3,
        ...Object.values(this.scopeFor(observation)),
        observation.purpose,
        observation.metricType,
        observation.sourceCategoryCode,
        observation.period,
        observation.unit,
      ].join('|');
      const existing = unique.get(key);
      if (
        existing &&
        JSON.stringify(existing, this.bigIntReplacer) !==
          JSON.stringify(observation, this.bigIntReplacer)
      ) {
        throw new IngestionValidationError(`CONFLICTING_DUPLICATE:${key}`);
      }
      unique.set(key, observation);
    }
    return [...unique.values()];
  }

  private async deriveDecisionRates(
    transaction: Prisma.TransactionClient,
    releaseId: string,
    datasetId: string,
    staged: readonly StagedObservation[],
  ): Promise<number> {
    const rawMetricTypes = [
      MetricType.DECISIONS_GRANTED,
      MetricType.DECISIONS_REFUSED,
      MetricType.DECISIONS_WITHDRAWN,
      MetricType.DECISIONS_LAPSED,
    ] as const;
    const decisionInputs = staged.filter(({ metricType }) =>
      rawMetricTypes.includes(metricType as (typeof rawMetricTypes)[number]),
    );
    if (decisionInputs.length === 0) return 0;

    const persisted = await transaction.metricObservation.findMany({
      where: { releaseId, metricType: { in: [...rawMetricTypes] } },
      include: { comparisonGroup: true },
    });
    const groups = new Map<string, typeof persisted>();
    for (const observation of persisted) {
      const key = [
        observation.destinationIso3,
        observation.populationBasis,
        observation.populationKey,
        observation.programKey,
        observation.citizenshipIso3 ?? '',
        observation.purposeCode,
        observation.period,
        observation.unit,
        observation.comparisonGroup.methodologyVersion,
      ].join('|');
      const group = groups.get(key) ?? [];
      group.push(observation);
      groups.set(key, group);
    }

    let derivedObservationCount = 0;
    for (const observations of groups.values()) {
      const granted = observations.filter(
        ({ metricType }) => metricType === MetricType.DECISIONS_GRANTED,
      );
      const refused = observations.filter(
        ({ metricType }) => metricType === MetricType.DECISIONS_REFUSED,
      );
      const categories = new Set(observations.map(({ sourceCategoryCode }) => sourceCategoryCode));
      if (
        granted.length !== categories.size ||
        refused.length !== categories.size ||
        [...categories].some(
          (category) =>
            !granted.some(({ sourceCategoryCode }) => sourceCategoryCode === category) ||
            !refused.some(({ sourceCategoryCode }) => sourceCategoryCode === category),
        )
      ) {
        throw new IngestionValidationError('DERIVATION_OPERANDS_INCOMPATIBLE');
      }
      const operand = (observation: (typeof observations)[number]) => ({
        id: observation.id,
        releaseId: observation.releaseId,
        datasetId,
        destinationIso3: observation.destinationIso3,
        populationBasis: observation.populationBasis,
        populationKey: observation.populationKey,
        programKey: observation.programKey,
        citizenshipIso3: observation.citizenshipIso3,
        purposeCode: observation.purposeCode,
        metricType: observation.metricType,
        sourceCategoryCode: observation.sourceCategoryCode,
        period: observation.period,
        unit: observation.unit,
        value: observation.value,
        dataStatus: observation.dataStatus,
        methodologyVersion: observation.comparisonGroup.methodologyVersion,
        completePeriod: /^\d{4}$/.test(observation.period),
        estimated: observation.dataStatus === 'ESTIMATED',
      });
      const grantedOperands = granted.map(operand);
      const refusedOperands = refused.map(operand);
      for (const formula of [MetricType.APPROVAL_RATE, MetricType.REFUSAL_RATE] as const) {
        let derived;
        try {
          derived = this.metricDerivation.deriveRate({
            formula,
            numerator: formula === MetricType.APPROVAL_RATE ? grantedOperands : refusedOperands,
            denominator: [...grantedOperands, ...refusedOperands],
          });
        } catch (error: unknown) {
          throw new IngestionValidationError(
            error instanceof Error ? error.message : 'DERIVATION_FAILED',
          );
        }
        const source = observations[0];
        if (!source) throw new IngestionValidationError('DERIVATION_OPERANDS_INCOMPATIBLE');
        const comparisonGroupId = this.comparisonGroupId(datasetId, {
          destinationIso3: source.destinationIso3,
          citizenshipIso3: source.citizenshipIso3,
          populationBasis: source.populationBasis,
          populationKey: source.populationKey,
          programKey: source.programKey,
          purpose: source.purposeCode,
          metricType: derived.metricType,
          sourceCategoryCode: `DERIVED:${source.programKey}`,
          sourceCategoryLabel: 'Conjunto revisado de modalidades · taxa derivada',
          period: source.period,
          unit: derived.unit,
          value: derived.value,
          dataStatus: derived.dataStatus,
          methodologyVersion: source.comparisonGroup.methodologyVersion,
        });
        await transaction.comparisonGroup.createMany({
          data: [
            {
              id: comparisonGroupId,
              datasetId,
              metricType: derived.metricType,
              populationBasis: source.populationBasis,
              populationKey: source.populationKey,
              programKey: source.programKey,
              citizenshipIso3: source.citizenshipIso3,
              purposeCode: source.purposeCode,
              period: source.period,
              unit: derived.unit,
              methodologyVersion: source.comparisonGroup.methodologyVersion,
            },
          ],
          skipDuplicates: true,
        });
        const result = await transaction.metricObservation.create({
          data: {
            releaseId,
            destinationIso3: source.destinationIso3,
            populationBasis: source.populationBasis,
            populationKey: source.populationKey,
            programKey: source.programKey,
            citizenshipIso3: source.citizenshipIso3,
            purposeCode: source.purposeCode,
            metricType: derived.metricType,
            sourceCategoryCode: `DERIVED:${source.programKey}`,
            sourceCategoryLabel: 'Conjunto revisado de modalidades · taxa derivada',
            period: source.period,
            unit: derived.unit,
            value: derived.value,
            dataStatus: derived.dataStatus,
            precision: derived.precision,
            comparisonGroupId,
          },
        });
        await transaction.metricDerivation.create({
          data: {
            observationId: result.id,
            formula: derived.formula,
            precision: derived.precision,
            validatedAt: new Date(),
            qualityReport: { arithmetic: 'integer-half-up', denominator: 'issued+refused' },
            operands: {
              create: [
                ...(formula === MetricType.APPROVAL_RATE ? granted : refused).map(({ id }) => ({
                  observationId: id,
                  role: DerivationOperandRole.NUMERATOR_COMPONENT,
                })),
                ...granted.map(({ id }) => ({
                  observationId: id,
                  role: DerivationOperandRole.DENOMINATOR_COMPONENT,
                })),
                ...refused.map(({ id }) => ({
                  observationId: id,
                  role: DerivationOperandRole.DENOMINATOR_COMPONENT,
                })),
              ],
            },
          },
        });
        derivedObservationCount += 1;
      }
    }
    return derivedObservationCount;
  }

  private comparisonGroupId(datasetId: string, observation: StagedObservation): string {
    const scope = this.scopeFor(observation);
    return createHash('sha256')
      .update(
        [
          datasetId,
          observation.metricType,
          scope.populationBasis,
          scope.populationKey,
          scope.programKey,
          observation.purpose,
          observation.period,
          observation.unit,
          observation.methodologyVersion,
        ].join('|'),
      )
      .digest('hex');
  }

  private scopeFor(observation: StagedObservation): {
    populationBasis: PopulationBasis;
    populationKey: string;
    programKey: string;
  } {
    const populationBasis = observation.populationBasis ?? PopulationBasis.CITIZENSHIP;
    return {
      populationBasis,
      populationKey:
        observation.populationKey ??
        (populationBasis === PopulationBasis.NATIONAL
          ? 'ALL'
          : (observation.citizenshipIso3 ?? '')),
      programKey: observation.programKey ?? 'ALL',
    };
  }

  private readonly bigIntReplacer = (_key: string, value: unknown): unknown =>
    typeof value === 'bigint' ? value.toString() : value;
}
