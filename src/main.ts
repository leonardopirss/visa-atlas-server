import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApplication } from './bootstrap.js';
import { InitialIngestionService } from './modules/ingestion/initial-ingestion.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApplication(app);
  const config = app.get(ConfigService);
  await app.init();
  await app.get(InitialIngestionService).runMissing();
  await app.listen(config.get<number>('PORT', 3000), '0.0.0.0');
}

void bootstrap();
