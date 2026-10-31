import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService);
  const trustProxy = config.get<string | false>('TRUST_PROXY', false);
  if (trustProxy !== false) {
    const instance = app.getHttpAdapter().getInstance() as {
      set(name: string, value: string): void;
    };
    instance.set('trust proxy', trustProxy);
  }
  const origins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: origins, methods: ['GET'], credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
