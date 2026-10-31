import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { CountryDto } from '../../common/contracts/public-api.types.js';
import type { ListCountriesQueryDto } from './dto/list-countries-query.dto.js';

@Injectable()
export class CountriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: RedisCacheService,
  ) {}

  list(query: ListCountriesQueryDto) {
    if (!this.cache) return this.loadList(query);
    return this.cache.getOrLoad({
      group: 'countries',
      route: 'countries',
      releaseVersion: 'country-catalog-v1',
      query: {
        ...query,
        search: query.search?.trim().toLocaleLowerCase('pt-BR'),
      },
      load: () => this.loadList(query),
    });
  }

  private async loadList(query: ListCountriesQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.CountryWhereInput = search
      ? {
          OR: [
            { namePt: { contains: search, mode: 'insensitive' } },
            { iso3: { contains: search.toUpperCase() } },
            { iso2: { contains: search.toUpperCase() } },
          ],
        }
      : {};
    const [countries, total] = await this.prisma.$transaction([
      this.prisma.country.findMany({
        where,
        orderBy: { namePt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.country.count({ where }),
    ]);
    return {
      data: countries.map(this.presentCountry),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private readonly presentCountry = (country: {
    iso3: string;
    iso2: string;
    namePt: string;
    region: string;
  }): CountryDto => ({
    iso3: country.iso3,
    iso2: country.iso2,
    name: country.namePt,
    region: country.region,
  });
}
