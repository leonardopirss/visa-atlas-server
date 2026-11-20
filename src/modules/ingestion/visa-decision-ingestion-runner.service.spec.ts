import { jest } from '@jest/globals';
import {
  DataStatus,
  MetricType,
  PopulationBasis,
  ReleaseStatus,
  VisaPurposeCode,
} from '@prisma/client';
import type { VisaDecisionAdapter } from './adapters/visa-insights/visa-decision.adapter.js';
import type { VisaDecisionReferenceDataService } from './adapters/visa-insights/visa-decision-reference-data.service.js';
import type { VisaDecisionObservation } from './adapters/visa-insights/visa-decision.types.js';
import type { VisaDecisionWorkbookReader } from './adapters/visa-insights/visa-decision-workbook.reader.js';
import type { IngestionService } from './ingestion.service.js';
import type { PublishReleaseService } from './services/publish-release.service.js';
import type { DecisionInsightValidator } from './validation/decision-insight.validator.js';
import { VisaDecisionIngestionRunner } from './visa-decision-ingestion-runner.service.js';

const observations: VisaDecisionObservation[] = [
  {
    destinationIso3: 'GBR',
    citizenshipIso3: 'BRA',
    populationBasis: PopulationBasis.CITIZENSHIP,
    populationKey: 'BRA',
    programKey: 'uk-entry-clearance:work',
    purpose: VisaPurposeCode.WORK,
    metricType: MetricType.DECISIONS_GRANTED,
    sourceCategoryCode: 'Worker:Skilled Worker',
    sourceCategoryLabel: 'Worker — Skilled Worker · Issued',
    period: '2025',
    unit: 'COUNT',
    value: 10n,
    dataStatus: DataStatus.AVAILABLE,
    methodologyVersion: 'vis-d02-bra-reviewed-v1',
  },
];

describe('VisaDecisionIngestionRunner', () => {
  const reader = { read: jest.fn(() => [['source']]) };
  const adapter = { parse: jest.fn(() => observations) };
  const validator = { validate: jest.fn() };
  const synchronize = jest.fn<() => Promise<void>>();
  synchronize.mockResolvedValue(undefined);
  const referenceData = { synchronize };
  const stage = jest.fn<IngestionService['stage']>();
  stage.mockResolvedValue({
    releaseId: 'release-vis-d02-2025',
    duplicate: false,
    status: ReleaseStatus.VERIFIED,
  });
  const ingestion = { stage };
  const publish = jest.fn<PublishReleaseService['publish']>();
  publish.mockResolvedValue(undefined);
  const publisher = { publish };
  const runner = new VisaDecisionIngestionRunner(
    reader as unknown as VisaDecisionWorkbookReader,
    adapter as unknown as VisaDecisionAdapter,
    validator as unknown as DecisionInsightValidator,
    referenceData as unknown as VisaDecisionReferenceDataService,
    ingestion as unknown as IngestionService,
    publisher as unknown as PublishReleaseService,
  );
  const release = {
    rawPayload: 'base64-workbook',
    workbook: Buffer.from('workbook'),
    sourceUrl: 'https://assets.publishing.service.gov.uk/vis-d02.xlsx',
    fetchedAt: new Date('2026-11-17T00:00:00Z'),
    sourcePublishedAt: new Date('2026-11-10T00:00:00Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('validates, stages and publishes the complete Vis_D02 release', async () => {
    await expect(runner.run({ release })).resolves.toEqual({
      releaseId: 'release-vis-d02-2025',
      duplicate: false,
      published: true,
      observationCount: 1,
      sourceUrl: release.sourceUrl,
      sourcePublishedAt: '2026-11-10T00:00:00.000Z',
    });
    expect(reader.read).toHaveBeenCalledWith(release.workbook);
    expect(adapter.parse).toHaveBeenCalledWith([['source']]);
    expect(validator.validate).toHaveBeenCalledWith(observations);
    expect(referenceData.synchronize).toHaveBeenCalledTimes(1);
    expect(ingestion.stage).toHaveBeenCalledWith({
      datasetId: 'uk-home-office-vis-d02',
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });
    expect(publisher.publish).toHaveBeenCalledWith('release-vis-d02-2025');
  });

  it('supports an explicit verified-only run without publication', async () => {
    await expect(runner.run({ release, publish: false })).resolves.toMatchObject({
      published: false,
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('fails closed for a checksum that was previously rejected', async () => {
    ingestion.stage.mockResolvedValueOnce({
      releaseId: 'rejected-release',
      duplicate: true,
      status: ReleaseStatus.REJECTED,
    });
    await expect(runner.run({ release })).rejects.toThrow(
      'VISA_DECISION_RELEASE_PREVIOUSLY_REJECTED',
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
