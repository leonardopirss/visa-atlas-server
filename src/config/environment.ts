interface Environment {
  DATABASE_URL: string;
  PORT: number;
  CORS_ORIGINS: string;
  CACHE_TTL_SECONDS: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_MAX: number;
}

function positiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const databaseUrl = input.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return {
    DATABASE_URL: databaseUrl,
    PORT: positiveInteger(input.PORT, 3000, 'PORT'),
    CORS_ORIGINS:
      typeof input.CORS_ORIGINS === 'string' ? input.CORS_ORIGINS : 'http://localhost:5173',
    CACHE_TTL_SECONDS: positiveInteger(input.CACHE_TTL_SECONDS, 60, 'CACHE_TTL_SECONDS'),
    RATE_LIMIT_TTL_MS: positiveInteger(input.RATE_LIMIT_TTL_MS, 60_000, 'RATE_LIMIT_TTL_MS'),
    RATE_LIMIT_MAX: positiveInteger(input.RATE_LIMIT_MAX, 120, 'RATE_LIMIT_MAX'),
  };
}
