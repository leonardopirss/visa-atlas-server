import { readFile } from 'node:fs/promises';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service.js';

const CATALOG_URL = new URL('../data/world-country-catalog.v1.json', import.meta.url);
const ISO2_PATTERN = /^[A-Z]{2}$/;
const ISO3_PATTERN = /^[A-Z]{3}$/;

export interface CatalogCountry {
  readonly iso2: string;
  readonly iso3: string;
  readonly namePt: string;
  readonly region: string;
}

export interface CountryCatalog {
  readonly schemaVersion: number;
  readonly catalogVersion: string;
  readonly source: {
    readonly name: string;
    readonly version: string;
    readonly url: string;
    readonly sourceSha256: string;
    readonly names: string;
  };
  readonly license: {
    readonly spdx: string;
    readonly url: string;
    readonly notice: string;
  };
  readonly countries: readonly CatalogCountry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Country catalog field ${key} must be a non-empty string`);
  }
  return value;
}

export function parseCountryCatalog(value: unknown): CountryCatalog {
  if (!isRecord(value) || !isRecord(value.source) || !isRecord(value.license)) {
    throw new TypeError('Country catalog metadata is invalid');
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.countries)) {
    throw new TypeError('Country catalog schema version or entries are invalid');
  }

  const seenIso2 = new Set<string>();
  const seenIso3 = new Set<string>();
  const countries = value.countries.map((entry): CatalogCountry => {
    if (!isRecord(entry)) throw new TypeError('Country catalog entry must be an object');
    const country = {
      iso2: readRequiredString(entry, 'iso2'),
      iso3: readRequiredString(entry, 'iso3'),
      namePt: readRequiredString(entry, 'namePt'),
      region: readRequiredString(entry, 'region'),
    };
    if (!ISO2_PATTERN.test(country.iso2) || !ISO3_PATTERN.test(country.iso3)) {
      throw new TypeError(`Country catalog contains invalid ISO codes for ${country.iso3}`);
    }
    if (seenIso2.has(country.iso2) || seenIso3.has(country.iso3)) {
      throw new TypeError(`Country catalog contains a duplicate code for ${country.iso3}`);
    }
    seenIso2.add(country.iso2);
    seenIso3.add(country.iso3);
    return country;
  });

  return {
    schemaVersion: 1,
    catalogVersion: readRequiredString(value, 'catalogVersion'),
    source: {
      name: readRequiredString(value.source, 'name'),
      version: readRequiredString(value.source, 'version'),
      url: readRequiredString(value.source, 'url'),
      sourceSha256: readRequiredString(value.source, 'sourceSha256'),
      names: readRequiredString(value.source, 'names'),
    },
    license: {
      spdx: readRequiredString(value.license, 'spdx'),
      url: readRequiredString(value.license, 'url'),
      notice: readRequiredString(value.license, 'notice'),
    },
    countries,
  };
}

export async function loadCountryCatalog(): Promise<CountryCatalog> {
  const source = await readFile(CATALOG_URL, 'utf8');
  const value: unknown = JSON.parse(source);
  return parseCountryCatalog(value);
}

@Injectable()
export class CountryCatalogService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.synchronize();
  }

  async synchronize(): Promise<number> {
    const catalog = await loadCountryCatalog();
    await this.prisma.$transaction(
      catalog.countries.map((country) =>
        this.prisma.country.upsert({
          where: { iso3: country.iso3 },
          create: country,
          update: {
            iso2: country.iso2,
            namePt: country.namePt,
            region: country.region,
          },
        }),
      ),
    );
    return catalog.countries.length;
  }
}
