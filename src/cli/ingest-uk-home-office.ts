import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { UkHomeOfficeIngestionRunner } from '../modules/ingestion/uk-home-office-ingestion-runner.service.js';

const logger = new Logger('UkHomeOfficeIngestionCli');

async function main(): Promise<void> {
  const sourceUrlArgument = process.argv.find((argument) => argument.startsWith('--source-url='));
  const sourceUrl = sourceUrlArgument?.slice('--source-url='.length);
  if (sourceUrl !== undefined) {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'assets.publishing.service.gov.uk') {
      throw new Error('source-url must use the official GOV.UK asset host');
    }
  }
  const application = await NestFactory.createApplicationContext(AppModule);
  try {
    const result = await application.get(UkHomeOfficeIngestionRunner).run(sourceUrl);
    logger.log(JSON.stringify({ event: 'uk-home-office.ingestion.finished', ...result }));
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : 'Unknown ingestion failure';
  logger.error(JSON.stringify({ event: 'uk-home-office.ingestion.failed', reason }));
  process.exitCode = 1;
});
